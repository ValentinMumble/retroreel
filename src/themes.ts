/** Themes are two independent choices: a color palette and a font pairing. Both live in localStorage. */

export interface Palette {
  id: string
  name: string
  description: string
  /** Background, accent and heart colors, for the picker. */
  swatch: [string, string, string]
}

export interface FontPairing {
  id: string
  name: string
  description: string
  /** Google Fonts css2 families, loaded when the pairing is used or previewed. */
  families: string
  /** Font of the pairing's name in the picker, as a preview. */
  displayFont: string
}

export const PALETTES: Palette[] = [
  { id: 'velvet', name: 'Velvet', description: 'Cinema seats and gold', swatch: ['#120c0c', '#f2c14e', '#ff4f6d'] },
  { id: 'noir', name: 'Noir', description: 'Black, white and silver', swatch: ['#0c0c0d', '#e2e2e2', '#ff5a5a'] },
  { id: 'sepia', name: 'Sepia', description: 'Silent era browns', swatch: ['#1a140d', '#e8c27a', '#e0603f'] },
  {
    id: 'technicolor',
    name: 'Technicolor',
    description: 'Deep blue, yellow and red',
    swatch: ['#0d0b1a', '#ffd23f', '#ff3b3b'],
  },
  {
    id: 'neon',
    name: 'Neon 80s',
    description: 'Midnight blue, cyan and magenta',
    swatch: ['#0b0820', '#2de2e6', '#ff3cac'],
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Deep green, mint and coral',
    swatch: ['#0c1410', '#7ee0a1', '#ff6f61'],
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Navy, electric blue and pink',
    swatch: ['#0a0f1c', '#5b9dff', '#ff5c8a'],
  },
]

export const FONT_PAIRINGS: FontPairing[] = [
  {
    id: 'poster',
    name: 'Poster',
    description: 'Anton and Inter',
    families: 'family=Anton&family=IBM+Plex+Mono:wght@400;600&family=Inter:wght@400;500;600;700',
    displayFont: "'Anton', sans-serif",
  },
  {
    id: 'serif',
    name: 'Title cards',
    description: 'DM Serif Display and Source Serif',
    families:
      'family=DM+Serif+Display&family=JetBrains+Mono:wght@400;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600',
    displayFont: "'DM Serif Display', serif",
  },
  {
    id: 'groovy',
    name: 'Groovy',
    description: 'Shrikhand and Work Sans',
    families: 'family=DM+Mono:wght@400;500&family=Shrikhand&family=Work+Sans:wght@400;500;600;700',
    displayFont: "'Shrikhand', serif",
  },
  {
    id: 'retro',
    name: 'Retro future',
    description: 'Audiowide and Space Grotesk',
    families: 'family=Audiowide&family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700',
    displayFont: "'Audiowide', sans-serif",
  },
  {
    id: 'typewriter',
    name: 'Screenplay',
    description: 'Rubik Mono One and Courier Prime',
    families: 'family=Courier+Prime:wght@400;700&family=Rubik+Mono+One',
    displayFont: "'Rubik Mono One', sans-serif",
  },
  {
    id: 'editorial',
    name: 'Editorial',
    description: 'Playfair Display and Karla',
    families: 'family=Fira+Code:wght@400;600&family=Karla:wght@400;500;600;700&family=Playfair+Display:wght@700;900',
    displayFont: "'Playfair Display', serif",
  },
  {
    id: 'signage',
    name: 'Marquee',
    description: 'Bungee and Rubik',
    families: 'family=Bungee&family=Roboto+Mono:wght@400;600&family=Rubik:wght@400;500;600;700',
    displayFont: "'Bungee', sans-serif",
  },
]

export const DEFAULT_PALETTE = 'velvet'
export const DEFAULT_FONTS = 'poster'
const PALETTE_KEY = 'retroreel.palette'
const FONTS_KEY = 'retroreel.font'

function read(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage blocked: the choice just won't be remembered.
  }
}

export function storedTheme() {
  const palette = read(PALETTE_KEY)
  const fonts = read(FONTS_KEY)
  return {
    palette: PALETTES.some((option) => option.id === palette) ? (palette as string) : DEFAULT_PALETTE,
    fonts: FONT_PAIRINGS.some((option) => option.id === fonts) ? (fonts as string) : DEFAULT_FONTS,
  }
}

export function loadFonts(pairing: FontPairing) {
  const id = `fonts-${pairing.id}`
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?${pairing.families}&display=swap`
  document.head.append(link)
}

export function applyTheme(theme: { palette: string; fonts: string }) {
  const root = document.documentElement
  if (theme.palette === DEFAULT_PALETTE) delete root.dataset.palette
  else root.dataset.palette = theme.palette
  if (theme.fonts === DEFAULT_FONTS) delete root.dataset.font
  else root.dataset.font = theme.fonts
  const pairing = FONT_PAIRINGS.find((option) => option.id === theme.fonts)
  if (pairing) loadFonts(pairing)
  write(PALETTE_KEY, theme.palette)
  write(FONTS_KEY, theme.fonts)
}
