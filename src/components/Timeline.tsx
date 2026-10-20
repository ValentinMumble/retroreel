import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react'
import { ERAS } from '../eras'
import { buildLayout, measure, spanOf, yearAt, type Layout } from '../layout'
import type { LogsByFilm } from '../logs'
import { SCENES } from '../scenes'
import { cssVars } from '../style'
import type { Film } from '../types'
import { FilmCard } from './FilmCard'
import { MiniMap } from './MiniMap'

export interface TimelineHandle {
  scrollToYear: (year: number) => void
  scrollToFilm: (id: string, smooth?: boolean) => void
  /** Moves by about two cards, or by most of the screen when `page` is true. */
  step: (direction: 1 | -1, page?: boolean) => void
  scrollToEdge: (edge: 'start' | 'end') => void
}

interface TimelineProps {
  /** Hidden while another view shows: it stays mounted so it keeps its place. */
  hidden: boolean
  films: Film[]
  /** When set, only these films stay bright (light up related). */
  lit: ReadonlySet<string> | null
  firstYear: number
  lastYear: number
  logs: LogsByFilm | null
  selectedId: string | null
  onSelect: (id: string) => void
  onCenterYearChange: (year: number) => void
  intro: ReactNode
  outro: ReactNode
  empty: ReactNode
  ref?: Ref<TimelineHandle>
}

const YEAR_KEY = 'retroreel.year'

/** The year in the middle of the screen on the last visit, or null for the start. */
function savedYear() {
  try {
    const year = Number(localStorage.getItem(YEAR_KEY))
    return Number.isInteger(year) && year > 1880 ? year : null
  } catch {
    return null
  }
}

function saveYear(year: number | null) {
  try {
    if (year === null) localStorage.removeItem(YEAR_KEY)
    else localStorage.setItem(YEAR_KEY, String(year))
  } catch {
    // Storage blocked: the position just won't be remembered.
  }
}

function scrollBehavior(smooth = true): ScrollBehavior {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return smooth && !reduced ? 'smooth' : 'auto'
}

const Eras = memo(function Eras({ layout }: { layout: Layout }) {
  return (
    <div className="eras" aria-hidden="true">
      {ERAS.map((era) => {
        const span = spanOf(layout, era.start, era.end)
        if (!span) return null
        return (
          <div
            key={era.label}
            className="era"
            title={`${era.label}, ${era.start} to ${era.end}: ${era.blurb}`}
            style={cssVars(
              { '--era': SCENES[era.scene].color },
              { left: span.left, width: span.width, top: 10 + era.lane * 26 },
            )}
          >
            <span className="era-label">{era.label}</span>
          </div>
        )
      })}
    </div>
  )
})

/**
 * The year blocks near the screen (a screen and a half on each side, more ahead): only their cards are in the
 * page, so a timeline of thousands of films scrolls as smoothly as a short one. Other years keep their width.
 */
function nearBlocks(layout: Layout, left: number, width: number) {
  const start = left - width * 1.5
  const end = left + width * 2.5
  let from = layout.blocks.length
  let to = -1
  layout.blocks.forEach((block, index) => {
    if (block.x + block.width < start || block.x > end) return
    from = Math.min(from, index)
    to = Math.max(to, index)
  })
  return { from, to }
}

interface YearBlocksProps {
  /** Index range of the blocks whose cards are rendered. */
  from: number
  to: number
  layout: Layout
  lit: ReadonlySet<string> | null
  logs: LogsByFilm | null
  selectedId: string | null
  onSelect: (id: string) => void
}

