import { useEffect, useMemo, useState } from 'react'
import { fetchRelated, type RelatedFilm } from '../api'
import { poster } from '../images'
import type { Film } from '../types'

interface ExploreSectionProps {
  film: Film
  allFilms: Film[]
  /** The site owner adds films directly; visitors suggest them. */
  owner: boolean
  lit: boolean
  onJump: (id: string) => void
  onSuggest: (pick: RelatedFilm) => void
  onLight: (ids: ReadonlySet<string> | null) => void
}

const GROUP_SIZE = 6
const MISSING_SIZE = 4
// Answers stay for the visit, so going back to a film shows its section at once.
const relatedCache = new Map<number, RelatedFilm[]>()

export function ExploreSection({ film, allFilms, owner, lit, onJump, onSuggest, onLight }: ExploreSectionProps) {
  const tmdbId = film.tmdb?.id ?? 0
  const [related, setRelated] = useState<RelatedFilm[] | null>(() => relatedCache.get(tmdbId) ?? null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!tmdbId || relatedCache.has(tmdbId)) return
    let cancelled = false
    const load = async () => {
      try {
        const films = await fetchRelated(tmdbId)
        relatedCache.set(tmdbId, films)
        if (!cancelled) setRelated(films)
      } catch (problem) {
        if (!cancelled) setError(problem instanceof Error ? problem.message : String(problem))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [tmdbId])

  const byTmdb = useMemo(() => {
    const index = new Map<number, Film>()
    for (const item of allFilms) if (item.tmdb) index.set(item.tmdb.id, item)
    return index
  }, [allFilms])

  const groups = useMemo(() => {
    if (!related) return null
    const before: Film[] = []
    const sameYear: Film[] = []
    const after: Film[] = []
    const missing: RelatedFilm[] = []
    for (const item of related) {
      const found = byTmdb.get(item.tmdbId)
      if (!found) missing.push(item)
      else if (found.id === film.id) continue
      else if (found.year < film.year) before.push(found)
      else if (found.year > film.year) after.push(found)
      else sameYear.push(found)
    }
    return { before, sameYear, after, missing }
  }, [related, byTmdb, film])

  const relatedIds = useMemo(
    () =>
      groups
        ? new Set([film.id, ...[...groups.before, ...groups.sameYear, ...groups.after].map((item) => item.id)])
        : null,
    [groups, film.id],
  )

  const lists = groups
    ? [
        { label: 'Came before', items: groups.before.slice(0, GROUP_SIZE) },
        { label: 'Same year', items: groups.sameYear.slice(0, GROUP_SIZE) },
        { label: 'Came after', items: groups.after.slice(0, GROUP_SIZE) },
      ].filter((group) => group.items.length > 0)
    : []
  const relatedCount = relatedIds ? relatedIds.size - 1 : 0
  const missing = groups?.missing.slice(0, MISSING_SIZE) ?? []

  return (
    <section className="explore" aria-label="Explore related films">
      <h3>Explore</h3>
      {error && <p className="field-hint">{error}</p>}
      {!groups && !error && <p className="field-hint">Finding related films…</p>}
      {groups && relatedCount > 0 && (
        <button
          type="button"
          className="toggle light-up"
          aria-pressed={lit}
          onClick={() => onLight(lit ? null : relatedIds)}
        >
          {lit ? 'Turn the lights back on' : `Light up the ${relatedCount} related films`}
        </button>
      )}
      {lists.map((group) => (
        <div key={group.label}>
          <p className="explore-label">{group.label}</p>
          <ul className="explore-list">
            {group.items.map((item) => (
              <li key={item.id}>
                <button type="button" className="explore-item" onClick={() => onJump(item.id)}>
                  {item.tmdb?.poster ? (
                    <img src={poster(item.tmdb.poster, 'w92')!} alt="" />
                  ) : (
                    <span className="result-blank" />
                  )}
                  <span className="result-text">
                    <span className="result-title">{item.title}</span>
                    <span className="result-meta">
                      {item.directors.join(', ')} · {item.year}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {missing.length > 0 && (
        <div>
          <p className="explore-label">Not on the timeline yet</p>
          <ul className="explore-list">
            {missing.map((item) => (
              <li key={item.tmdbId} className="explore-item is-missing">
                {item.poster ? <img src={poster(item.poster, 'w92')!} alt="" /> : <span className="result-blank" />}
                <span className="result-text">
                  <span className="result-title">{item.title}</span>
                  <span className="result-meta">{item.year ?? ''}</span>
                </span>
                <button type="button" className="text-button" onClick={() => onSuggest(item)}>
                  {owner ? 'Add' : 'Suggest'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {groups && lists.length === 0 && missing.length === 0 && <p className="field-hint">No related films found.</p>}
      <p className="explore-credit">
        Recommendations from{' '}
        <a href={`https://www.themoviedb.org/movie/${tmdbId}`} target="_blank" rel="noreferrer">
          TMDB
        </a>
      </p>
    </section>
  )
}
