import { HttpError } from './http.js'

/**
 * The Movie Database (TMDB), the film data Letterboxd itself uses. TMDB_API_KEY takes either the v3 API key
 * or the v4 read access token (the long one starting with "eyJ").
 */

const BASE = 'https://api.themoviedb.org/3'

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const credential = process.env.TMDB_API_KEY
  if (!credential) throw new HttpError(503, 'The server is missing TMDB_API_KEY')
  const bearer = credential.startsWith('eyJ')
  const query = new URLSearchParams({ language: 'en-US', ...params, ...(bearer ? {} : { api_key: credential }) })
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (bearer) headers.Authorization = `Bearer ${credential}`
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`${BASE}/${path}?${query}`, { headers })
    if (response.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
      continue
    }
    if (response.status === 404) throw new HttpError(404, 'TMDB does not know this film')
    if (response.status === 401) throw new HttpError(503, 'TMDB refused the server key')
    if (!response.ok) throw new HttpError(502, `TMDB answered ${response.status}`)
    return (await response.json()) as T
  }
  throw new HttpError(503, 'TMDB is busy, try again in a minute')
}

export interface MovieSummary {
  id: number
  title: string
  original_title: string
  release_date?: string
  poster_path: string | null
}

interface Video {
  key: string
  site: string
  type: string
  official: boolean
  iso_639_1: string
}

export interface MovieDetails extends MovieSummary {
  backdrop_path: string | null
  runtime: number | null
  imdb_id: string | null
  genres: { id: number; name: string }[]
  origin_country?: string[]
  production_countries: { iso_3166_1: string }[]
  credits?: { crew: { job: string; name: string }[] }
  videos?: { results: Video[] }
  keywords?: { keywords: { name: string }[] }
}

export function releaseYear(movie: MovieSummary) {
  return Number(movie.release_date?.slice(0, 4)) || null
}

export interface Candidate {
  tmdbId: number
  title: string
  originalTitle: string | null
  year: number | null
  poster: string | null
}

function candidate(movie: MovieSummary): Candidate {
  return {
    tmdbId: movie.id,
    title: movie.title,
    originalTitle: movie.original_title !== movie.title ? movie.original_title : null,
    year: releaseYear(movie),
    poster: movie.poster_path,
  }
}

/** Films matching a search. A year at the end ("Alien 1979") narrows the search to that year. */
export async function searchMovies(text: string): Promise<Candidate[]> {
  const withYear = /^(.+?)\s+\(?((?:18|19|20)\d\d)\)?$/.exec(text)
  const params: Record<string, string> = { query: withYear ? withYear[1] : text, include_adult: 'false' }
  if (withYear) params.primary_release_year = withYear[2]
  const answer = await get<{ results: MovieSummary[] }>('search/movie', params)
  return answer.results.slice(0, 12).map(candidate)
}

/**
 * The TMDB film of a title and year as Letterboxd gives them: the same release year first, then one year apart,
 * then TMDB's top result. Null when TMDB finds nothing.
 */
export async function findMovie(title: string, year: number | null): Promise<Candidate | null> {
  const params: Record<string, string> = { query: title, include_adult: 'false' }
  let { results } = await get<{ results: MovieSummary[] }>(
    'search/movie',
    year ? { ...params, year: String(year) } : params,
  )
  if (results.length === 0 && year) results = (await get<{ results: MovieSummary[] }>('search/movie', params)).results
  const gap = (movie: MovieSummary) => (year ? Math.abs((releaseYear(movie) ?? 0) - year) : 0)
  const best = results.find((movie) => gap(movie) === 0) ?? results.find((movie) => gap(movie) === 1) ?? results[0]
  return best ? candidate(best) : null
}

/** A film's title, year and poster, by TMDB id. */
export async function movieSummary(tmdbId: number): Promise<Candidate> {
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) throw new HttpError(400, 'That is not a TMDB film id')
  return candidate(await get<MovieSummary>(`movie/${tmdbId}`))
}

export async function movieDetails(tmdbId: number): Promise<MovieDetails> {
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) throw new HttpError(400, 'That is not a TMDB film id')
  return get<MovieDetails>(`movie/${tmdbId}`, { append_to_response: 'credits,videos,keywords' })
}

/** TMDB's recommendations, or its similar films when it has no recommendations (often for old films). */
export async function relatedMovies(tmdbId: number): Promise<Candidate[]> {
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) throw new HttpError(400, 'That is not a TMDB film id')
  const recommended = await get<{ results: MovieSummary[] }>(`movie/${tmdbId}/recommendations`)
  if (recommended.results.length > 0) return recommended.results.map(candidate)
  const similar = await get<{ results: MovieSummary[] }>(`movie/${tmdbId}/similar`)
  return similar.results.map(candidate)
}

/** The YouTube key of the film's trailer: an official English trailer first, then any trailer or teaser. */
export function trailerKey(details: MovieDetails) {
  const videos = (details.videos?.results ?? []).filter((video) => video.site === 'YouTube')
  const score = (video: Video) =>
    (video.type === 'Trailer' ? 4 : video.type === 'Teaser' ? 2 : 0) +
    (video.official ? 2 : 0) +
    (video.iso_639_1 === 'en' ? 1 : 0)
  const best = [...videos].sort((first, second) => score(second) - score(first))[0]
  return best && (best.type === 'Trailer' || best.type === 'Teaser') ? best.key : null
}
