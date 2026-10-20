import { useEffect, useMemo, useState } from 'react'
import { matchFilms, suggestFilm, type MatchedFilm } from '../api'
import { poster } from '../images'
import type { LetterboxdFilm } from '../letterboxd'
import { normalize, starText } from '../logs'
import type { Film } from '../types'

interface MissingFilmsProps {
  /** The visitor's watched films that are not on the timeline. */
  films: LetterboxdFilm[]
  /** The site owner adds films directly; visitors suggest them. */
  owner: boolean
  onPublished: (film: Film) => void
}

const PAGE = 30
const STATUS_LABELS: Record<string, string> = {
  published: 'On the timeline',
  pending: 'Waiting for review',
  busy: 'Adding…',
}
// TMDB matches stay for the visit, so reopening the dialog shows them at once.
const matchCache = new Map<string, MatchedFilm | null>()

function keyOf(film: LetterboxdFilm) {
  return film.tmdbId !== null ? `id:${film.tmdbId}` : `${film.title}|${film.year ?? ''}`
}

/** Favorites first, then by stars, likes, and the latest diary day. */
function rank(first: LetterboxdFilm, second: LetterboxdFilm) {
  return (
    Number(second.favorite) - Number(first.favorite) ||
    (second.rating ?? 0) - (first.rating ?? 0) ||
    Number(second.liked) - Number(first.liked) ||
    (second.dates[0] ?? '').localeCompare(first.dates[0] ?? '') ||
    first.title.localeCompare(second.title)
  )
}

export function MissingFilms({ films, owner, onPublished }: MissingFilmsProps) {
  const [scope, setScope] = useState<'best' | 'all'>('best')
  const [count, setCount] = useState(PAGE)
  const [matches, setMatches] = useState(() => new Map(matchCache))
  const [statuses, setStatuses] = useState<Record<number, string>>({})
  const [error, setError] = useState<string | null>(null)

  const best = useMemo(
    () => films.filter((film) => film.favorite || film.liked || (film.rating ?? 0) >= 4).sort(rank),
    [films],
  )
  const all = useMemo(() => [...films].sort(rank), [films])
  const list = scope === 'best' ? best : all
  const shown = list.slice(0, count)

  // Looks up on TMDB the films shown that have no match yet, 40 at a time.
  const wantedKey = shown
    .filter((film) => !matchCache.has(keyOf(film)))
    .map(keyOf)
    .join('\n')
  useEffect(() => {
    if (!wantedKey) return
    const keys = new Set(wantedKey.split('\n'))
    const wanted = [...best, ...all].filter(
      (film, index, every) => keys.has(keyOf(film)) && every.indexOf(film) === index,
    )
    let cancelled = false
    const load = async () => {
      try {
        for (let start = 0; start < wanted.length; start += 40) {
          const batch = wanted.slice(start, start + 40)
          const found = await matchFilms(batch.map(({ title, year, tmdbId }) => ({ title, year, tmdbId })))
          batch.forEach((film, index) => matchCache.set(keyOf(film), found[index]))
          if (!cancelled) setMatches(new Map(matchCache))
        }
      } catch (problem) {
        if (!cancelled) setError(problem instanceof Error ? problem.message : String(problem))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [wantedKey, best, all])

  const add = async (film: LetterboxdFilm, match: MatchedFilm) => {
    setStatuses((current) => ({ ...current, [match.tmdbId]: 'busy' }))
    try {
      // Letterboxd's year, like the catalog's: TMDB sometimes counts the release after the festival premiere.
      const answer = await suggestFilm({ tmdbId: match.tmdbId, note: '', year: film.year })
      if (answer.status === 'published') onPublished(answer.film)
      setStatuses((current) => ({ ...current, [match.tmdbId]: answer.status }))
    } catch (problem) {
      setStatuses((current) => ({
        ...current,
        [match.tmdbId]: problem instanceof Error ? problem.message : String(problem),
      }))
    }
  }

  return (
    <section className="lb-step">
      <h3>3. Not on the timeline yet</h3>
      <p>
        {owner
          ? 'Add the ones that belong in film history. The films you log on Letterboxd from now on are added by themselves, once a day or when you open the site.'
          : 'Suggest the ones that belong here: they join the timeline once reviewed.'}
      </p>
      <div className="view-switch scope-switch" role="group" aria-label="Which films">
        <button type="button" aria-pressed={scope === 'best'} onClick={() => setScope('best')}>
          Favorites, liked and top rated <span className="chip-count">{best.length}</span>
        </button>
        <button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>
          All watched <span className="chip-count">{all.length}</span>
        </button>
      </div>
      {error && <p className="dialog-error">{error}</p>}
      <ul className="results missing-list">
        {shown.map((film) => {
          const match = matches.get(keyOf(film))
          const status = match ? (statuses[match.tmdbId] ?? match.status) : null
          const facts = [
            film.year,
            film.favorite && 'favorite',
            film.rating && starText(film.rating),
            film.liked && '♥',
          ].filter(Boolean)
          const otherName =
            match && (normalize(match.title) !== normalize(film.title) || (film.year && match.year !== film.year))
          return (
            <li key={keyOf(film)} className="result missing-item">
              {match?.poster ? <img src={poster(match.poster, 'w92')!} alt="" /> : <span className="result-blank" />}
              <span className="result-text">
                <span className="result-title">{film.title}</span>
                <span className="result-meta">
                  {facts.join(' · ')}
                  {otherName && ` · TMDB: ${match.title} (${match.year ?? '?'})`}
                </span>
              </span>
              {match === undefined ? (
                <span className="result-status">…</span>
              ) : match === null ? (
                <span className="result-status">Not on TMDB</span>
              ) : status ? (
                <span className="result-status">{STATUS_LABELS[status] ?? status}</span>
              ) : (
                <button type="button" className="text-button add-button" onClick={() => void add(film, match)}>
                  {owner ? 'Add' : 'Suggest'}
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {count < list.length && (
        <button type="button" className="text-button" onClick={() => setCount((current) => current + PAGE)}>
          Show {Math.min(PAGE, list.length - count)} more
        </button>
      )}
    </section>
  )
}
