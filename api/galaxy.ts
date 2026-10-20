import type { Film } from '../src/types'
import { handle, json } from './_lib/http.js'
import { galaxyLinks } from './_lib/links.js'
import { FILMS, redis, RELATED } from './_lib/store.js'

/** GET /api/galaxy: the links between films (see _lib/links.ts). Cached by the CDN for an hour. */
export function GET() {
  return handle(async () => {
    const store = redis()
    const [stored, related] = await Promise.all([
      store.hgetall<Record<string, Film>>(FILMS),
      store.hgetall<Record<string, number[]>>(RELATED),
    ])
    return json(galaxyLinks(Object.values(stored ?? {}), related ?? {}), {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    })
  })
}
