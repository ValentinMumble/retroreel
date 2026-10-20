import { clientIp, handle, HttpError, json, readJson } from './_lib/http.js'
import { MATCHES, PENDING, rateLimit, redis, TMDB_IDS } from './_lib/store.js'
import { findMovie, movieSummary, type Candidate } from './_lib/tmdb.js'

const BATCH = 40
const NOT_FOUND = { tmdbId: 0 }

interface Wanted {
  title: string
  year: number | null
  tmdbId: number | null
}

function wanted(value: unknown): Wanted {
  const item = (value ?? {}) as Record<string, unknown>
  const title = typeof item.title === 'string' ? item.title.trim().slice(0, 200) : ''
  const year = Number(item.year) || null
  const tmdbId = Number(item.tmdbId) || null
  if (!title && !tmdbId) throw new HttpError(400, 'Each film needs a title or a TMDB id')
  return { title, year, tmdbId }
}

/** Runs the lookups a few at a time: TMDB allows about 40 requests a second. */
async function lookUp(items: Wanted[]) {
  const found: (Candidate | null)[] = []
  for (let start = 0; start < items.length; start += 6) {
    const batch = items.slice(start, start + 6)
    found.push(
      ...(await Promise.all(
        batch.map((item) =>
          (item.tmdbId ? movieSummary(item.tmdbId) : findMovie(item.title, item.year)).catch(() => null),
        ),
      )),
    )
  }
  return found
}

/**
 * POST /api/match { films: [{ title, year, tmdbId? }] }: the TMDB film of each Letterboxd film (the export has
 * titles and years, not ids), with its timeline status. Answers are kept in Redis, so each is looked up once.
 */
export function POST(request: Request) {
  return handle(async () => {
    const body = await readJson(request)
    if (!Array.isArray(body.films) || body.films.length === 0) throw new HttpError(400, 'Give a list of films')
    if (body.films.length > BATCH) throw new HttpError(400, `At most ${BATCH} films at a time`)
    const items = body.films.map(wanted)
    await rateLimit(`match:${clientIp(request)}`, 120, 3600)
    const store = redis()
    const keys = items.map((item) => (item.tmdbId ? `id:${item.tmdbId}` : `${item.title}|${item.year ?? ''}`))
    const cached = (await store.hmget<Record<string, Candidate | typeof NOT_FOUND>>(MATCHES, ...keys)) ?? {}
    const missing = items.filter((_item, index) => !cached[keys[index]])
    if (missing.length > 0) {
      const found = await lookUp(missing)
      const fresh: Record<string, Candidate | typeof NOT_FOUND> = {}
      missing.forEach((item, index) => {
        fresh[keys[items.indexOf(item)]] = found[index] ?? NOT_FOUND
      })
      await store.hset(MATCHES, fresh)
      Object.assign(cached, fresh)
    }
    const matches = keys.map((key) => {
      const match = cached[key]
      return match && match.tmdbId ? (match as Candidate) : null
    })
    const ids = matches.filter((match): match is Candidate => match !== null).map((match) => String(match.tmdbId))
    const pipeline = store.pipeline()
    if (ids.length) pipeline.smismember(TMDB_IDS, ids)
    for (const id of ids) pipeline.hexists(PENDING, id)
    const [published = [], ...pending] = ids.length ? ((await pipeline.exec()) as [number[], ...number[]]) : [[]]
    const status = new Map(
      ids.map((id, index) => [id, published[index] ? 'published' : pending[index] ? 'pending' : null]),
    )
    return json({
      films: matches.map((match) => (match ? { ...match, status: status.get(String(match.tmdbId)) ?? null } : null)),
    })
  })
}
