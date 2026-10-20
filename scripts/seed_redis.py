#!/usr/bin/env python3
"""Load the films built by scripts/build_data.py into the Redis film store. Standard library only:

    python3 scripts/seed_redis.py [--env-file .env.local]

Reads KV_REST_API_URL and KV_REST_API_TOKEN (Upstash REST) from the environment or from the env file, which
`vercel env pull .env.local` fills once the store is connected. Catalog films are added or updated. Films that
left catalog.txt are removed. Films that came in through suggestions are left alone.
"""
import json
import sys
from pathlib import Path
from urllib.request import Request, urlopen

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from build_data import OUTPUT, env_values  # noqa: E402

FILMS = "retroreel:films"
TMDB_IDS = "retroreel:tmdb-ids"
CATALOG_IDS = "retroreel:catalog-ids"


def settings():
    values = env_values(["KV_REST_API_URL", "KV_REST_API_TOKEN"])
    if not all(values.values()):
        raise SystemExit("Set KV_REST_API_URL and KV_REST_API_TOKEN, or run `vercel env pull .env.local` first")
    return values["KV_REST_API_URL"].rstrip("/"), values["KV_REST_API_TOKEN"]


def pipeline(url, token, commands):
    """Runs Redis commands through Upstash's REST pipeline and returns their results."""
    request = Request(f"{url}/pipeline", data=json.dumps(commands).encode(),
                      headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    with urlopen(request, timeout=60) as response:
        answers = json.load(response)
    errors = [answer["error"] for answer in answers if "error" in answer]
    if errors:
        raise SystemExit(f"Redis refused: {errors[0]}")
    return [answer.get("result") for answer in answers]


def main():
    url, token = settings()
    data = json.loads(OUTPUT.read_text())
    films = data["films"]
    ids = {film["id"] for film in films}
    [previous] = pipeline(url, token, [["SMEMBERS", CATALOG_IDS]])
    gone = sorted(set(previous or []) - ids)
    commands = []
    if gone:
        # The TMDB ids of the films that leave, so they can be suggested again.
        stored = pipeline(url, token, [["HMGET", FILMS, *gone]])[0]
        gone_tmdb = [str(json.loads(film)["tmdb"]["id"]) for film in stored if film and json.loads(film).get("tmdb")]
        commands.append(["HDEL", FILMS, *gone])
        if gone_tmdb:
            commands.append(["SREM", TMDB_IDS, *gone_tmdb])
    for start in range(0, len(films), 50):
        batch = films[start:start + 50]
        commands.append(["HSET", FILMS, *[part for film in batch for part in (film["id"], json.dumps(film, ensure_ascii=False))]])
    commands.append(["SADD", TMDB_IDS, *[str(film["tmdb"]["id"]) for film in films if film["tmdb"]]])
    commands.append(["DEL", CATALOG_IDS])
    commands.append(["SADD", CATALOG_IDS, *sorted(ids)])
    pipeline(url, token, commands)
    [total] = pipeline(url, token, [["HLEN", FILMS]])
    print(f"seeded {len(films)} catalog films, removed {len(gone)}; the store now holds {total} films")


if __name__ == "__main__":
    sys.exit(main())
