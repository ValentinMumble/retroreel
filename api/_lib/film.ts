import type { Film } from '../../src/types'
import { HttpError } from './http.js'
import { normalize, slug } from './names.js'
import { detectScene } from './scene.js'
import { FILMS, PENDING, redis, TMDB_IDS } from './store.js'
import { movieDetails, releaseYear, trailerKey } from './tmdb.js'

/** Builds a timeline film from TMDB: poster, trailer, directors, country, and a scene from genres and keywords. */
export async function buildFilm(tmdbId: number, options: { note: string; year: number | null }): Promise<Film> {
  const details = await movieDetails(tmdbId)
  const released = releaseYear(details)
  const year = options.year ?? released
  if (!year) throw new HttpError(400, 'TMDB has no release date for this film: give its year')
  const directors = [
    ...new Set(
      (details.credits?.crew ?? []).filter((member) => member.job === 'Director').map((member) => member.name),
    ),
  ]
  const film: Film = {
    id: slug(`${details.title} ${year}`),
    year,
    date: year === released && details.release_date?.length === 10 ? details.release_date : String(year),
    title: details.title,
    originalTitle: normalize(details.original_title) !== normalize(details.title) ? details.original_title : null,
    directors,
    scene: detectScene(details, year),
    country: details.origin_country?.[0] ?? details.production_countries[0]?.iso_3166_1 ?? null,
    runtime: details.runtime || null,
    note: options.note,
    tmdb: {
      id: details.id,
      poster: details.poster_path,
      backdrop: details.backdrop_path,
      imdbId: details.imdb_id || null,
      trailer: trailerKey(details),
    },
  }
  return film
}

/** Puts a film on the timeline (and takes it out of the review queue). */
export async function publish(film: Film) {
  const store = redis()
  const taken = await store.hget<Film>(FILMS, film.id)
  // Same title and year as another film: keep both apart by TMDB id.
  const stored = taken && taken.tmdb?.id !== film.tmdb?.id ? { ...film, id: `${film.id}-${film.tmdb?.id}` } : film
  await store.hset(FILMS, { [stored.id]: stored })
  if (stored.tmdb) {
    const key = String(stored.tmdb.id)
    await store.sadd(TMDB_IDS, key)
    await store.hdel(PENDING, key)
  }
  return stored
}
