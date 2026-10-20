import { useEffect, useRef, useState } from 'react'
import { applyTheme, FONT_PAIRINGS, loadFonts, PALETTES, storedTheme } from '../themes'

export function ThemePicker() {
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState(storedTheme)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    // Load every pairing's fonts so each name previews in its own type.
    FONT_PAIRINGS.forEach(loadFonts)
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !pickerRef.current?.contains(event.target)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const choose = (change: Partial<typeof theme>) => {
    const next = { ...theme, ...change }
    applyTheme(next)
    setTheme(next)
  }

  return (
    <div ref={pickerRef} className="theme-picker">
      <button
        type="button"
        className="theme-button"
        aria-label="Change colors and fonts"
        aria-expanded={open}
        title="Colors and fonts"
        onClick={() => setOpen((value) => !value)}
      />
      {open && (
        <div className="theme-menu">
          <p className="theme-section">Colors</p>
          <div role="radiogroup" aria-label="Colors">
            {PALETTES.map((palette) => (
              <button
                key={palette.id}
                type="button"
                role="radio"
                aria-checked={palette.id === theme.palette}
                className="theme-option"
                onClick={() => choose({ palette: palette.id })}
              >
                <span className="theme-swatch" aria-hidden="true">
                  {palette.swatch.map((color) => (
                    <span key={color} style={{ background: color }} />
                  ))}
                </span>
                <span>
                  <span className="theme-name">{palette.name}</span>
                  <span className="theme-description">{palette.description}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="theme-section">Type</p>
          <div role="radiogroup" aria-label="Type">
            {FONT_PAIRINGS.map((pairing) => (
              <button
                key={pairing.id}
                type="button"
                role="radio"
                aria-checked={pairing.id === theme.fonts}
                className="theme-option"
                onClick={() => choose({ fonts: pairing.id })}
              >
                <span>
                  <span className="theme-name" style={{ fontFamily: pairing.displayFont }}>
                    {pairing.name}
                  </span>
                  <span className="theme-description">{pairing.description}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
