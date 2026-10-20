import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { poster } from '../images'
import { normalize, type LogsByFilm } from '../logs'
import { SCENES } from '../scenes'
import { cssVars } from '../style'
import type { Film } from '../types'

interface DirectorsProps {
  films: Film[]
  logs: LogsByFilm | null
  /** When set, only these films stay bright (search, light up related). */
  lit: ReadonlySet<string> | null
  selectedId: string | null
  firstYear: number
  lastYear: number
  onSelect: (id: string) => void
}

type Order = 'start' | 'count'

interface Career {
  key: string
  name: string
  films: Film[]
  first: number
  last: number
  seen: number
}

const YEAR_WIDTH = 26
const ORDER_KEY = 'retroreel.directors'

function storedOrder(): Order {
  try {
    return localStorage.getItem(ORDER_KEY) === 'count' ? 'count' : 'start'
  } catch {
    return 'start'
  }
}

/** One row per director with two films or more: their career on the same year axis as the timeline. */
export function Directors({ films, logs, lit, selectedId, firstYear, lastYear, onSelect }: DirectorsProps) {
  const [order, setOrder] = useState<Order>(storedOrder)
  const scrollRef = useRef<HTMLDivElement>(null)

  const careers = useMemo(() => {
    // Grouped without spaces, hyphens or accents: "Kore-eda" and "Koreeda" are the same director.
    const byDirector = new Map<string, Career>()
    for (const film of films) {
      for (const name of film.directors) {
        const key = normalize(name).replace(/ /g, '')
        const career = byDirector.get(key) ?? { key, name, films: [], first: film.year, last: film.year, seen: 0 }
        career.films.push(film)
        career.first = Math.min(career.first, film.year)
        career.last = Math.max(career.last, film.year)
        if (logs?.get(film.id)?.watched) career.seen += 1
        byDirector.set(key, career)
      }
    }
    const rows = [...byDirector.values()].filter((career) => career.films.length >= 2)
    for (const career of rows) career.films.sort((first, second) => first.date.localeCompare(second.date))
    return rows.sort((first, second) =>
      order === 'start'
        ? first.first - second.first || second.films.length - first.films.length
        : second.films.length - first.films.length || first.first - second.first,
    )
  }, [films, logs, order])

  // Open where the first rows' careers start, not in empty early decades.
  const startYear = Math.min(...careers.slice(0, 12).map((career) => career.first))
  useLayoutEffect(() => {
    if (Number.isFinite(startYear)) scrollRef.current?.scrollTo({ left: (startYear - firstYear) * YEAR_WIDTH - 40 })
  }, [startYear, firstYear, order])

  const choose = (next: Order) => {
    setOrder(next)
    try {
      localStorage.setItem(ORDER_KEY, next)
    } catch {
      // Storage blocked: the order just won't be remembered.
    }
  }

  const x = (year: number) => (year - firstYear) * YEAR_WIDTH
  const decades: number[] = []
  for (let year = Math.ceil(firstYear / 10) * 10; year <= lastYear; year += 10) decades.push(year)
  // Measured from the name column, whose width the stylesheet sets (narrower on phones).
  const fromNames = (pixels: number) => `calc(var(--name-w) + ${pixels}px)`

  return (
    <div className="directors-view">
      <div className="view-toolbar">
        <p>
          <strong>{careers.length} directors</strong> with two films or more
          {logs ? ', with how many you have seen' : ''}.
        </p>
        <div className="view-switch" role="group" aria-label="Order">
          <button type="button" aria-pressed={order === 'start'} onClick={() => choose('start')}>
            By first film
          </button>
          <button type="button" aria-pressed={order === 'count'} onClick={() => choose('count')}>
            By number of films
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="directors-scroll" style={cssVars({ '--year-w': `${YEAR_WIDTH}px` })}>
        <div className="directors-grid" style={{ width: fromNames(x(lastYear + 1)) }}>
          <div className="directors-axis">
            <span className="director-name" />
            {decades.map((year) => (
              <span key={year} className="directors-decade" style={{ left: fromNames(x(year)) }}>
                {year}
              </span>
            ))}
          </div>
          {careers.map((career) => (
            <div key={career.key} className="director-row">
              <span className="director-name" title={career.name}>
                <span className="director-label">{career.name}</span>
                <span className="director-count">
                  {career.films.length} films{logs ? ` · ${career.seen} seen` : ''}
                </span>
              </span>
              <span className="director-track">
                <span
                  className="director-career"
                  style={{ left: x(career.first) + 12, width: x(career.last) - x(career.first) }}
                />
                {career.films.map((film, index) => {
                  // Films of the same year step aside a little, so each stays visible.
                  const sameYearBefore = career.films.slice(0, index).filter((other) => other.year === film.year).length
                  const log = logs?.get(film.id)
                  const classes = [
                    'director-film',
                    film.id === selectedId ? 'is-selected' : '',
                    lit && !lit.has(film.id) ? 'is-dimmed' : '',
                    log?.watched ? 'is-seen' : '',
                    log?.liked ? 'is-liked' : '',
                    film.personal ? 'is-personal' : '',
                  ]
                  const path = film.tmdb?.poster
                  return (
                    <button
                      key={film.id}
                      type="button"
                      data-film={film.id}
                      className={classes.filter(Boolean).join(' ')}
                      style={cssVars(
                        { '--scene': SCENES[film.scene].color },
                        { left: x(film.year) + sameYearBefore * 9, top: 7 + sameYearBefore * 4 },
                      )}
                      title={`${film.title} (${film.year})`}
                      aria-label={`${film.title}, ${film.year}`}
                      onClick={() => onSelect(film.id)}
                    >
                      {path ? <img src={poster(path, 'w92')!} alt="" loading="lazy" decoding="async" /> : null}
                    </button>
                  )
                })}
              </span>
            </div>
          ))}
          {careers.length === 0 && <p className="view-empty">No director has two films in this selection.</p>}
        </div>
      </div>
    </div>
  )
}
