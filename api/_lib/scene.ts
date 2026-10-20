import type { SceneKey } from '../../src/types'
import type { MovieDetails } from './tmdb.js'

export const SCENE_KEYS: SceneKey[] = [
  'silent',
  'classic',
  'romance',
  'crime',
  'western',
  'epic',
  'realism',
  'arthouse',
  'newhollywood',
  'horror',
  'scifi',
  'action',
  'comedy',
  'musical',
  'animation',
  'indie',
  'doc',
]

/**
 * The scene of a suggested film, from TMDB genres and keywords. The owner corrects it in the review when needed.
 * Rules go from the most telling to the least: animation and documentaries first, the silent era next, then
 * genres, and plain dramas by period and country.
 */
export function detectScene(details: MovieDetails, year: number): SceneKey {
  const genres = new Set(details.genres.map((genre) => genre.name))
  const keywords = (details.keywords?.keywords ?? []).map((keyword) => keyword.name.toLowerCase()).join('|')
  const country = details.origin_country?.[0] ?? details.production_countries[0]?.iso_3166_1 ?? ''
  const american = country === 'US'

  if (genres.has('Animation')) return 'animation'
  if (genres.has('Documentary')) return 'doc'
  if (year <= 1928) return 'silent'
  if (/film noir|neo-noir/.test(keywords)) return 'crime'
  if (genres.has('Western')) return 'western'
  if (genres.has('Horror')) return 'horror'
  if (/superhero|based on comic/.test(keywords)) return 'action'
  if (genres.has('Science Fiction') || genres.has('Fantasy')) return 'scifi'
  if (genres.has('Music') || /musical/.test(keywords)) return 'musical'
  if (genres.has('War') || genres.has('History')) return 'epic'
  if (/nouvelle vague|new wave|surreal|avant-garde|experimental|art house/.test(keywords)) return 'arthouse'
  if (genres.has('Crime') || genres.has('Thriller') || genres.has('Mystery')) return 'crime'
  if (genres.has('Action') || genres.has('Adventure')) return 'action'
  if (genres.has('Comedy')) return 'comedy'
  if (genres.has('Romance')) return 'romance'
  if (/neorealism|social realism|working class|poverty/.test(keywords)) return 'realism'
  if (american && year >= 1967 && year <= 1980) return 'newhollywood'
  if (year < 1960 && (american || country === 'GB')) return 'classic'
  if (!american && country !== 'GB') return 'arthouse'
  return 'indie'
}
