import type {Film} from '../src/types';
import {buildFilm} from './_lib/film.js';
import {clientIp, handle, HttpError, json, readJson} from './_lib/http.js';
import {MATCHES, PENDING, rateLimit, redis, TMDB_IDS} from './_lib/store.js';
import {findMovie} from './_lib/tmdb.js';

const BATCH = 40;
const NOT_FOUND = {none: true};
type Cached = Film | typeof NOT_FOUND;

interface Wanted {
  title: string;
  year: number | null;
  tmdbId: number | null;
}

function wanted(value: unknown): Wanted {
  const item = (value ?? {}) as Record<string, unknown>;
  const title = typeof item.title === 'string' ? item.title.trim().slice(0, 200) : '';
  const tmdbId = Number(item.tmdbId) || null;
  if (!title && !tmdbId) throw new HttpError(400, 'Each film needs a title or a TMDB id');
  // A watchlist can hold films announced years ahead: an odd year only means searching without one.
  const given = Number(item.year);
  const year = Number.isInteger(given) && given >= 1888 && given <= new Date().getFullYear() + 5 ? given : null;
  return {title, year, tmdbId};
}

/**
 * The film of a Letterboxd entry, built like a timeline film (poster, directors, country, scene, trailer), and
 * placed in Letterboxd's year like the catalog. The export has no TMDB id, so those films are searched first.
 */
async function lookUp(item: Wanted): Promise<Cached> {
  try {
    const tmdbId = item.tmdbId ?? (await findMovie(item.title, item.year))?.tmdbId;
    if (!tmdbId) return NOT_FOUND;
    return await buildFilm(tmdbId, {note: '', year: item.year});
  } catch {
    return NOT_FOUND;
  }
}

/**
 * POST /api/match { films: [{ title, year, tmdbId? }] }: the TMDB film of each Letterboxd film, with its timeline
 * status. Used for the visitor's films that are not on the timeline: the list to add from, and the personal layer.
 * Answers are kept in Redis, so each film is looked up once.
 */
export function POST(request: Request) {
  return handle(async () => {
    const body = await readJson(request);
    if (!Array.isArray(body.films) || body.films.length === 0) throw new HttpError(400, 'Give a list of films');
    if (body.films.length > BATCH) throw new HttpError(400, `At most ${BATCH} films at a time`);
    const items = body.films.map(wanted);
    // A first visit with 5,000 Letterboxd films takes 125 calls; every later visit reads the browser's copy.
    await rateLimit(`match:${clientIp(request)}`, 300, 3600);
    const store = redis();
    const keys = items.map(item =>
      item.tmdbId ? `id:${item.tmdbId}|${item.year ?? ''}` : `${item.title}|${item.year ?? ''}`,
    );
    const cached = (await store.hmget<Record<string, Cached>>(MATCHES, ...keys)) ?? {};
    const missing = [...new Set(keys.filter(key => !cached[key]))];
    // A few at a time: TMDB allows about 40 requests a second, and a search plus a details call is two.
    for (let start = 0; start < missing.length; start += 8) {
      const batch = missing.slice(start, start + 8);
      const found = await Promise.all(batch.map(key => lookUp(items[keys.indexOf(key)])));
      const fresh = Object.fromEntries(batch.map((key, index) => [key, found[index]]));
      await store.hset(MATCHES, fresh);
      Object.assign(cached, fresh);
    }
    const films = keys.map(key => {
      const match = cached[key];
      return match && 'tmdb' in match && match.tmdb ? match : null;
    });
    const ids = films.filter((film): film is Film => film !== null).map(film => String(film.tmdb!.id));
    const status = new Map<string, 'published' | 'pending' | null>();
    if (ids.length) {
      const pipeline = store.pipeline();
      pipeline.smismember(TMDB_IDS, ids);
      for (const id of ids) pipeline.hexists(PENDING, id);
      const [published, ...pending] = (await pipeline.exec()) as [number[], ...number[]];
      ids.forEach((id, index) => status.set(id, published[index] ? 'published' : pending[index] ? 'pending' : null));
    }
    return json({
      films: films.map(film => (film ? {...film, status: status.get(String(film.tmdb!.id)) ?? null} : null)),
    });
  });
}
