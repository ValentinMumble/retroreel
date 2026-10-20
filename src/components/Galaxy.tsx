import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force'
import { select } from 'd3-selection'
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { GalaxyLink } from '../api'
import { poster } from '../images'
import type { LogsByFilm } from '../logs'
import { SCENES } from '../scenes'
import type { Film } from '../types'

interface GalaxyProps {
  films: Film[]
  links: GalaxyLink[] | null
  linksError: string | null
  logs: LogsByFilm | null
  selectedId: string | null
  /** "Light up related" from the film panel. */
  lit: ReadonlySet<string> | null
  /** The film panel covers the right side (or the bottom on phones): centre stars in what stays visible. */
  panelOpen: boolean
  firstYear: number
  lastYear: number
  onSelect: (id: string) => void
}

interface Star extends SimulationNodeDatum {
  film: Film
  /** Width of the poster, in galaxy units: posters are 2:3, so 1.5 times as high. */
  size: number
}

interface Beam extends SimulationLinkDatum<Star> {
  strength: number
  kind: GalaxyLink[3]
}

const RING_START = 70
/** 125 years of cinema: narrower rings than Retrospin's 70 years of rock. */
const RING_STEP = 12

/** Each year has its ring: the first year near the centre, today at the rim. */
function ringRadius(year: number, firstYear: number) {
  return RING_START + (year - firstYear) * RING_STEP
}

/** A stable pseudo-random number in [0, 1) for a string, so the galaxy looks the same on every visit. */
function seeded(text: string) {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967296
}

