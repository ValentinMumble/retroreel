import { clientIp, handle, HttpError, json } from './_lib/http.js'
import { rateLimit } from './_lib/store.js'
import { relatedMovies } from './_lib/tmdb.js'

const WEEK = 'public, s-maxage=604800, stale-while-revalidate=86400'

/** GET /api/related?id=: the films TMDB recommends next to this one, best first. */
export function GET(request: Request) {
  return handle(async () => {
    const id = Number(new URL(request.url).searchParams.get('id'))
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Give a TMDB film id')
    await rateLimit(`related:${clientIp(request)}`, 300, 3600)
    const films = (await relatedMovies(id)).map(({ tmdbId, title, year, poster }) => ({ tmdbId, title, year, poster }))
    return json({ films }, { headers: { 'Cache-Control': WEEK } })
  })
}
