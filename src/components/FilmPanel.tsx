import { useEffect, useRef, useState } from 'react'
import type { RelatedFilm } from '../api'
import { countryName, flag } from '../countries'
import { backdrop, poster } from '../images'
import { starText, type FilmLog } from '../logs'
import { SCENES } from '../scenes'
import { cssVars } from '../style'
import type { Film } from '../types'
import { ExploreSection } from './ExploreSection'

interface FilmPanelProps {
  film: Film
  /** Undefined when the visitor has not connected Letterboxd, null when the film is not in their films. */
  log: FilmLog | null | undefined
  hasPrevious: boolean
  hasNext: boolean
  /** True when the timeline shows only this film's scene (or country). */
  sceneActive: boolean
  countryActive: boolean
  onFilterScene: () => void
  onFilterCountry: () => void
  /** For the Explore section: every film, who is looking, and the light-up state. */
  allFilms: Film[]
  owner: boolean
  /** For a film of the personal layer: adds it to the shared timeline (owner) or suggests it. */
  onPromote: (film: Film) => Promise<'published' | 'pending'>
  lit: boolean
  onJump: (id: string) => void
  onSuggest: (pick: RelatedFilm) => void
  onLight: (ids: ReadonlySet<string> | null) => void
  onPrevious: () => void
  onNext: () => void
  onClose: () => void
}

