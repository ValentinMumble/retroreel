/**
 * The visitor's Letterboxd films that are not on the timeline, built from TMDB through /api/match. They are kept
 * in this browser, so the list of films to add and the personal layer show them at once on the next visit.
 */
import { matchFilms, type MatchedFilm } from './api'
import type { LetterboxdFilm } from './letterboxd'
import type { FilmLog } from './logs'
import type { Film } from './types'

const KEY = 'retroreel.personal'
const BATCH = 40

function load() {
  try {
    return new Map<string, MatchedFilm | null>(Object.entries(JSON.parse(localStorage.getItem(KEY) ?? '{}')))
  } catch {
    return new Map<string, MatchedFilm | null>()
  }
}

const known = load()

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(known)))
  } catch {
    // A full or blocked storage: the films are looked up again on the next visit.
  }
}

/** The same key as the server's cache: a film is placed in Letterboxd's year. */
export function entryKey(film: LetterboxdFilm) {
  return film.tmdbId !== null ? `id:${film.tmdbId}|${film.year ?? ''}` : `${film.title}|${film.year ?? ''}`
}

/** The TMDB film of an entry: undefined while not looked up, null when TMDB has none. */
export function knownFilm(film: LetterboxdFilm) {
  return known.get(entryKey(film))
}

export function rememberStatus(film: LetterboxdFilm, status: MatchedFilm['status']) {
  const match = known.get(entryKey(film))
  if (!match) return
  known.set(entryKey(film), { ...match, status })
  save()
}

/** Looks up the films not known yet, 40 at a time, calling onBatch after each batch. */
export async function lookUpFilms(films: LetterboxdFilm[], onBatch: () => void, cancelled: () => boolean) {
  const wanted = films.filter((film) => !known.has(entryKey(film)))
  for (let start = 0; start < wanted.length && !cancelled(); start += BATCH) {
    const batch = wanted.slice(start, start + BATCH)
    const found = await matchFilms(batch.map(({ title, year, tmdbId }) => ({ title, year, tmdbId })))
    batch.forEach((film, index) => known.set(entryKey(film), found[index]))
    save()
    onBatch()
  }
}

export function forgetFilms() {
  known.clear()
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing stored.
  }
}

/**
 * The personal layer: one timeline film per looked-up entry, under the Letterboxd title, with its log. Films
 * already on the timeline (same id or TMDB id) are left out.
 */
export function personalFilms(entries: LetterboxdFilm[], catalog: Film[]) {
  const taken = new Set(catalog.map((film) => film.id))
  const takenTmdb = new Set(catalog.map((film) => film.tmdb?.id))
  const films: Film[] = []
  const logs = new Map<string, FilmLog>()
  let pending = 0
  for (const entry of entries) {
    const match = knownFilm(entry)
    if (match === undefined) pending += 1
    if (!match?.tmdb || taken.has(match.id) || takenTmdb.has(match.tmdb.id)) continue
    taken.add(match.id)
    takenTmdb.add(match.tmdb.id)
    const { status: _status, ...film } = match
    films.push({ ...film, title: entry.title, personal: true })
    logs.set(film.id, {
      watched: entry.watched,
      liked: entry.liked,
      favorite: entry.favorite,
      // Watching a film takes it off the watchlist, even when the export is older than the feed.
      watchlist: entry.watchlist && !entry.watched,
      rating: entry.rating,
      dates: entry.dates,
    })
  }
  return { films, logs, pending }
}
