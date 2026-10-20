# 🎞️ Retroreel

A horizontal timeline of landmark films, from Georges Méliès's _A Trip to the Moon_ (1902) to today: the movie
twin of [Retrospin](https://retrospin.vumble.dev). Scroll, drag or use the arrow keys to travel through the years.
The posters turn as they pass, Cover Flow style. Click a poster to read a short note about the film, watch its
trailer and explore the films around it.

You can filter by scene, by country and by name, and, once you connect Letterboxd, see which films you have seen,
rated, liked or put on your watchlist.

## Letterboxd

Letterboxd has no open API: access is by application only, and Letterboxd does not grant it to personal projects.
So Retroreel reads the two public sources Letterboxd points members to:

- **The export file** (on Letterboxd: Settings, Data, Export your data). It holds the whole history: watched
  films, diary, ratings, likes, watchlist and the four favorite films. The page reads the ZIP (or the folder,
  since Safari unzips downloads) in the browser. Nothing is uploaded.
- **The profile's RSS feed**, which holds the latest 50 diary entries, each with the film's TMDB id. The feed has
  no CORS headers, so the page reads it through `GET /api/letterboxd?user=`. It refreshes on each visit, so films
  logged after the export show up too.

Feed entries match timeline films by TMDB id. Export entries have no id: they match by title and year, allowing
one year of difference (festival premiere against release). Everything stays in the browser's localStorage.

The Letterboxd dialog also lists the visitor's watched films that are not on the timeline (favorites, liked and
top rated first, or all of them), looked up on TMDB through `POST /api/match` and cached in Redis. The owner adds
them with one click, visitors suggest them.

The owner's own Letterboxd feed (`OWNER_LETTERBOXD`) feeds the timeline: every film logged from the day the sync
first ran, and not on the timeline yet, is added, with the review as its note. `/api/sync` runs once a day through
Vercel Cron (`vercel.json`), and each time the owner opens the site. A film it added is never added again, even
after the owner removes it.

## How it works

- The films live in a Redis store (Upstash, connected to the Vercel project) under `retroreel:*` keys. The page
  loads them from `GET /api/films`, which the CDN caches for five minutes.
- Film data, posters, trailers and recommendations come from [TMDB](https://www.themoviedb.org), the database
  Letterboxd itself uses. The Explore section of a film and the galaxy links use TMDB's recommendations.
- Anyone can suggest a film: search TMDB, pick the film, add an optional note. The server fetches the poster,
  trailer, director and country, and picks a scene from TMDB's genres and keywords. Suggestions wait for review.
- The site owner opens the site once as `/#owner=<OWNER_KEY>`. The key stays in that browser, a Review button
  appears, and the owner's own suggestions go live at once.

## Run it

```bash
npm install
npm run dev
```

`npm run dev` runs Vite on http://127.0.0.1:5191 and answers `/api/*` itself (`local-api.ts`), with the variables
of `.env.local`. Without a Redis store, the films come from `scripts/.cache/films.json` (see below) or, before any
TMDB build, straight from `scripts/catalog.txt`, without posters. Once the Vercel project is linked
(`vercel link`, `vercel env pull .env.local`), `npm start` runs `vercel dev` on the same port.

## Environment variables

| Name | Used by | What |
| --- | --- | --- |
| `TMDB_API_KEY` | API, data script | TMDB v3 API key or v4 read access token |
| `OWNER_KEY` | API | Any long random string: the site owner's key |
| `OWNER_LETTERBOXD` | API | The owner's Letterboxd username, whose new films the sync adds |
| `CRON_SECRET` | API | Any long random string: Vercel Cron sends it to `/api/sync` |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | API, seed script | Added by Vercel when the Upstash Redis store is connected |

## The hand-picked catalog

`scripts/catalog.txt` holds the hand-picked films, one per line as `year | director | title | scene | note`.
Optional extra columns: `id:<TMDB id>` picks the exact film, `q:<text>` changes the TMDB search, `c:<XX>` sets the
country. Three steps, Python 3 and the standard library only:

```bash
npm run pin
```

`scripts/pin_ids.py` checks each new line against Wikidata (title, year and director, no key needed) and adds its
TMDB id. It lists the lines it cannot match and the matches worth a look.

```bash
npm run data
```

`scripts/build_data.py` fetches each film from TMDB (answers cached in `scripts/.cache/tmdb/`) and writes
`scripts/.cache/films.json`, then `scripts/seed_redis.py` adds or updates the catalog films in Redis and removes
the ones that left the catalog. Films that came in through suggestions are left alone.

Scenes (the colors) are defined in `src/scenes.ts`, the era bands in `src/eras.ts`, the themes in `src/themes.ts`.

## Keyboard

| Key | Action |
| --- | --- |
| Left / Right | Move along the timeline, or to the previous / next film when one is open |
| Page Up / Page Down | Move by a screen |
| Home / End | Jump to the start / end |
| / | Search |
| Esc | Close the film |

## Credits

Film data and images from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.
Retroreel is not affiliated with Letterboxd.
