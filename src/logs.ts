import type { LetterboxdData, LetterboxdFilm } from './letterboxd'
import type { Film } from './types'

/** What the visitor did with a film of the timeline, on Letterboxd. */
export interface FilmLog {
  watched: boolean
  liked: boolean
  favorite: boolean
  watchlist: boolean
  rating: number | null
  /** Diary days, newest first. */
  dates: string[]
}

export type LogsByFilm = ReadonlyMap<string, FilmLog>

/** Comparable form of a title: no accents, no punctuation, no leading article. */
export function normalize(text: string) {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(the|a|an) /, '')
}

/**
 * Finds the timeline film of each Letterboxd film: by TMDB id when the feed gives it, else by title (English or
 * original) and year, allowing one year of difference (festival premiere against release).
 */
export function matchLogs(films: Film[], data: LetterboxdData): LogsByFilm {
  const byTmdb = new Map<number, Film>()
  const byTitle = new Map<string, Film[]>()
  for (const film of films) {
    if (film.tmdb) byTmdb.set(film.tmdb.id, film)
    for (const title of new Set([film.title, film.originalTitle ?? film.title].map(normalize))) {
      byTitle.set(title, [...(byTitle.get(title) ?? []), film])
    }
  }
  const find = (entry: LetterboxdFilm) => {
    const exact = entry.tmdbId === null ? undefined : byTmdb.get(entry.tmdbId)
    if (exact) return exact
    const candidates = byTitle.get(normalize(entry.title)) ?? []
    const year = entry.year
    if (year === null) return candidates.length === 1 ? candidates[0] : undefined
    return candidates.find((film) => film.year === year) ?? candidates.find((film) => Math.abs(film.year - year) === 1)
  }

  const logs = new Map<string, FilmLog>()
  // The feed goes last: it is the newest, so its rating wins.
  for (const entry of [...(data.archive?.films ?? []), ...(data.feed?.films ?? [])]) {
    const film = find(entry)
    if (!film) continue
    const log = logs.get(film.id) ?? {
      watched: false,
      liked: false,
      favorite: false,
      watchlist: false,
      rating: null,
      dates: [],
    }
    log.watched ||= entry.watched
    log.liked ||= entry.liked
    log.favorite ||= entry.favorite
    log.watchlist ||= entry.watchlist
    log.rating = entry.rating ?? log.rating
    log.dates = [...new Set([...log.dates, ...entry.dates])]
    logs.set(film.id, log)
  }
  for (const log of logs.values()) {
    // Watching a film takes it off the watchlist, even when the export is older than the feed.
    if (log.watched) log.watchlist = false
    log.dates.sort((first, second) => second.localeCompare(first))
  }
  return logs
}

/** "★★★★½" for 4.5. */
export function starText(rating: number) {
  return '★'.repeat(Math.floor(rating)) + (rating % 1 ? '½' : '')
}
