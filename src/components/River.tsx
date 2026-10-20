import { area, curveBasis, stack, stackOffsetWiggle, stackOrderInsideOut, type Series } from 'd3-shape'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ERAS } from '../eras'
import { SCENE_ORDER, SCENES } from '../scenes'
import type { Film, SceneKey } from '../types'

interface RiverProps {
  films: Film[]
  firstYear: number
  lastYear: number
  /** A click on a band: show that scene on the timeline, around that year. */
  onPick: (scene: SceneKey, year: number) => void
}

type Row = Record<SceneKey, number> & { year: number }

/** Films are counted over five years around each year, so the bands flow instead of spiking. */
const SMOOTHING = 2
const MARGIN = { top: 70, right: 24, bottom: 34, left: 24 }

/** Films per scene over time, as a stream: scenes swell and fade decade by decade. */
export function River({ films, firstYear, lastYear, onPick }: RiverProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [hover, setHover] = useState<{ year: number; scene: SceneKey | null; x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => setSize({ width: container.clientWidth, height: container.clientHeight }))
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const { counts, scenes, series } = useMemo(() => {
    const raw = new Map<number, Map<SceneKey, number>>()
    for (const film of films) {
      const year = raw.get(film.year) ?? new Map<SceneKey, number>()
      year.set(film.scene, (year.get(film.scene) ?? 0) + 1)
      raw.set(film.year, year)
    }
    const present = SCENE_ORDER.filter((scene) => films.some((film) => film.scene === scene))
    const rows: Row[] = []
    for (let year = firstYear; year <= lastYear; year += 1) {
      const row = { year } as Row
      for (const scene of present) {
        let sum = 0
        for (let offset = -SMOOTHING; offset <= SMOOTHING; offset += 1) sum += raw.get(year + offset)?.get(scene) ?? 0
        row[scene] = sum / (SMOOTHING * 2 + 1)
      }
      rows.push(row)
    }
    const stacked = stack<Row, SceneKey>().keys(present).offset(stackOffsetWiggle).order(stackOrderInsideOut)(rows)
    return { counts: raw, scenes: present, series: stacked }
  }, [films, firstYear, lastYear])

  const width = Math.max(0, size.width - MARGIN.left - MARGIN.right)
  const height = Math.max(0, size.height - MARGIN.top - MARGIN.bottom)
  const low = Math.min(0, ...series.flatMap((band) => band.map((point) => point[0])))
  const high = Math.max(1, ...series.flatMap((band) => band.map((point) => point[1])))
  const x = (year: number) => MARGIN.left + ((year - firstYear) / Math.max(1, lastYear - firstYear)) * width
  const y = (value: number) => MARGIN.top + height - ((value - low) / (high - low)) * height
  const shape = area<Series<Row, SceneKey>[number]>()
    .x((point) => x(point.data.year))
    .y0((point) => y(point[0]))
    .y1((point) => y(point[1]))
    .curve(curveBasis)

  /** Where to write a scene's name: its thickest year, if the band is thick enough there. */
  const labelOf = (band: Series<Row, SceneKey>) => {
    let best = band[0]
    for (const point of band) if (point[1] - point[0] > best[1] - best[0]) best = point
    const thickness = y(best[0]) - y(best[1])
    return thickness >= 15 ? { x: x(best.data.year), y: (y(best[0]) + y(best[1])) / 2 } : null
  }

  const yearAt = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || width === 0) return null
    const fraction = (clientX - rect.left - MARGIN.left) / width
    return Math.round(firstYear + Math.min(1, Math.max(0, fraction)) * (lastYear - firstYear))
  }

  const decades: number[] = []
  for (let year = Math.ceil(firstYear / 10) * 10; year <= lastYear; year += 10) decades.push(year)
  const hoverCounts = hover
    ? scenes
        .map((scene) => ({ scene, count: counts.get(hover.year)?.get(scene) ?? 0 }))
        .filter((item) => item.count > 0)
        .sort((first, second) => second.count - first.count)
    : []

  return (
    <div className="river-view">
      <div className="view-toolbar">
        <p>
          Films per scene over time, smoothed over five years. <strong>Click a band</strong> to see that scene on the
          timeline.
        </p>
      </div>
      <div
        ref={containerRef}
        className="river-stage"
        onPointerMove={(event) => {
          const year = yearAt(event.clientX)
          const rect = containerRef.current?.getBoundingClientRect()
          if (year === null || !rect) return
          const target = event.target instanceof Element ? event.target.closest('[data-scene]') : null
          const scene = (target?.getAttribute('data-scene') as SceneKey | null) ?? null
          setHover({ year, scene, x: event.clientX - rect.left, y: event.clientY - rect.top })
        }}
        onPointerLeave={() => setHover(null)}
      >
        <svg className="river-svg" role="img" aria-label="Films per scene over time">
          <g className="river-eras">
            {ERAS.filter((era) => era.end >= firstYear && era.start <= lastYear).map((era) => {
              const left = x(Math.max(era.start, firstYear))
              const span = Math.max(2, x(Math.min(era.end, lastYear) + 1) - left - 3)
              return (
                <g key={era.label} transform={`translate(${left} ${14 + era.lane * 22})`}>
                  <title>{`${era.label}, ${era.start} to ${era.end}: ${era.blurb}`}</title>
                  <rect width={span} height={16} rx={3} style={{ fill: SCENES[era.scene].color }} />
                  {/* The name only where it fits: short eras keep their color and their tooltip. */}
                  {span >= era.label.length * 6.6 + 10 && (
                    <text x={6} y={11.5}>
                      {era.label}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
          <g className="river-decades">
            {decades.map((year) => (
              <g key={year}>
                <line x1={x(year)} x2={x(year)} y1={MARGIN.top - 6} y2={MARGIN.top + height} />
                <text x={x(year)} y={MARGIN.top + height + 20}>
                  {year}
                </text>
              </g>
            ))}
          </g>
          <g className="river-bands">
            {series.map((band) => (
              <path
                key={band.key}
                data-scene={band.key}
                className={`river-band${hover?.scene && hover.scene !== band.key ? ' is-faded' : ''}`}
                d={shape(band) ?? undefined}
                style={{ fill: SCENES[band.key].color }}
                onClick={() => hover && onPick(band.key, hover.year)}
              />
            ))}
          </g>
          <g className="river-labels">
            {series.map((band) => {
              const label = labelOf(band)
              return label ? (
                <text key={band.key} x={label.x} y={label.y}>
                  {SCENES[band.key].label}
                </text>
              ) : null
            })}
          </g>
          {hover && (
            <line
              className="river-rule"
              x1={x(hover.year)}
              x2={x(hover.year)}
              y1={MARGIN.top}
              y2={MARGIN.top + height}
            />
          )}
        </svg>
        {hover && (
          <div
            className="view-tooltip river-tooltip"
            style={{ left: Math.min(hover.x + 14, size.width - 230), top: hover.y + 14 }}
          >
            <span>
              <b>
                {hover.year}
                {hover.scene ? ` · ${SCENES[hover.scene].label}` : ''}
              </b>
              <span>
                {hoverCounts.length === 0
                  ? 'No film this year'
                  : hoverCounts.map((item) => `${item.count} ${SCENES[item.scene].label}`).join(', ')}
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
