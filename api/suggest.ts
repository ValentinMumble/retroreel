import { buildFilm, publish } from './_lib/film.js'
import { clientIp, handle, HttpError, json, readJson } from './_lib/http.js'
import { isOwner } from './_lib/owner.js'
import { PENDING, rateLimit, redis, TMDB_IDS } from './_lib/store.js'

export function cleanNote(value: unknown) {
  if (typeof value !== 'string') return ''
  const printable = Array.from(value, (char) => (char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 ? ' ' : char))
  return printable.join('').trim().slice(0, 280)
}

export function cleanYear(value: unknown) {
  if (value === undefined || value === null || value === '') return null
  const year = Number(value)
  if (!Number.isInteger(year) || year < 1888 || year > new Date().getFullYear() + 1) {
    throw new HttpError(400, 'That year looks wrong')
  }
  return year
}

export function cleanTmdbId(value: unknown) {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'That is not a TMDB film id')
  return id
}

/**
 * POST /api/suggest { tmdbId, note?, year? }: suggests a film. The server fetches everything else from TMDB.
 * Suggestions wait for the owner's review; the owner's own suggestions (OWNER_KEY in Authorization) go live.
 */
export function POST(request: Request) {
  return handle(async () => {
    const body = await readJson(request)
    const tmdbId = cleanTmdbId(body.tmdbId)
    const note = cleanNote(body.note)
    const year = cleanYear(body.year)
    const owner = isOwner(request)
    if (!owner) await rateLimit(`suggest:${clientIp(request)}`, 10, 3600)
    const store = redis()
    const key = String(tmdbId)
    if (await store.sismember(TMDB_IDS, key)) throw new HttpError(409, 'This film is already on the timeline')
    if (!owner && (await store.hexists(PENDING, key))) {
      throw new HttpError(409, 'Someone already suggested this film, it is waiting for review')
    }
    const { film, related } = await buildFilm(tmdbId, { note, year })
    if (owner) return json({ status: 'published', film: await publish(film, related) }, { status: 201 })
    await store.hset(PENDING, { [key]: { ...film, related, suggestedAt: new Date().toISOString() } })
    return json({ status: 'pending', film }, { status: 201 })
  })
}
