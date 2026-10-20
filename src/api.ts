import { ownerKey } from './owner'
import type { Film, SceneKey } from './types'

// Query values use encodeURIComponent (spaces as %20): a "+" for a space does not survive every proxy.
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body) headers.set('Content-Type', 'application/json')
  const key = ownerKey()
  if (key) headers.set('Authorization', `Bearer ${key}`)
  const response = await fetch(path, { ...init, headers })
  const data: unknown = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = (data as { error?: string }).error
    throw new Error(message ?? `The server answered ${response.status}`)
  }
  return data as T
}

export async function fetchFilms() {
  return (await request<{ films: Film[] }>('/api/films')).films
}

export interface SearchResult {
  tmdbId: number
  title: string
  originalTitle: string | null
  year: number | null
  poster: string | null
  status: 'published' | 'pending' | null
}

export async function searchFilms(query: string) {
  return (await request<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(query)}`)).results
}

export function suggestFilm(input: { tmdbId: number; note: string; year: number | null }) {
  return request<{ status: 'published' | 'pending'; film: Film }>('/api/suggest', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export interface Suggestion extends Film {
  suggestedAt: string
}

export async function fetchSuggestions() {
  return (await request<{ suggestions: Suggestion[] }>('/api/review')).suggestions
}

export function reviewSuggestion(input: {
  action: 'approve' | 'reject'
  tmdbId: number
  scene?: SceneKey
  year?: number
  note?: string
}) {
  return request<{ status: string; film?: Film }>('/api/review', { method: 'POST', body: JSON.stringify(input) })
}

/** A film TMDB recommends next to another one. */
export interface RelatedFilm {
  tmdbId: number
  title: string
  year: number | null
  poster: string | null
}

export async function fetchRelated(tmdbId: number) {
  return (await request<{ films: RelatedFilm[] }>(`/api/related?id=${tmdbId}`)).films
}

/** [film id, film id, strength 0-1, kind] */
export type GalaxyLink = [string, string, number, 'related' | 'director']

export async function fetchGalaxyLinks() {
  return (await request<{ links: GalaxyLink[] }>('/api/galaxy')).links
}

export interface FeedEntry {
  tmdbId: number
  title: string
  year: number | null
  watchedDate: string | null
  rating: number | null
  liked: boolean
}

export function fetchLetterboxdFeed(username: string) {
  return request<{ username: string; name: string; entries: FeedEntry[] }>(
    `/api/letterboxd?user=${encodeURIComponent(username)}`,
  )
}

/** The film built from TMDB for a Letterboxd film, with its timeline status. */
export interface MatchedFilm extends Film {
  status: 'published' | 'pending' | null
}

export async function matchFilms(films: { title: string; year: number | null; tmdbId: number | null }[]) {
  return (
    await request<{ films: (MatchedFilm | null)[] }>('/api/match', { method: 'POST', body: JSON.stringify({ films }) })
  ).films
}

/** Owner only: adds the films logged on Letterboxd since the sync started. */
export async function syncFeed() {
  return (await request<{ added: Film[] }>('/api/sync', { method: 'POST', body: '{}' })).added
}
