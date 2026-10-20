#!/usr/bin/env python3
"""Build the timeline films of scripts/catalog.txt with TMDB data. Standard library only:

    python3 scripts/build_data.py [--env-file .env.local]

Reads TMDB_API_KEY (the v3 API key, or the v4 read access token) from the environment or the env file. Each
catalog line names its film by TMDB id (the "id:" column that scripts/pin_ids.py fills); a line without one is
searched by title and year. TMDB answers are cached in scripts/.cache/tmdb/. The films go to
scripts/.cache/films.json, which scripts/seed_redis.py loads into Redis.
"""
import json
import os
import re
import sys
import time
import unicodedata
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

HERE = Path(__file__).resolve().parent
CATALOG = HERE / "catalog.txt"
CACHE = HERE / ".cache" / "tmdb"
OUTPUT = HERE / ".cache" / "films.json"
API = "https://api.themoviedb.org/3"
SCENES = {"silent", "classic", "romance", "crime", "western", "epic", "realism", "arthouse", "newhollywood",
          "horror", "scifi", "action", "comedy", "musical", "animation", "indie", "doc"}


def env_values(names):
    """Values from the environment, else from the env file (default .env.local, as `vercel env pull` writes)."""
    values = {name: os.environ.get(name) for name in names}
    env_file = Path(sys.argv[sys.argv.index("--env-file") + 1] if "--env-file" in sys.argv else ".env.local")
    if not all(values.values()) and env_file.exists():
        for line in env_file.read_text().splitlines():
            name, _, value = line.partition("=")
            if name in values and not values[name]:
                values[name] = value.strip().strip('"')
    return values


def normalize(text):
    text = unicodedata.normalize("NFKD", text)
    text = "".join(char for char in text if not unicodedata.combining(char)).lower().replace("&", " and ")
    return re.sub(r"^(the|a|an) ", "", re.sub(r"[^a-z0-9]+", " ", text).strip())


def slug(text):
    """Same as api/_lib/names.ts: "Seven Samurai 1954" becomes "seven-samurai-1954"."""
    text = unicodedata.normalize("NFKD", text)
    text = "".join(char for char in text if not unicodedata.combining(char)).lower().replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


class Tmdb:
    def __init__(self, credential):
        self.credential = credential
        self.bearer = credential.startswith("eyJ")

    def get(self, path, params=None, cache_name=None):
        cache_file = CACHE / f"{cache_name}.json" if cache_name else None
        if cache_file and cache_file.exists():
            return json.loads(cache_file.read_text())
        query = {"language": "en-US", **(params or {})}
        if not self.bearer:
            query["api_key"] = self.credential
        headers = {"Accept": "application/json", "User-Agent": "retroreel/0.1"}
        if self.bearer:
            headers["Authorization"] = f"Bearer {self.credential}"
        for attempt in range(5):
            try:
                with urlopen(Request(f"{API}/{path}?{urlencode(query)}", headers=headers), timeout=30) as response:
                    answer = json.load(response)
                break
            except HTTPError as error:
                if error.code == 429 and attempt < 4:
                    time.sleep(2 * (attempt + 1))
                    continue
                if error.code == 401:
                    raise SystemExit("TMDB refused the key: check TMDB_API_KEY")
                raise
        if cache_file:
            CACHE.mkdir(parents=True, exist_ok=True)
            cache_file.write_text(json.dumps(answer, ensure_ascii=False))
        return answer

    def details(self, tmdb_id):
        return self.get(f"movie/{tmdb_id}", {"append_to_response": "credits,videos"},
                        cache_name=f"movie-{tmdb_id}")

    def search(self, title, year):
        params = {"query": title, "include_adult": "false"}
        if year:
            params["primary_release_year"] = str(year)
        return self.get("search/movie", params, cache_name=f"search-{slug(title)}-{year or 'any'}")["results"]


