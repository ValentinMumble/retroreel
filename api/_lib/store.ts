import { Redis } from '@upstash/redis'
import type { Film } from '../../src/types'
import { HttpError } from './http.js'

/** Published films, by film id. */
export const FILMS = 'retroreel:films'
/** TMDB ids of the published films, to spot duplicates quickly. */
export const TMDB_IDS = 'retroreel:tmdb-ids'
/** Suggestions waiting for review, by TMDB id. */
export const PENDING = 'retroreel:pending'
/** TMDB's recommendations for each published film, as TMDB ids, best first: the galaxy links. */
export const RELATED = 'retroreel:related'

/** Films built from TMDB for visitors' Letterboxd films ("title|year" or "id:<TMDB id>|year"), each built once. */
export const MATCHES = 'retroreel:match-films'
/** The day the owner's feed sync started: films logged from that day on are added to the timeline. */
export const SYNC_SINCE = 'retroreel:sync-since'
/** TMDB ids the feed sync has added, so a film the owner removes is not added again. */
export const SYNC_DONE = 'retroreel:sync-done'

export interface Suggestion extends Film {
  suggestedAt: string
  /** TMDB recommendations, kept for the galaxy once the film is approved. */
  related?: number[]
}

let client: Redis | null = null

/** The Upstash Redis client, from the variables Vercel adds when the store is connected. */
export function redis() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) throw new HttpError(503, 'The film store is not connected yet')
  client ??= new Redis({ url, token })
  return client
}

/** Counts a request and refuses it past `limit` per `windowSeconds` for this key. */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  // `npm run dev` without a store (local-api.ts): nobody else to limit.
  if (process.env.RETROREEL_LOCAL && !process.env.KV_REST_API_URL) return
  const store = redis()
  const counter = `retroreel:rate:${key}`
  const count = await store.incr(counter)
  if (count === 1) await store.expire(counter, windowSeconds)
  if (count > limit) throw new HttpError(429, 'Too many requests, try again later')
}
