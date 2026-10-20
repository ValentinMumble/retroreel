const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })

/** Codes TMDB still uses for countries that no longer exist, which the browser does not name. */
const FORMER: Record<string, string> = {
  SU: 'Soviet Union',
  XC: 'Czechoslovakia',
  YU: 'Yugoslavia',
  DD: 'East Germany',
  XG: 'East Germany',
}

export function countryName(code: string) {
  if (FORMER[code]) return FORMER[code]
  try {
    return regionNames.of(code) ?? code
  } catch {
    return code
  }
}

/** The flag emoji for a two-letter country code. */
export function flag(code: string) {
  return code.toUpperCase().replace(/[A-Z]/g, (letter) => String.fromCodePoint(0x1f1a5 + letter.charCodeAt(0)))
}