def parse_catalog():
    films = []
    for number, line in enumerate(CATALOG.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip() or line.startswith("#"):
            continue
        parts = [part.strip() for part in line.split(" | ")]
        if len(parts) < 5:
            raise SystemExit(f"catalog.txt line {number}: expected year | director | title | scene | note")
        extras = {part.split(":", 1)[0]: part.split(":", 1)[1] for part in parts[5:] if ":" in part}
        if parts[3] not in SCENES:
            raise SystemExit(f"catalog.txt line {number}: unknown scene {parts[3]!r}")
        films.append({"line": number, "year": int(parts[0]), "directors": parts[1].split(" & "), "title": parts[2],
                      "scene": parts[3], "note": parts[4], "extras": extras})
    return films


def directors_of(details):
    return [member["name"] for member in details.get("credits", {}).get("crew", []) if member.get("job") == "Director"]


def same_director(entry, details):
    names = [normalize(name).replace(" ", "") for name in directors_of(details)]
    return any(normalize(director).split(" ")[-1] in name for director in entry["directors"] for name in names)


def find(tmdb, entry):
    """The TMDB film of a catalog line without an id: the search result with the same director."""
    query = entry["extras"].get("q", entry["title"])
    for year in (entry["year"], entry["year"] - 1, entry["year"] + 1, None):
        for result in tmdb.search(query, year)[:5]:
            details = tmdb.details(result["id"])
            if same_director(entry, details):
                return details
    return None


def trailer_key(details):
    videos = [video for video in details.get("videos", {}).get("results", []) if video.get("site") == "YouTube"]

    def score(video):
        kind = {"Trailer": 4, "Teaser": 2}.get(video.get("type"), 0)
        return kind + (2 if video.get("official") else 0) + (1 if video.get("iso_639_1") == "en" else 0)

    best = max(videos, key=score, default=None)
    return best["key"] if best and best.get("type") in ("Trailer", "Teaser") else None


def build(entry, details):
    release = details.get("release_date") or ""
    year = entry["year"]
    original = details.get("original_title") or ""
    country = entry["extras"].get("c") or (details.get("origin_country") or [None])[0] or next(
        (item["iso_3166_1"] for item in details.get("production_countries", [])), None)
    return {
        "id": slug(f"{entry['title']} {year}"),
        "year": year,
        "date": release if release[:4] == str(year) and len(release) == 10 else str(year),
        "title": entry["title"],
        "originalTitle": original if original and normalize(original) != normalize(entry["title"]) else None,
        "directors": entry["directors"],
        "scene": entry["scene"],
        "country": country,
        "runtime": details.get("runtime") or None,
        "note": entry["note"],
        "tmdb": {
            "id": details["id"],
            "poster": details.get("poster_path"),
            "backdrop": details.get("backdrop_path"),
            "imdbId": details.get("imdb_id") or None,
            "trailer": trailer_key(details),
        },
    }


def main():
    credential = env_values(["TMDB_API_KEY"])["TMDB_API_KEY"]
    if not credential:
        raise SystemExit("Set TMDB_API_KEY (https://www.themoviedb.org/settings/api), or add it to .env.local")
    tmdb = Tmdb(credential)
    entries = parse_catalog()
    films, missing, other_director = [], [], []
    for number, entry in enumerate(entries, start=1):
        details = tmdb.details(int(entry["extras"]["id"])) if "id" in entry["extras"] else find(tmdb, entry)
        if not details:
            missing.append(entry)
            continue
        if not same_director(entry, details):
            other_director.append(f"  line {entry['line']}: {entry['title']} -> TMDB {details['id']} "
                                  f"{details.get('title')!r} by {', '.join(directors_of(details)) or 'nobody'}")
        film = build(entry, details)
        if any(other["id"] == film["id"] for other in films):
            film["id"] = f"{film['id']}-{details['id']}"
        films.append(film)
        if number % 50 == 0:
            print(f"  {number}/{len(entries)}", flush=True)
    OUTPUT.parent.mkdir(exist_ok=True)
    OUTPUT.write_text(json.dumps({"films": films}, ensure_ascii=False, indent=1))
    print(f"built {len(films)} films into {OUTPUT.relative_to(HERE.parent)}")
    without = lambda key: [film["title"] for film in films if not film["tmdb"][key]]
    print(f"no poster: {', '.join(without('poster')) or '-'}")
    print(f"no trailer: {len(without('trailer'))} films")
    if other_director:
        print("TMDB names another director, check the id:\n" + "\n".join(other_director))
    if missing:
        print("not found on TMDB, add id:<TMDB id>:")
        for entry in missing:
            print(f"  line {entry['line']}: {entry['year']} {entry['title']}")


if __name__ == "__main__":
    sys.exit(main())