const YearBlocks = memo(function YearBlocks({ from, to, layout, lit, logs, selectedId, onSelect }: YearBlocksProps) {
  return (
    <div className="years">
      {layout.blocks.map((block, index) => {
        const decadeStart = block.year % 10 === 0 || index === 0
        const classes = ['year', block.year % 10 === 0 ? 'is-decade' : '', block.films.length ? '' : 'is-empty']
        return (
          <section
            key={block.year}
            className={classes.filter(Boolean).join(' ')}
            style={{ width: block.width }}
            aria-label={String(block.year)}
          >
            <div className="year-head">
              <span className="year-label">{block.year}</span>
            </div>
            {block.films.length > 0 && index >= from && index <= to && (
              <div className="year-grid">
                {block.films.map((film) => (
                  <FilmCard
                    key={film.id}
                    film={film}
                    log={logs?.get(film.id)}
                    selected={film.id === selectedId}
                    dimmed={lit !== null && !lit.has(film.id)}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            )}
            {decadeStart && (
              <span className="decade-ghost" aria-hidden="true">
                {String(block.year - (block.year % 10)).slice(2)}s
              </span>
            )}
          </section>
        )
      })}
    </div>
  )
})

export function Timeline({
  hidden,
  films,
  lit,
  firstYear,
  lastYear,
  logs,
  selectedId,
  onSelect,
  onCenterYearChange,
  intro,
  outro,
  empty,
  ref,
}: TimelineProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight - 180 })
  const [scrollLeft, setScrollLeft] = useState(0)
  const metrics = useMemo(() => measure(viewport.width, viewport.height), [viewport])
  const layout = useMemo(() => buildLayout(films, metrics, firstYear, lastYear), [films, metrics, firstYear, lastYear])

  // Values read by the stable scroll handler.
  const layoutRef = useRef(layout)
  const centerCallback = useRef(onCenterYearChange)
  const anchorYear = useRef<number | null>(null)
  const lastCenter = useRef<number | null>(null)
  const frame = useRef(0)
  useLayoutEffect(() => {
    layoutRef.current = layout
    centerCallback.current = onCenterYearChange
  })

  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const observer = new ResizeObserver(() =>
      setViewport({ width: scroller.clientWidth, height: scroller.clientHeight }),
    )
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [])

  // When filters or the window size change the layout, keep the same year in the middle of the screen.
  // On the first layout with films (and a visible timeline), go back to the year saved on the last visit.
  const restored = useRef(false)
  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    let restoring = false
    if (!restored.current && films.length > 0 && scroller.clientWidth > 0) {
      restored.current = true
      anchorYear.current = savedYear()
      restoring = anchorYear.current !== null
    }
    const block = layout.blocks.find((candidate) => candidate.year === anchorYear.current)
    if (block) scroller.scrollLeft = block.x + block.width / 2 - scroller.clientWidth / 2
    if (block && restoring) {
      lastCenter.current = block.year
      centerCallback.current(block.year)
    }
  }, [layout, films.length])

  const handleScroll = useCallback(() => {
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const scroller = scrollerRef.current
      if (!scroller) return
      setScrollLeft(scroller.scrollLeft)
      const center = yearAt(layoutRef.current, scroller.scrollLeft + scroller.clientWidth / 2)
      anchorYear.current = scroller.scrollLeft < 8 ? null : center
      if (restored.current && scroller.clientWidth > 0) saveYear(anchorYear.current)
      if (center !== lastCenter.current) {
        lastCenter.current = center
        centerCallback.current(center)
      }
    })
  }, [])

  // Vertical wheel scrolls sideways; mouse drag pans; a drag never counts as a click.
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return
    let drag: { pointerId: number; startX: number; startLeft: number; moved: boolean } | null = null
    let swallowClick = false

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      const unit = event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? scroller.clientWidth : 1
      scroller.scrollLeft += delta * unit
      event.preventDefault()
    }
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return
      drag = { pointerId: event.pointerId, startX: event.clientX, startLeft: scroller.scrollLeft, moved: false }
    }
    const onPointerMove = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return
      const distance = event.clientX - drag.startX
      if (!drag.moved && Math.abs(distance) > 5) {
        drag.moved = true
        try {
          scroller.setPointerCapture(event.pointerId)
        } catch {
          // The pointer is already gone (released between events): dragging still works without capture.
        }
        scroller.classList.add('is-dragging')
      }
      if (drag.moved) scroller.scrollLeft = drag.startLeft - distance
    }
    const onPointerUp = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return
      if (drag.moved) {
        swallowClick = true
        window.setTimeout(() => {
          swallowClick = false
        }, 0)
      }
      drag = null
      scroller.classList.remove('is-dragging')
    }
    const onClickCapture = (event: MouseEvent) => {
      if (!swallowClick) return
      event.stopPropagation()
      event.preventDefault()
    }

    scroller.addEventListener('wheel', onWheel, { passive: false })
    scroller.addEventListener('pointerdown', onPointerDown)
    scroller.addEventListener('pointermove', onPointerMove)
    scroller.addEventListener('pointerup', onPointerUp)
    scroller.addEventListener('pointercancel', onPointerUp)
    scroller.addEventListener('click', onClickCapture, true)
    return () => {
      scroller.removeEventListener('wheel', onWheel)
      scroller.removeEventListener('pointerdown', onPointerDown)
      scroller.removeEventListener('pointermove', onPointerMove)
      scroller.removeEventListener('pointerup', onPointerUp)
      scroller.removeEventListener('pointercancel', onPointerUp)
      scroller.removeEventListener('click', onClickCapture, true)
    }
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      scrollToYear(year) {
        const blocks = layout.blocks.filter((block) => block.films.length > 0)
        const block = blocks.find((candidate) => candidate.year >= year) ?? blocks[blocks.length - 1]
        if (block) scrollerRef.current?.scrollTo({ left: block.x - metrics.gapX, behavior: scrollBehavior() })
      },
      scrollToFilm(id, smooth = true) {
        // Worked out from the layout: the card may not be in the page yet (only years near the screen are).
        const scroller = scrollerRef.current
        const block = layout.blocks.find((candidate) => candidate.films.some((film) => film.id === id))
        if (!scroller || !block) return
        const column = Math.floor(block.films.findIndex((film) => film.id === id) / metrics.rows)
        const center = block.x + metrics.gapX / 2 + column * (metrics.cardWidth + metrics.gapX) + metrics.cardWidth / 2
        scroller.scrollTo({ left: center - scroller.clientWidth / 2, behavior: scrollBehavior(smooth) })
      },
      step(direction, page = false) {
        const scroller = scrollerRef.current
        if (!scroller) return
        const amount = page ? scroller.clientWidth * 0.85 : (metrics.cardWidth + metrics.gapX) * 2
        scroller.scrollBy({ left: direction * amount, behavior: scrollBehavior() })
      },
      scrollToEdge(edge) {
        scrollerRef.current?.scrollTo({ left: edge === 'start' ? 0 : layout.total, behavior: scrollBehavior() })
      },
    }),
    [layout, metrics],
  )

  const seek = useCallback(
    (fraction: number) => {
      const scroller = scrollerRef.current
      if (scroller) scroller.scrollLeft = fraction * layout.total - scroller.clientWidth / 2
    },
    [layout],
  )

  const near = nearBlocks(layout, scrollLeft, viewport.width)

  const style = cssVars({
    '--card-w': `${metrics.cardWidth}px`,
    '--card-h': `${metrics.cardHeight}px`,
    '--poster-h': `${metrics.posterHeight}px`,
    '--gap-x': `${metrics.gapX}px`,
    '--gap-y': `${metrics.gapY}px`,
    '--rows': metrics.rows,
    '--eras-h': `${metrics.erasHeight}px`,
    '--axis-h': `${metrics.axisHeight}px`,
  })

  return (
    <div className="timeline" style={style} hidden={hidden}>
      <div ref={scrollerRef} className="scroller" onScroll={handleScroll}>
        <div className="track" style={{ width: layout.total }}>
          <Eras layout={layout} />
          <div className="intro" style={{ width: layout.introWidth }}>
            {intro}
            {films.length === 0 && <div className="empty">{empty}</div>}
          </div>
          <YearBlocks
            from={near.from}
            to={near.to}
            layout={layout}
            lit={lit}
            logs={logs}
            selectedId={selectedId}
            onSelect={onSelect}
          />
          <div className="outro" style={{ width: layout.outroWidth }}>
            {outro}
          </div>
        </div>
      </div>
      <MiniMap
        layout={layout}
        lit={lit}
        logs={logs}
        scrollLeft={scrollLeft}
        viewportWidth={viewport.width}
        onSeek={seek}
      />
    </div>
  )
}
