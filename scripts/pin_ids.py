#!/usr/bin/env python3
"""Check the catalog against Wikidata and pin each film to its TMDB id. No key needed, standard library only:

    python3 scripts/pin_ids.py [--write]

For every catalog line without an "id:" column, it looks for a Wikidata film with that English title (or alias),
a release within one year and the same director, and reads its TMDB id. Lines it cannot match are looked up a
second time by director and year, with a looser title match. It prints what it could not match or found doubtful,
and with --write it adds "id:<TMDB id>" to the lines it matched. Answers are cached in scripts/.cache/wikidata.json.
"""
import difflib
import json
import re
import sys
import time
import unicodedata
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

HERE = Path(__file__).resolve().parent
CATALOG = HERE / "catalog.txt"
CACHE = HERE / ".cache" / "wikidata.json"
AGENT = "retroreel-catalog/0.1 (https://retroreel.vumble.dev)"
SPARQL = "https://query.wikidata.org/sparql"


def normalize(text):
    text = unicodedata.normalize("NFKD", text)
    text = "".join(char for char in text if not unicodedata.combining(char)).lower().replace("&", " and ")
    return re.sub(r"^(the|a|an) ", "", re.sub(r"[^a-z0-9]+", " ", text).strip())


def parse(line):
    """Returns the catalog columns of a line, or None for comments and blank lines."""
    if not line.strip() or line.startswith("#"):
        return None
    parts = [part.strip() for part in line.split(" | ")]
    extras = {part.split(":", 1)[0]: part.split(":", 1)[1] for part in parts[5:] if ":" in part}
    return {"year": int(parts[0]), "directors": parts[1].split(" & "), "title": parts[2], "extras": extras}


def load_cache():
    return json.loads(CACHE.read_text()) if CACHE.exists() else {}


def query(sparql, cache):
    if sparql in cache:
        return cache[sparql]
    request = Request(f"{SPARQL}?{urlencode({'query': sparql})}",
                      headers={"Accept": "application/sparql-results+json", "User-Agent": AGENT})
    for attempt in range(4):
        try:
            with urlopen(request, timeout=90) as response:
                rows = json.load(response)["results"]["bindings"]
            break
        except Exception as error:  # Busy or timed out: wait and try again.
            if attempt == 3:
                raise
            print(f"  wikidata: {error}, retrying", flush=True)
            time.sleep(5 * (attempt + 1))
    answer = [{key: value["value"] for key, value in row.items()} for row in rows]
    cache[sparql] = answer
    return answer


def literal(text, language="en"):
    return '"' + text.replace("\\", "\\\\").replace('"', '\\"') + f'"@{language}'


def literals(text):
    """English and multilingual ("mul", which many items now use for their main name) forms of a name."""
    return f"{literal(text)} {literal(text, 'mul')}"


FIELDS = """?film wdt:P4947 ?tmdb .
  OPTIONAL { ?film wdt:P577 ?date }
  OPTIONAL { ?film wdt:P57 ?director . ?director rdfs:label ?directorName . FILTER(LANG(?directorName) IN ("en", "mul")) }
  OPTIONAL { ?film rdfs:label ?label . FILTER(LANG(?label) IN ("en", "mul")) }"""

GROUPED = """(SAMPLE(?label) AS ?name) (MIN(YEAR(?date)) AS ?first) (GROUP_CONCAT(DISTINCT YEAR(?date); separator="|") AS ?years)
  (GROUP_CONCAT(DISTINCT ?directorName; separator="|") AS ?directors)"""


def by_titles(titles, cache):
    values = " ".join(literals(title) for title in titles)
    sparql = f"""SELECT ?title ?film ?tmdb {GROUPED} WHERE {{
  VALUES ?label_ {{ {values} }}
  {{ ?film rdfs:label ?label_ }} UNION {{ ?film skos:altLabel ?label_ }}
  BIND(STR(?label_) AS ?title)
  {FIELDS}
}} GROUP BY ?title ?film ?tmdb"""
    return query(sparql, cache)


