import { useRef } from 'react'
import type { Layout } from '../layout'
import type { LogsByFilm } from '../logs'
import { SCENES } from '../scenes'

interface MiniMapProps {
  layout: Layout
  lit: ReadonlySet<string> | null
  logs: LogsByFilm | null
  scrollLeft: number
  viewportWidth: number
  /** Called with the clicked position as a fraction (0 to 1) of the whole timeline. */
  onSeek: (fraction: number) => void
}

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
      <div className="minimap-bars">
        {layout.blocks
          .filter((block) => block.films.length > 0)
          .map((block) => (
            <div
              key={block.year}
              className="minimap-bar"
              style={{ left: percent(block.x), width: percent(block.width) }}
            >
              {block.films.map((film) => (
                <span
                  key={film.id}
                  className={`minimap-seg${!logs || logs.get(film.id)?.watched ? ' is-mine' : ''}${lit && !lit.has(film.id) ? ' is-dimmed' : ''}`}
                  style={{ background: SCENES[film.scene].color }}
                />
              ))}
            </div>
          ))}
      </div>
      <div className="minimap-labels">
        {layout.blocks
          .filter((block) => block.year % 10 === 0)
          .map((block) => (
            <span key={block.year} style={{ left: percent(block.x) }}>
              {block.year}
            </span>
          ))}
      </div>
      <div
        className="minimap-window"
        style={{ left: percent(scrollLeft), width: `max(1.2%, ${percent(viewportWidth)})` }}
      />
    </div>
  )
}
