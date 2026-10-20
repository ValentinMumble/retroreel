import { HttpError } from './http.js'

/** Letterboxd usernames: letters, digits and underscores. */
export const USERNAME = /^[A-Za-z0-9_]{1,40}$/

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeEntities(text: string) {
  return text
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (_match, name: string) => ENTITIES[name])
}

function tag(xml: string, name: string) {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml)
  if (!match) return null
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(match[1])
  return cdata ? cdata[1].trim() : decodeEntities(match[1]).trim()
}

/**
 * The member's review in an entry's description, as plain text. Entries without a review only hold the poster
 * and a "Watched on ..." line.
 */
function reviewOf(html: string | null) {
  if (!html) return null
  const text = html
    .replace(/<p>\s*<img[^>]*>\s*<\/p>/g, '')
    .replace(/<br\s*\/?>|<\/p>/g, '\n')
    .replace(/<[^>]+>/g, '')
  const lines = decodeEntities(text)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^Watched on /.test(line) && !/^This review may contain spoilers/.test(line))
  return lines.join(' ') || null
}

export interface FeedEntry {
  tmdbId: number
  title: string
  year: number | null
  watchedDate: string | null
  rating: number | null
  liked: boolean
  /** The member's review of the film, when the diary entry has one. */
  review: string | null
}

/**
 * A member's latest diary entries, from their public RSS feed (Letterboxd has no open API). The feed holds the
 * latest 50 diary entries, each with the film's TMDB id, plus lists, which are skipped.
 */
export async function readFeed(user: string) {
  if (!USERNAME.test(user)) throw new HttpError(400, 'That is not a Letterboxd username')
  const response = await fetch(`https://letterboxd.com/${user}/rss/`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; retroreel/0.1; +https://retroreel.vumble.dev)',
      Accept: 'application/rss+xml, application/xml',
    },
  })
  if (response.status === 404) throw new HttpError(404, 'No Letterboxd member has that username')
  if (!response.ok) throw new HttpError(502, `Letterboxd answered ${response.status}, try again later`)
  const xml = await response.text()
  const [channel, ...items] = xml.split('<item>')
  const name = (tag(channel, 'title') ?? user).replace(/^Letterboxd - /, '')
  const username = /letterboxd\.com\/([^/]+)\//.exec(tag(channel, 'link') ?? '')?.[1] ?? user
  const entries: FeedEntry[] = items
    .map((item) => ({
      tmdbId: Number(tag(item, 'tmdb:movieId')),
      title: tag(item, 'letterboxd:filmTitle') ?? '',
      year: Number(tag(item, 'letterboxd:filmYear')) || null,
      watchedDate: tag(item, 'letterboxd:watchedDate'),
      rating: Number(tag(item, 'letterboxd:memberRating')) || null,
      liked: tag(item, 'letterboxd:memberLike') === 'Yes',
      review: reviewOf(tag(item, 'description')),
    }))
    .filter((entry) => entry.tmdbId > 0 && entry.title)
  return { username, name, entries }
}
