import type { Film, SceneKey } from '../src/types'
import { publish } from './_lib/film.js'
import { handle, HttpError, json, readJson } from './_lib/http.js'
import { isOwner } from './_lib/owner.js'
import { SCENE_KEYS } from './_lib/scene.js'
import { FILMS, PENDING, redis, TMDB_IDS, type Suggestion } from './_lib/store.js'
import { cleanNote, cleanTmdbId, cleanYear } from './suggest.js'

function requireOwner(request: Request) {
  if (!isOwner(request)) throw new HttpError(403, 'Only the site owner can review suggestions')
}

/** GET /api/review: the suggestions waiting for review, oldest first. Owner only. */
export function GET(request: Request) {
  return handle(async () => {
    requireOwner(request)
    const pending = (await redis().hgetall<Record<string, Suggestion>>(PENDING)) ?? {}
    const suggestions = Object.values(pending).sort((first, second) =>
      first.suggestedAt.localeCompare(second.suggestedAt),
    )
    return json({ suggestions })
  })
}

/**
 * POST /api/review: owner only.
 * { action: 'approve', tmdbId, scene?, year?, note? } publishes a suggestion, with corrections.
 * { action: 'reject', tmdbId } drops it. { action: 'remove', filmId } takes a film off the timeline.
 */
export function POST(request: Request) {
  return handle(async () => {
    requireOwner(request)
    const body = await readJson(request)
    const store = redis()
    if (body.action === 'remove') {
      const filmId = String(body.filmId ?? '')
      const film = await store.hget<Film>(FILMS, filmId)
      if (!film) throw new HttpError(404, 'No such film on the timeline')
      await store.hdel(FILMS, filmId)
      if (film.tmdb) await store.srem(TMDB_IDS, String(film.tmdb.id))
      return json({ status: 'removed' })
    }
    const key = String(cleanTmdbId(body.tmdbId))
    const suggestion = await store.hget<Suggestion>(PENDING, key)
    if (!suggestion) throw new HttpError(404, 'No such suggestion')
    if (body.action === 'reject') {
      await store.hdel(PENDING, key)
      return json({ status: 'rejected' })
    }
    if (body.action !== 'approve') throw new HttpError(400, 'Unknown action')
    const scene = SCENE_KEYS.includes(body.scene as SceneKey) ? (body.scene as SceneKey) : suggestion.scene
    const year = cleanYear(body.year) ?? suggestion.year
    const note = body.note === undefined ? suggestion.note : cleanNote(body.note)
    const { suggestedAt: _suggestedAt, ...film } = suggestion
    const date = year === suggestion.year ? suggestion.date : String(year)
    return json({ status: 'published', film: await publish({ ...film, scene, year, date, note }) })
  })
}
