import { createHash, timingSafeEqual } from 'node:crypto'
import { bearerToken } from './http.js'

/** True when the request carries the site owner's key (OWNER_KEY), sent by the page as a bearer token. */
export function isOwner(request: Request) {
  const expected = process.env.OWNER_KEY
  const given = bearerToken(request)
  if (!expected || !given) return false
  // Hashing first gives both sides the same length, which timingSafeEqual needs.
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(given), digest(expected))
}
