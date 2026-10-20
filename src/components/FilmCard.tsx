import { memo } from 'react'
import { poster } from '../images'
import { starText, type FilmLog } from '../logs'
import { SCENES } from '../scenes'
import { cssVars } from '../style'
import type { Film } from '../types'

interface FilmCardProps {
  film: Film
  log: FilmLog | undefined
  selected: boolean
  dimmed: boolean
  onSelect: (id: string) => void
}

function logTitle(log: FilmLog) {
  const parts = [log.favorite ? 'One of your four favorites' : 'You have seen it']
  if (log.rating) parts.push(`rated ${starText(log.rating)}`)
  if (log.liked) parts.push('liked')
  return parts.join(', ')
}

export const FilmCard = memo(function FilmCard({ film, log, selected, dimmed, onSelect }: FilmCardProps) {
  const path = film.tmdb?.poster
  return (
    <button
      type="button"
      className={`card${selected ? ' is-selected' : ''}${dimmed ? ' is-dimmed' : ''}`}
      data-film={film.id}
      style={cssVars({ '--scene': SCENES[film.scene].color })}
      onClick={() => onSelect(film.id)}
      aria-label={`${film.title}, ${film.directors.join(' and ')}, ${film.year}`}
    >
      <span className="card-art">
        <span className="strip" aria-hidden="true" />
        <span className="sleeve">
          {path ? (
            <img
              src={poster(path, 'w342')!}
              srcSet={`${poster(path, 'w185')} 185w, ${poster(path, 'w342')} 342w`}
              sizes="(max-width: 640px) 112px, 142px"
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          ) : (
            <span className="sleeve-blank">{film.title}</span>
          )}
          {log?.watchlist && <span className="ribbon" title="On your watchlist" />}
        </span>
        {log?.watched && (
          <span className={`seen${log.favorite ? ' is-favorite' : ''}`} title={logTitle(log)}>
            {log.rating ? starText(log.rating) : '✓'}
            {log.liked && <b>♥</b>}
          </span>
        )}
      </span>
      <span className="card-title">{film.title}</span>
      <span className="card-artist">{film.directors.join(', ')}</span>
    </button>
  )
})
