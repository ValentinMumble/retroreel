/** TMDB image addresses. Sizes are TMDB's fixed widths. */

const BASE = 'https://image.tmdb.org/t/p';

export type PosterSize = 'w92' | 'w185' | 'w342' | 'w500' | 'w780';

export function poster(path: string | null | undefined, size: PosterSize = 'w342') {
  return path ? `${BASE}/${size}${path}` : null;
}

export function backdrop(path: string | null | undefined, size: 'w780' | 'w1280' = 'w780') {
  return path ? `${BASE}/${size}${path}` : null;
}
