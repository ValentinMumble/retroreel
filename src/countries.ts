const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })

export function countryName(code: string) {
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