export function Galaxy({
  films,
  links,
  linksError,
  logs,
  selectedId,
  lit,
  panelOpen,
  firstYear,
  lastYear,
  onSelect,
}: GalaxyProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const sceneRef = useRef<SVGGElement>(null)
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const transformRef = useRef<ZoomTransform>(zoomIdentity)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [hover, setHover] = useState<{ star: Star; x: number; y: number } | null>(null)
  /** Every link at once is a lot to read: by default only the selected (or hovered) film's links show. */
  const [showAllLinks, setShowAllLinks] = useState(false)
  /** Dims every film the visitor has not seen. */
  const [highlightSeen, setHighlightSeen] = useState(false)

  const layout = useMemo(() => {
    const ids = new Set(films.map((film) => film.id))
    const visible = (links ?? []).filter(([first, second]) => ids.has(first) && ids.has(second))
    const degree = new Map<string, number>()
    for (const [first, second] of visible) {
      degree.set(first, (degree.get(first) ?? 0) + 1)
      degree.set(second, (degree.get(second) ?? 0) + 1)
    }
    const stars: Star[] = films.map((film) => {
      const angle = seeded(film.id) * Math.PI * 2
      const radius = ringRadius(film.year, firstYear)
      return {
        film,
        size: 16 + Math.min(8, Math.sqrt(degree.get(film.id) ?? 0) * 2.4),
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      }
    })
    const beams: Beam[] = visible.map(([source, target, strength, kind]) => ({ source, target, strength, kind }))
    const simulation = forceSimulation(stars)
      .force(
        'link',
        forceLink<Star, Beam>(beams)
          .id((star) => star.film.id)
          .distance(42)
          .strength((beam) => 0.05 + beam.strength * 0.25),
      )
      .force('charge', forceManyBody<Star>().strength(-12))
      .force('radial', forceRadial<Star>((star) => ringRadius(star.film.year, firstYear)).strength(0.55))
      .force(
        'collide',
        // Between half the width and half the height of the poster: tall posters may overlap a little sideways.
        forceCollide<Star>((star) => star.size * 0.7 + 2),
      )
      .stop()
    // Distance from the centre is time: after each step, put every film back on its year's ring (with a little
    // play so posters can make room). Relations then only move films around the circle, never across years.
    const play = RING_STEP * 0.4
    // Fewer steps when there are many films (the personal layer adds hundreds), so the layout stays well under a
    // second: the ring clamp below keeps the shape, and collisions settle in a few dozen steps.
    const ticks = Math.round(Math.min(300, 140000 / Math.max(stars.length, 1)))
    for (let tick = 0; tick < ticks; tick += 1) {
      simulation.tick()
      for (const star of stars) {
        const ring = ringRadius(star.film.year, firstYear)
        const x = star.x ?? 0
        const y = star.y ?? 0
        const radius = Math.hypot(x, y) || 1
        const kept = Math.min(ring + play, Math.max(ring - play, radius))
        star.x = (x / radius) * kept
        star.y = (y / radius) * kept
      }
    }
    const byId = new Map(stars.map((star) => [star.film.id, star]))
    return { stars, beams, byId }
  }, [films, links, firstYear])

  const neighbours = useMemo(() => {
    if (!selectedId) return null
    const found = new Set<string>([selectedId])
    for (const beam of layout.beams) {
      const source = beam.source as Star
      const target = beam.target as Star
      if (source.film.id === selectedId) found.add(target.film.id)
      if (target.film.id === selectedId) found.add(source.film.id)
    }
    return found
  }, [selectedId, layout])

  const starfield = useMemo(
    () =>
      [...Array(220).keys()].map((index) => ({
        left: seeded(`x${index}`) * 100,
        top: seeded(`y${index}`) * 100,
        radius: 0.4 + seeded(`r${index}`) * 1.1,
        opacity: 0.15 + seeded(`o${index}`) * 0.5,
      })),
    [],
  )

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => setSize({ width: container.clientWidth, height: container.clientHeight }))
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  // Pan with a drag, zoom with the wheel or a pinch.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const behavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.12, 8])
      .on('zoom', (event: { transform: ZoomTransform }) => {
        transformRef.current = event.transform
        sceneRef.current?.setAttribute('transform', event.transform.toString())
        setHover(null)
      })
    select(svg).call(behavior).on('dblclick.zoom', null)
    zoomRef.current = behavior
    return () => {
      select(svg).on('.zoom', null)
    }
  }, [])

  const moveTo = (target: ZoomTransform, duration = 650) => {
    const svg = svgRef.current
    const behavior = zoomRef.current
    if (!svg || !behavior) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (duration <= 0 || reduced) {
      behavior.transform(select(svg), target)
      return
    }
    const start = transformRef.current
    const started = performance.now()
    const frame = (now: number) => {
      const progress = Math.min(1, (now - started) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      const scale = start.k + (target.k - start.k) * eased
      const x = start.x + (target.x - start.x) * eased
      const y = start.y + (target.y - start.y) * eased
      behavior.transform(select(svg), zoomIdentity.translate(x, y).scale(scale))
      if (progress < 1) requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }

  // Fit the whole galaxy on screen when it first appears or its stars change (and nothing is selected).
  const fitted = useRef<string>('')
  useEffect(() => {
    if (!size.width || !size.height || layout.stars.length === 0) return
    const key = `${layout.stars.length}:${size.width > 760}`
    if (fitted.current === key || selectedId) return
    fitted.current = key
    const extent = ringRadius(lastYear, firstYear) + 40
    const scale = Math.min(size.width, size.height) / (extent * 2)
    const target = zoomIdentity.translate(size.width / 2, size.height / 2).scale(scale)
    moveTo(target, 0)
  }, [size, layout, selectedId, firstYear, lastYear])

  // Travel to the selected star, keeping it clear of the film panel.
  useEffect(() => {
    const star = selectedId ? layout.byId.get(selectedId) : null
    if (!star || !size.width) return
    const wide = size.width > 760
    const focusX = panelOpen && wide ? (size.width - 440) / 2 : size.width / 2
    const focusY = panelOpen && !wide ? size.height * 0.28 : size.height / 2
    const scale = Math.max(transformRef.current.k, 1.6)
    moveTo(zoomIdentity.translate(focusX - (star.x ?? 0) * scale, focusY - (star.y ?? 0) * scale).scale(scale))
  }, [selectedId, layout, panelOpen, size.width, size.height])

  const decades: number[] = []
  for (let year = Math.ceil(firstYear / 10) * 10; year <= lastYear; year += 10) decades.push(year)

  const faded = (id: string) => {
    if (neighbours) return !neighbours.has(id)
    if (lit) return !lit.has(id)
    if (highlightSeen && logs) return !logs.get(id)?.watched
    return false
  }
  const labelled = (id: string) => Boolean(neighbours?.has(id)) || hover?.star.film.id === id

  return (
    <div ref={containerRef} className="galaxy">
      <svg className="galaxy-sky" aria-hidden="true">
        {starfield.map((dot, index) => (
          <circle key={index} cx={`${dot.left}%`} cy={`${dot.top}%`} r={dot.radius} opacity={dot.opacity} />
        ))}
      </svg>
      <svg
        ref={svgRef}
        className="galaxy-svg"
        role="img"
        aria-label="Galaxy of films: related films are linked"
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id="galaxy-poster" clipPathUnits="objectBoundingBox">
            <rect width={1} height={1} rx={0.08} ry={0.053} />
          </clipPath>
        </defs>
        <g ref={sceneRef}>
          <g className="galaxy-rings">
            {decades.map((year) => (
              <g key={year}>
                <circle r={ringRadius(year, firstYear)} />
                <text x={0} y={-ringRadius(year, firstYear) - 6}>
                  {year}
                </text>
              </g>
            ))}
          </g>
          <g className="galaxy-links">
            {layout.beams.map((beam) => {
              const source = beam.source as Star
              const target = beam.target as Star
              const active = Boolean(selectedId && (source.film.id === selectedId || target.film.id === selectedId))
              const hovered = hover !== null && (source === hover.star || target === hover.star)
              if (!showAllLinks && !active && !hovered) return null
              const dim = faded(source.film.id) || faded(target.film.id)
              return (
                <line
                  key={`${source.film.id}|${target.film.id}`}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  className={`galaxy-link is-${beam.kind}${active ? ' is-active' : ''}${dim && !active ? ' is-faded' : ''}`}
                  strokeWidth={0.4 + beam.strength * 1.2}
                />
              )
            })}
          </g>
          <g className="galaxy-stars">
            {layout.stars.map((star) => {
              const { film } = star
              const width = star.size
              const height = star.size * 1.5
              // Sharp posters for the selected film and its neighbours, light thumbnails for the rest.
              const sharp = neighbours?.has(film.id) ?? false
              const cover = poster(film.tmdb?.poster, sharp ? 'w185' : 'w92')
              const log = logs?.get(film.id)
              const classes = [
                'galaxy-star',
                film.id === selectedId ? 'is-selected' : '',
                faded(film.id) ? 'is-faded' : '',
                log?.watched ? 'is-seen' : '',
                log?.liked ? 'is-liked' : '',
                film.personal ? 'is-personal' : '',
              ]
              return (
                <g
                  key={film.id}
                  className={classes.filter(Boolean).join(' ')}
                  transform={`translate(${star.x} ${star.y})`}
                  style={{ color: SCENES[film.scene].color }}
                  onClick={() => onSelect(film.id)}
                  onPointerEnter={(event) => {
                    const rect = containerRef.current?.getBoundingClientRect()
                    if (rect) setHover({ star, x: event.clientX - rect.left, y: event.clientY - rect.top })
                  }}
                  onPointerLeave={() => setHover((current) => (current?.star === star ? null : current))}
                >
                  <rect
                    className="galaxy-frame"
                    x={-width / 2}
                    y={-height / 2}
                    width={width}
                    height={height}
                    rx={width * 0.08}
                  />
                  {cover && (
                    <image
                      href={cover}
                      x={-width / 2}
                      y={-height / 2}
                      width={width}
                      height={height}
                      preserveAspectRatio="xMidYMid slice"
                      clipPath="url(#galaxy-poster)"
                    />
                  )}
                  {log?.liked && (
                    <g className="galaxy-heart" transform={`translate(${width / 2 - 1} ${-height / 2 + 1})`}>
                      <circle r={Math.max(4.5, width * 0.24)} />
                      <text>♥</text>
                    </g>
                  )}
                  {labelled(film.id) && (
                    <text className="galaxy-label" x={0} y={height / 2 + 12}>
                      {film.title}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        </g>
      </svg>

      {hover && (
        <div className="galaxy-tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          {hover.star.film.tmdb?.poster && <img src={poster(hover.star.film.tmdb.poster, 'w92')!} alt="" />}
          <span>
            <b>{hover.star.film.title}</b>
            <span>
              {hover.star.film.directors.join(', ')} · {hover.star.film.year}
            </span>
          </span>
        </div>
      )}

      <div className="galaxy-hint">
        <p>
          {linksError
            ? `No links yet: ${linksError}`
            : links === null
              ? 'Charting the galaxy…'
              : `The centre is ${firstYear}, the rim is today. Related films sit close. A green ring means you have seen it, a heart that you liked it. Drag, scroll or pinch to move, click a film to see its links.`}
        </p>
        {logs && (
          <button
            type="button"
            className="toggle"
            aria-pressed={highlightSeen}
            onClick={() => setHighlightSeen((value) => !value)}
          >
            <span aria-hidden="true">✓</span> {highlightSeen ? 'Show everything' : 'Highlight what I have seen'}
          </button>
        )}
        <button
          type="button"
          className="toggle"
          aria-pressed={showAllLinks}
          onClick={() => setShowAllLinks((value) => !value)}
        >
          {showAllLinks ? 'Hide links' : 'Show all links'}
        </button>
      </div>
    </div>
  )
}
