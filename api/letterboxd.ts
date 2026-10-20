import { clientIp, handle, HttpError, json } from './_lib/http.js'
import { readFeed, USERNAME } from './_lib/letterboxd.js'
import { rateLimit } from './_lib/store.js'

/**
 * GET /api/letterboxd?user=: the member's latest diary entries, read from their public RSS feed, each with the
 * film's TMDB id. The feed has no CORS headers, so the page reads it through here. Cached for 10 minutes.
 */
export function GET(request: Request) {
  return handle(async () => {
    const user = (new URL(request.url).searchParams.get('user') ?? '').trim()
    if (!USERNAME.test(user)) throw new HttpError(400, 'That is not a Letterboxd username')
    await rateLimit(`letterboxd:${clientIp(request)}`, 60, 3600)
    return json(await readFeed(user), {
      headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' },
    })
  })
}
