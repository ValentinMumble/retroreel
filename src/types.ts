export type SceneKey =
  | 'silent'
  | 'classic'
  | 'romance'
  | 'crime'
  | 'western'
  | 'epic'
  | 'realism'
  | 'arthouse'
  | 'newhollywood'
  | 'horror'
  | 'scifi'
  | 'action'
  | 'comedy'
  | 'musical'
  | 'animation'
  | 'indie'
  | 'doc'

export interface Film {
  /** Title and year as a slug, e.g. "seven-samurai-1954": the address of the film in shared links. */
  id: string
  year: number
  /** "YYYY-MM-DD" when the release day is known, else "YYYY". */
  date: string
  title: string
  /** The title in the film's own language, when it differs. */
  originalTitle: string | null
  directors: string[]
  scene: SceneKey
  /** Two-letter code of the film's country of origin, from TMDB. */
  country: string | null
  /** Running time in minutes. */
  runtime: number | null
  note: string
  tmdb: {
    id: number
    /** Image paths on image.tmdb.org, e.g. "/abc.jpg". */
    poster: string | null
    backdrop: string | null
    imdbId: string | null
    /** YouTube video key of the trailer. */
    trailer: string | null
  } | null
}
