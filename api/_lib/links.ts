import type { Film } from '../../src/types.js'
import { normalize } from './names.js'

/** Links per film to the films TMDB recommends most. */
const LINKS_PER_FILM = 4

/** [film id, film id, strength 0-1, kind] */
export type Link = [string, string, number, 'related' | 'director']

/**
 * The galaxy links between films. Each film links to the films TMDB recommends with it that are on the timeline,
 * higher in the list and closer in time first, and each director's films are chained in order.
 */
export function galaxyLinks(films: Film[], related: Record<string, number[]>) {
  const byTmdb = new Map<number, Film>()
  for (const film of films) if (film.tmdb) byTmdb.set(film.tmdb.id, film)

  const links = new Map<string, Link>()
  const add = (first: string, second: string, strength: number, kind: Link[3]) => {
    const [low, high] = first < second ? [first, second] : [second, first]
    const key = `${low}|${high}`
    const known = links.get(key)
    if (!known || known[2] < strength) links.set(key, [low, high, Math.round(strength * 1000) / 1000, kind])
  }

  for (const film of films) {
    const list = film.tmdb ? (related[String(film.tmdb.id)] ?? []) : []
    const scored: [string, number][] = []
    list.forEach((tmdbId, rank) => {
      const other = byTmdb.get(tmdbId)
      if (!other || other.id === film.id) return
      // Higher in TMDB's list, and closer in time, the stronger the link.
      const strength = (1 - rank / (list.length + 1)) * (1 - Math.min(Math.abs(other.year - film.year), 40) / 80)
      scored.push([other.id, strength])
    })
    scored
      .sort((first, second) => second[1] - first[1])
      .slice(0, LINKS_PER_FILM)
      .forEach(([otherId, strength]) => add(film.id, otherId, strength, 'related'))
  }

  // A director's films, one after the other.
  const byDirector = new Map<string, Film[]>()
  for (const film of films) {
    for (const director of film.directors) {
      const key = normalize(director)
      byDirector.set(key, [...(byDirector.get(key) ?? []), film])
    }
  }
  for (const work of byDirector.values()) {
    const ordered = [...work].sort((first, second) => first.year - second.year)
    for (let index = 1; index < ordered.length; index += 1)
      add(ordered[index - 1].id, ordered[index].id, 0.9, 'director')
  }

  const withRelated = films.filter((film) => film.tmdb && related[String(film.tmdb.id)]).length
  return { links: [...links.values()], coverage: { films: films.length, withRelated } }
}
