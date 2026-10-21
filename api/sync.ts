import {buildFilm, publish} from './_lib/film.js';
import {env, handle, HttpError, json, readJson} from './_lib/http.js';
import {readFeed} from './_lib/letterboxd.js';
import {isCron, isOwner} from './_lib/owner.js';
import {redis, SYNC_DONE, SYNC_SINCE, TMDB_IDS} from './_lib/store.js';
import {cleanNote} from './suggest.js';

/** Films added per run: each one takes a TMDB call, and a run must stay short. */
const PER_RUN = 10;

/**
 * Adds the films the owner logs on Letterboxd (OWNER_LETTERBOXD) to the timeline: every diary entry watched on
 * or after the day the sync started, for a film not on the timeline yet. The owner's review, if any, becomes the
 * note. A film the sync added once is never added again, even if the owner removes it.
 */
async function sync(dryRun: boolean, testSince: string | null = null) {
  const store = redis();
  const today = new Date().toISOString().slice(0, 10);
  let since = testSince ?? (await store.get<string>(SYNC_SINCE));
  if (!since) {
    since = today;
    if (!dryRun) await store.set(SYNC_SINCE, since);
  }
  const feed = await readFeed(env('OWNER_LETTERBOXD'));
  const fresh = feed.entries.filter(entry => entry.watchedDate && entry.watchedDate >= since);
  const ids = [...new Set(fresh.map(entry => String(entry.tmdbId)))];
  if (ids.length === 0) return {since, added: [], waiting: 0};
  const pipeline = store.pipeline();
  pipeline.smismember(TMDB_IDS, ids);
  pipeline.smismember(SYNC_DONE, ids);
  const [published, done] = (await pipeline.exec()) as [number[], number[]];
  const todo = ids.filter((_id, index) => !published[index] && !done[index]);
  const added = [];
  for (const id of todo.slice(0, PER_RUN)) {
    const entry = fresh.find(item => String(item.tmdbId) === id)!;
    if (dryRun) {
      added.push({tmdbId: entry.tmdbId, title: entry.title, year: entry.year, note: cleanNote(entry.review ?? '')});
      continue;
    }
    // Letterboxd's year, like the catalog's: TMDB sometimes counts the release after the festival premiere.
    const film = await buildFilm(entry.tmdbId, {note: cleanNote(entry.review ?? ''), year: entry.year});
    added.push(await publish(film));
    await store.sadd(SYNC_DONE, id);
  }
  return {since, added, waiting: Math.max(0, todo.length - PER_RUN)};
}

/** GET /api/sync: the daily Vercel Cron run (see vercel.json). */
export function GET(request: Request) {
  return handle(async () => {
    if (!isCron(request)) throw new HttpError(403, 'Only the scheduled run can call this');
    return json(await sync(false));
  });
}

/**
 * POST /api/sync { dryRun?, since? }: the same run, started by the owner's page. A dry run lists what it would add
 * without adding it, from the given day ("YYYY-MM-DD") if any.
 */
export function POST(request: Request) {
  return handle(async () => {
    if (!isOwner(request)) throw new HttpError(403, 'Only the site owner can sync the feed');
    const body = await readJson(request);
    const since = typeof body.since === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.since) ? body.since : null;
    return json(await sync(body.dryRun === true, body.dryRun === true ? since : null));
  });
}
