import type {Film} from '../src/types';
import {handle, json} from './_lib/http.js';
import {FILMS, redis} from './_lib/store.js';

/** GET /api/films: every film on the timeline. The CDN serves it for 5 minutes, then refreshes it in the background. */
export function GET() {
  return handle(async () => {
    const stored = (await redis().hgetall<Record<string, Film>>(FILMS)) ?? {};
    const films = Object.values(stored).sort(
      (first, second) => first.date.localeCompare(second.date) || first.title.localeCompare(second.title),
    );
    return json({films}, {headers: {'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400'}});
  });
}