def by_director(name, year, cache):
    sparql = f"""SELECT ?film ?tmdb {GROUPED} WHERE {{
  VALUES ?personName {{ {literals(name)} }}
  ?person rdfs:label ?personName .
  ?film wdt:P57 ?person ; wdt:P577 ?released .
  FILTER(YEAR(?released) >= {year - 1} && YEAR(?released) <= {year + 1})
  {FIELDS}
}} GROUP BY ?film ?tmdb"""
    return query(sparql, cache)


def same_director(film, candidate):
    names = [normalize(name) for name in candidate.get("directors", "").split("|") if name]
    if not names:
        return None
    # Compared without spaces too: "Hirokazu Kore-eda" is "Hirokazu Koreeda" on Wikidata.
    compact = [name.replace(" ", "") for name in names]
    for director in film["directors"]:
        wanted = normalize(director)
        surname = wanted.split(" ")[-1]
        if any(wanted == name or surname in name.split(" ") for name in names):
            return True
        if any(wanted.replace(" ", "") == name or name.endswith(wanted.split(" ", 1)[-1].replace(" ", "")) for name in compact):
            return True
    return False


def years_of(candidate):
    return [int(year) for year in candidate.get("years", "").split("|") if year.lstrip("-").isdigit()]


def year_gap(film, candidate):
    years = years_of(candidate)
    return min(abs(year - film["year"]) for year in years) if years else 99


def pick(film, candidates, title_needed):
    """The best candidate: right director, closest year, and with title_needed a close title."""
    scored = []
    for candidate in candidates:
        gap = year_gap(film, candidate)
        director = same_director(film, candidate)
        if gap > 1 or director is False:
            continue
        similarity = difflib.SequenceMatcher(None, normalize(film["title"]), normalize(candidate.get("name", ""))).ratio()
        if title_needed and similarity < 0.5:
            continue
        scored.append((director is True, -gap, similarity, candidate))
    if not scored:
        return None
    scored.sort(key=lambda item: item[:3], reverse=True)
    return scored[0][3]


def main():
    lines = CATALOG.read_text(encoding="utf-8").splitlines()
    films = [(index, parse(line)) for index, line in enumerate(lines)]
    todo = [(index, film) for index, film in films if film and "id" not in film["extras"]]
    print(f"{len(todo)} films to pin", flush=True)
    cache = load_cache()
    CACHE.parent.mkdir(exist_ok=True)
    found = {}
    try:
        titles = sorted({film["title"] for _, film in todo})
        candidates = {}
        for start in range(0, len(titles), 25):
            for row in by_titles(titles[start:start + 25], cache):
                candidates.setdefault(row["title"], []).append(row)
            print(f"  titles {min(start + 25, len(titles))}/{len(titles)}", flush=True)
        for index, film in todo:
            match = pick(film, candidates.get(film["title"], []), title_needed=False)
            if not match:
                for director in film["directors"]:
                    match = pick(film, by_director(director, film["year"], cache), title_needed=True)
                    if match:
                        break
            if match:
                found[index] = match
    finally:
        CACHE.write_text(json.dumps(cache, ensure_ascii=False))

    missing = [film for index, film in todo if index not in found]
    print(f"\nmatched {len(found)} of {len(todo)}")
    if missing:
        print("\nnot found on Wikidata (check title, year and director):")
        for film in missing:
            print(f"  {film['year']} | {' & '.join(film['directors'])} | {film['title']}")
    doubtful = []
    for index, match in found.items():
        film = parse(lines[index])
        notes = []
        if normalize(match.get("name", "")) != normalize(film["title"]):
            notes.append(f"Wikidata title {match.get('name')!r}")
        if film["year"] not in years_of(match):
            notes.append(f"Wikidata years {match.get('years')}")
        if same_director(film, match) is None:
            notes.append("no director on Wikidata")
        if notes:
            doubtful.append(f"  {film['year']} | {film['title']} -> tmdb {match['tmdb']}: {', '.join(notes)}")
    if doubtful:
        print("\nmatched, worth a look:")
        print("\n".join(doubtful))
    if "--write" in sys.argv:
        for index, match in found.items():
            lines[index] = f"{lines[index]} | id:{match['tmdb']}"
        CATALOG.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"\nwrote {len(found)} ids to {CATALOG.name}")


if __name__ == "__main__":
    sys.exit(main())
