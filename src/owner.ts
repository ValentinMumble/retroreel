/**
 * The site owner adds films directly and reviews suggestions. The owner opens the site once as
 * /#owner=<OWNER_KEY>: the key is kept in this browser and sent with each request, and the server checks it.
 */
const KEY = 'retroreel.owner'

export function ownerKey() {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function forgetOwnerKey() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing stored.
  }
}

/** Keeps the key from a #owner=... address and takes it out of the address bar. */
export function captureOwnerKey() {
  const match = /^#owner=(.+)$/.exec(window.location.hash)
  if (!match) return
  try {
    localStorage.setItem(KEY, decodeURIComponent(match[1]))
  } catch {
    // Storage blocked: owner mode lasts until the next reload.
  }
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
}