function formatDate(date: string) {
  if (date.length !== 10) return date
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatRuntime(minutes: number) {
  const hours = Math.floor(minutes / 60)
  return hours ? `${hours} h ${String(minutes % 60).padStart(2, '0')}` : `${minutes} min`
}

function LogBox({ log }: { log: FilmLog }) {
  const [lastDay] = log.dates
  return (
    <div className="panel-log">
      <h3>On your Letterboxd</h3>
      <ul>
        {log.favorite && <li className="is-favorite">One of your four favorite films</li>}
        {log.watched && (
          <li className="is-seen">
            {lastDay
              ? log.dates.length > 1
                ? `Logged ${log.dates.length} times, last on ${formatDate(lastDay)}`
                : `Logged on ${formatDate(lastDay)}`
              : 'In your watched films'}
          </li>
        )}
        {log.rating && <li className="is-rated">Rated {starText(log.rating)}</li>}
        {log.liked && <li className="is-liked">Liked</li>}
        {log.watchlist && <li className="is-watchlist">On your watchlist</li>}
      </ul>
    </div>
  )
}

export function FilmPanel({
  film,
  log,
  hasPrevious,
  hasNext,
  sceneActive,
  countryActive,
  onFilterScene,
  onFilterCountry,
  allFilms,
  owner,
  onPromote,
  lit,
  onJump,
  onSuggest,
  onLight,
  onPrevious,
  onNext,
  onClose,
}: FilmPanelProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const scene = SCENES[film.scene]
  const tmdb = film.tmdb
  // The trailer loads only when asked for: YouTube is heavy, and opening a film should stay instant.
  const [playing, setPlaying] = useState<string | null>(null)
  /** The answer to "add it to the timeline", for the film it was asked for. */
  const [promotion, setPromotion] = useState<{ id: string; text: string } | null>(null)
  const promotionText = promotion?.id === film.id ? promotion.text : null

  const promote = async () => {
    setPromotion({ id: film.id, text: 'busy' })
    try {
      const status = await onPromote(film)
      setPromotion({
        id: film.id,
        text:
          status === 'published'
            ? 'It is on the timeline for everyone now.'
            : 'Suggested: it joins the timeline once reviewed.',
      })
    } catch (problem) {
      setPromotion({ id: film.id, text: problem instanceof Error ? problem.message : String(problem) })
    }
  }
  const still = backdrop(tmdb?.backdrop)

  useEffect(() => {
    // Opened from the search box (Enter steps through matches): leave the focus there.
    if (document.activeElement?.closest('.search')) return
    closeRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 })
  }, [film.id])

  // A click outside the panel closes it, except on a film, which opens that film instead, and in a dialog
  // opened from the panel (adding a film from Explore).
  // Listening in the bubble phase means a drag on the timeline (whose click is swallowed) never closes it.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (panelRef.current?.contains(target) || target.closest('[data-film], .map-bubble, .dialog-backdrop')) return
      onCloseRef.current()
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  return (
    <>
      <div className="panel-backdrop" onClick={onClose} />
      <aside ref={panelRef} className="panel" aria-labelledby="panel-title" style={cssVars({ '--scene': scene.color })}>
        <div className="panel-nav">
          <div className="panel-steps">
            <button
              type="button"
              className="round"
              onClick={onPrevious}
              disabled={!hasPrevious}
              aria-label="Previous film"
            >
              ‹
            </button>
            <button type="button" className="round" onClick={onNext} disabled={!hasNext} aria-label="Next film">
              ›
            </button>
          </div>
          <button ref={closeRef} type="button" className="round" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="panel-head">
          <div className="panel-cover">
            {tmdb?.poster ? (
              <img src={poster(tmdb.poster, 'w342')!} alt={`Poster of ${film.title}`} />
            ) : (
              <span className="sleeve-blank">{film.title}</span>
            )}
          </div>
          <div className="panel-heading">
            <div className="panel-meta">
              <span>{formatDate(film.date)}</span>
              {film.runtime ? <span>{formatRuntime(film.runtime)}</span> : null}
            </div>
            <h2 id="panel-title">{film.title}</h2>
            {film.originalTitle && <p className="panel-original">{film.originalTitle}</p>}
            <p className="panel-artist">{film.directors.join(', ')}</p>
          </div>
        </div>

        <div className="panel-tags">
          {film.country && (
            <button
              type="button"
              className="country-tag"
              aria-pressed={countryActive}
              title={countryActive ? 'Show every country' : `Show only ${countryName(film.country)}`}
              onClick={onFilterCountry}
            >
              {flag(film.country)} {countryName(film.country)}
            </button>
          )}
          <button
            type="button"
            className="scene-tag"
            aria-pressed={sceneActive}
            title={sceneActive ? 'Show every scene' : `Show only ${scene.label}`}
            onClick={onFilterScene}
          >
            {scene.label}
          </button>
        </div>

        {film.note && <p className="panel-note">{film.note}</p>}

        {log && <LogBox log={log} />}
        {log === null && <p className="panel-unseen">Not in your Letterboxd films yet.</p>}

        {film.personal && (
          <div className="panel-personal">
            <p>One of your Letterboxd films: it is on your timeline only, in this browser.</p>
            {promotionText && promotionText !== 'busy' ? (
              <p className="field-hint">{promotionText}</p>
            ) : (
              <button type="button" className="go" disabled={promotionText === 'busy'} onClick={() => void promote()}>
                {promotionText === 'busy'
                  ? 'Adding…'
                  : owner
                    ? 'Add it to the timeline'
                    : 'Suggest it for the timeline'}
              </button>
            )}
          </div>
        )}

        {(still || tmdb?.trailer) && (
          <div className="trailer">
            {tmdb?.trailer && playing === tmdb.trailer ? (
              <iframe
                key={tmdb.trailer}
                title={`Trailer of ${film.title}`}
                src={`https://www.youtube-nocookie.com/embed/${tmdb.trailer}?autoplay=1&rel=0`}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            ) : (
              <button
                type="button"
                className="trailer-still"
                disabled={!tmdb?.trailer}
                onClick={() => setPlaying(tmdb?.trailer ?? null)}
                aria-label={tmdb?.trailer ? `Play the trailer of ${film.title}` : undefined}
              >
                {still && <img src={still} alt="" loading="lazy" />}
                {tmdb?.trailer && (
                  <span className="trailer-play">
                    <span aria-hidden="true">▶</span> Trailer
                  </span>
                )}
              </button>
            )}
          </div>
        )}

        {tmdb && (
          <p className="film-links">
            <a
              className="letterboxd-link"
              href={`https://letterboxd.com/tmdb/${tmdb.id}/`}
              target="_blank"
              rel="noreferrer"
            >
              <span className="lb-dots" aria-hidden="true" />
              Letterboxd
            </a>
            <a href={`https://www.themoviedb.org/movie/${tmdb.id}`} target="_blank" rel="noreferrer">
              TMDB
            </a>
            {tmdb.imdbId && (
              <a href={`https://www.imdb.com/title/${tmdb.imdbId}/`} target="_blank" rel="noreferrer">
                IMDb
              </a>
            )}
          </p>
        )}

        {tmdb && (
          <ExploreSection
            key={film.id}
            film={film}
            allFilms={allFilms}
            owner={owner}
            lit={lit}
            onJump={onJump}
            onSuggest={onSuggest}
            onLight={onLight}
          />
        )}
        <p className="panel-keys">
          <kbd>←</kbd> <kbd>→</kbd> previous and next film, <kbd>Esc</kbd> to close
        </p>
      </aside>
    </>
  )
}
