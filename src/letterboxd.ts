/**
 * The visitor's Letterboxd films. Letterboxd has no open API, so they come from two public sources:
 * - the export file (Settings, Data, Export your data): the whole history, read in the browser;
 * - the profile's RSS feed: the latest 50 diary entries, fetched through /api/letterboxd on each visit.
 * Everything stays in this browser's localStorage.
 */
import {fetchLetterboxdFeed} from './api';
import {parseCsv} from './csv';
import {readZip} from './zip';

export interface LetterboxdFilm {
  /** Exact TMDB id: the RSS feed gives it, the export does not. */
  tmdbId: number | null;
  title: string;
  year: number | null;
  watched: boolean;
  liked: boolean;
  favorite: boolean;
  watchlist: boolean;
  /** 0.5 to 5 stars. */
  rating: number | null;
  /** Days the film was logged in the diary, "YYYY-MM-DD". */
  dates: string[];
}

export interface LetterboxdData {
  username: string | null;
  /** The whole history, from an export file. */
  archive: {films: LetterboxdFilm[]; exportedAt: string} | null;
  /** The latest diary entries, from the RSS feed. */
  feed: {films: LetterboxdFilm[]; name: string; fetchedAt: string} | null;
}

const KEY = 'retroreel.letterboxd';

export function loadLetterboxd(): LetterboxdData | null {
  try {
    const value = localStorage.getItem(KEY);
    return value ? (JSON.parse(value) as LetterboxdData) : null;
  } catch {
    return null;
  }
}

export function saveLetterboxd(data: LetterboxdData | null) {
  try {
    if (data) localStorage.setItem(KEY, JSON.stringify(data));
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode or a full storage: the films just won't survive a reload.
  }
}

function blankFilm(title: string, year: number | null): LetterboxdFilm {
  return {
    tmdbId: null,
    title,
    year,
    watched: false,
    liked: false,
    favorite: false,
    watchlist: false,
    rating: null,
    dates: [],
  };
}

function stars(value: string | undefined) {
  const rating = Number(value);
  return value && rating > 0 && rating <= 5 ? rating : null;
}

/** The latest diary entries of a member, from the public RSS feed. */
export async function fetchFeed(username: string) {
  const answer = await fetchLetterboxdFeed(username);
  const byId = new Map<number, LetterboxdFilm>();
  // Entries come newest first: the first rating seen is the latest one.
  for (const entry of answer.entries) {
    const film = byId.get(entry.tmdbId) ?? {...blankFilm(entry.title, entry.year), tmdbId: entry.tmdbId};
    film.watched = true;
    film.liked ||= entry.liked;
    film.rating ??= entry.rating;
    if (entry.watchedDate && !film.dates.includes(entry.watchedDate)) film.dates.push(entry.watchedDate);
    byId.set(entry.tmdbId, film);
  }
  return {username: answer.username, name: answer.name, films: [...byId.values()]};
}

type ExportFile = 'watched' | 'diary' | 'ratings' | 'likes' | 'watchlist' | 'profile';

/** Which export file a path is, e.g. "likes/films.csv" is the liked films. Other files are skipped. */
function exportFile(path: string): ExportFile | null {
  const name = path.toLowerCase().split('/').slice(-2).join('/');
  if (name === 'likes/films.csv' || name === 'films.csv') return 'likes';
  const base = name.split('/').pop() ?? '';
  if (path.toLowerCase().includes('deleted/') || path.toLowerCase().includes('orphaned/')) return null;
  const match = /^(watched|diary|ratings|watchlist|profile)\.csv$/.exec(base);
  return match ? (match[1] as ExportFile) : null;
}

/** "letterboxd-vumble-2026-10-20-11-00-utc.zip" was made on 20 October 2026 at 11:00 UTC. */
function exportDate(fileName: string) {
  const match = /(\d{4}-\d{2}-\d{2})-(\d{2})-(\d{2})-utc/.exec(fileName);
  return match ? `${match[1]}T${match[2]}:${match[3]}:00Z` : new Date().toISOString();
}

/** Reads a Letterboxd export: the ZIP as downloaded, or the CSV files from it. */
export async function readExport(files: File[]) {
  const texts = new Map<ExportFile, string>();
  let exportedAt: string | null = null;
  for (const file of files) {
    if (/\.zip$/i.test(file.name)) {
      const inside = await readZip(file, name => exportFile(name) !== null);
      for (const [name, text] of inside) texts.set(exportFile(name)!, text);
      exportedAt = exportDate(file.name);
    } else {
      const kind = exportFile(file.webkitRelativePath || file.name);
      if (kind) texts.set(kind, await file.text());
      exportedAt ??= exportDate(file.webkitRelativePath || file.name);
    }
  }
  if (!texts.has('watched') && !texts.has('diary')) {
    throw new Error('This does not look like a Letterboxd export: there is no watched.csv or diary.csv in it');
  }

  // Films are told apart by name and year. The film links of watched, ratings, likes and watchlist are kept
  // too, because the profile lists the four favorite films by link.
  const films = new Map<string, LetterboxdFilm>();
  const links = new Map<string, LetterboxdFilm>();
  const rows = (kind: ExportFile) => parseCsv(texts.get(kind) ?? '');
  const film = (row: Record<string, string>, linked: boolean) => {
    const year = Number(row.Year) || null;
    const key = `${row.Name}|${year ?? ''}`;
    const found = films.get(key) ?? blankFilm(row.Name, year);
    films.set(key, found);
    if (linked && row['Letterboxd URI']) links.set(row['Letterboxd URI'], found);
    return found;
  };
  for (const row of rows('watched')) film(row, true).watched = true;
  for (const row of rows('ratings')) {
    const found = film(row, true);
    found.watched = true;
    found.rating = stars(row.Rating) ?? found.rating;
  }
  for (const row of rows('likes')) film(row, true).liked = true;
  for (const row of rows('watchlist')) film(row, true).watchlist = true;
  for (const row of rows('diary')) {
    const found = film(row, false);
    found.watched = true;
    found.rating ??= stars(row.Rating);
    const day = row['Watched Date'] || row.Date;
    if (day && !found.dates.includes(day)) found.dates.push(day);
  }
  const [profile] = rows('profile');
  for (const link of (profile?.['Favorite Films'] ?? '').split(',')) {
    const favorite = links.get(link.trim());
    if (favorite) favorite.favorite = true;
  }
  return {
    username: profile?.Username || null,
    films: [...films.values()],
    exportedAt: exportedAt ?? new Date().toISOString(),
  };
}
