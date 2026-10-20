import { memo, useRef } from 'react'
import type { Layout, YearBlock } from '../layout'
import type { LogsByFilm } from '../logs'
import { SCENE_ORDER, SCENES } from '../scenes'

interface MiniMapProps {
  layout: Layout
  lit: ReadonlySet<string> | null
  logs: LogsByFilm | null
  scrollLeft: number
  viewportWidth: number
  /** Called with the clicked position as a fraction (0 to 1) of the whole timeline. */
  onSeek: (fraction: number) => void
}

/** Up to this many films in a year, each film is its own line; past it, a year's bar shows its scenes' shares. */
const LINES_UP_TO = 12
/** Room a decade label needs on the strip, in pixels. */
const LABEL_ROOM = 44

interface Share {
  key: string
  color: string
  count: number
  mine: boolean
  dimmed: boolean
}

interface StripProps {
  layout: Layout
  lit: ReadonlySet<string> | null
  logs: LogsByFilm | null
  viewportWidth: number
}

/** The bars and the decade labels: drawn again when the films or filters change, not on every scroll frame. */
const Strip = memo(function Strip({ layout, lit, logs, viewportWidth }: StripProps) {
  const percent = (value: number) => `${(value / layout.total) * 100}%`
  const filled = layout.blocks.filter((block) => block.films.length > 0)
  const busiest = Math.max(1, ...filled.map((block) => block.films.length))
  const stacked = busiest > LINES_UP_TO
  const mine = (id: string) => !logs || Boolean(logs.get(id)?.watched)
  const dimmed = (id: string) => Boolean(lit && !lit.has(id))

  /** A year's films grouped by scene (and by mine and dimmed, which change the opacity), in scene order. */
  const shares = (block: YearBlock) => {
    const groups = new Map<string, Share>()
    for (const film of block.films) {
      const key = `${film.scene}|${mine(film.id)}|${dimmed(film.id)}`
      const group = groups.get(key)
      if (group) group.count += 1
      else
        groups.set(key, {
          key,
          color: SCENES[film.scene].color,
          count: 1,
          mine: mine(film.id),
          dimmed: dimmed(film.id),
        })
    }
    const order = (share: Share) => SCENE_ORDER.indexOf(share.key.split('|')[0] as (typeof SCENE_ORDER)[number])
    return [...groups.values()].sort((first, second) => order(first) - order(second))
  }

  // Decade labels, skipping the ones that would collide with the previous one (the early decades are narrow).
  const mapWidth = Math.max(200, viewportWidth - 40)
  const minGap = (LABEL_ROOM / mapWidth) * layout.total
  const labels = layout.blocks
    .filter((block) => block.year % 10 === 0)
    .reduce<YearBlock[]>((kept, block) => {
      const previous = kept[kept.length - 1]
      return !previous || block.x - previous.x >= minGap ? [...kept, block] : kept
    }, [])

  return (
    <>
      <div className="minimap-bars">
        {filled.map((block) =>
          stacked ? (
            <div
              key={block.year}
              className="minimap-bar is-stacked"
              style={{
                left: percent(block.x),
                width: percent(block.width),
                // Square root: a year with one film stays visible next to one with sixty.
                height: `${Math.sqrt(block.films.length / busiest) * 100}%`,
              }}
            >
              {shares(block).map((share) => (
                <span
                  key={share.key}
                  className={`minimap-seg${share.mine ? ' is-mine' : ''}${share.dimmed ? ' is-dimmed' : ''}`}
                  style={{ background: share.color, flexGrow: share.count }}
                />
              ))}
            </div>
          ) : (
            <div
              key={block.year}
              className="minimap-bar"
              style={{ left: percent(block.x), width: percent(block.width) }}
            >
              {block.films.map((film) => (
                <span
                  key={film.id}
                  className={`minimap-seg${mine(film.id) ? ' is-mine' : ''}${dimmed(film.id) ? ' is-dimmed' : ''}`}
                  style={{ background: SCENES[film.scene].color }}
                />
              ))}
            </div>
          ),
        )}
      </div>
      <div className="minimap-labels">
        {labels.map((block) => (
          <span key={block.year} style={{ left: percent(block.x) }}>
            {block.year}
          </span>
        ))}
      </div>
    </>
  )
})

export function MiniMap({ layout, lit, logs, scrollLeft, viewportWidth, onSeek }: MiniMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const percent = (value: number) => `${(value / layout.total) * 100}%`

  const seekTo = (clientX: number) => {
    const rect = mapRef.current?.getBoundingClientRect()
    if (rect) onSeek(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)))
  }

  return (
    <div
      ref={mapRef}
      className="minimap"
      aria-hidden="true"
      onPointerDown={(event) => {
        dragging.current = true
        event.currentTarget.setPointerCapture(event.pointerId)
        seekTo(event.clientX)
      }}
      onPointerMove={(event) => {
        if (dragging.current) seekTo(event.clientX)
      }}
      onPointerUp={() => {
        dragging.current = false
      }}
      onPointerCancel={() => {
        dragging.current = false
      }}
    >
      <Strip layout={layout} lit={lit} logs={logs} viewportWidth={viewportWidth} />
      <div
        className="minimap-window"
        style={{ left: percent(scrollLeft), width: `max(1.2%, ${percent(viewportWidth)})` }}
      />
    </div>
  )
}
