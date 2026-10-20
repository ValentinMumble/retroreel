import { clientIp, handle, HttpError, json } from './_lib/http.js'
import { rateLimit } from './_lib/store.js'

/** Letterboxd usernames: letters, digits and underscores. */
const USERNAME = /^[A-Za-z0-9_]{1,40}$/

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decode(text: string) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (_match, name: string) => ENTITIES[name])
    .trim()
}

function tag(xml: string, name: string) {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml)
  return match ? decode(match[1]) : null
}

/**
 * GET /api/letterboxd?user=: the member's latest diary entries, read from their public RSS feed (Letterboxd has
 * no open API). The feed holds the latest 50 diary entries, each with the film's TMDB id. Cached for 10 minutes.
 */
export function GET(request: Request) {
  return handle(async () => {
    const user = (new URL(request.url).searchParams.get('user') ?? '').trim()
    if (!USERNAME.test(user)) throw new HttpError(400, 'That is not a Letterboxd username')
    await rateLimit(`letterboxd:${clientIp(request)}`, 60, 3600)
    const response = await fetch(`https://letterboxd.com/${user}/rss/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; retroreel/0.1; +https://retroreel.vumble.dev)',
        Accept: 'application/rss+xml, application/xml',
      },
    })
    if (response.status === 404) throw new HttpError(404, 'No Letterboxd member has that username')
    if (!response.ok) throw new HttpError(502, `Letterboxd answered ${response.status}, try again later`)
    const xml = await response.text()
    const channel = xml.split('<item>')[0]
    const name = (tag(channel, 'title') ?? user).replace(/^Letterboxd - /, '')
    const username = /letterboxd\.com\/([^/]+)\//.exec(tag(channel, 'link') ?? '')?.[1] ?? user
    const entries = xml
      .split('<item>')
      .slice(1)
      .map((item) => ({
        tmdbId: Number(tag(item, 'tmdb:movieId')),
        title: tag(item, 'letterboxd:filmTitle') ?? '',
        year: Number(tag(item, 'letterboxd:filmYear')) || null,
        watchedDate: tag(item, 'letterboxd:watchedDate'),
        rating: Number(tag(item, 'letterboxd:memberRating')) || null,
        liked: tag(item, 'letterboxd:memberLike') === 'Yes',
      }))
      // Lists and reviews without a watch are in the feed too: only diary entries name a film.
      .filter((entry) => entry.tmdbId > 0 && entry.title)
    return json(
      { username, name, entries },
      { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' } },
    )
  })
}
