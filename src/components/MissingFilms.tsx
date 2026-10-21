import {useEffect, useMemo, useState} from 'react';
import {suggestFilm} from '../api';
import {poster} from '../images';
import type {LetterboxdFilm} from '../letterboxd';
import {normalize, starText} from '../logs';
import {entryKey, knownFilm, lookUpFilms, rememberStatus} from '../personal';
import type {Film} from '../types';

interface MissingFilmsProps {
  /** The visitor's watched films that are not on the timeline. */
  films: LetterboxdFilm[];
  /** The site owner adds films directly; visitors suggest them. */
  owner: boolean;
  onPublished: (film: Film) => void;
}

const PAGE = 30;
const STATUS_LABELS: Record<string, string> = {
  published: 'On the timeline',
  pending: 'Waiting for review',
  busy: 'Adding…',
};

/** Favorites first, then by stars, likes, and the latest diary day. */
function rank(first: LetterboxdFilm, second: LetterboxdFilm) {
  return (
    Number(second.favorite) - Number(first.favorite) ||
    (second.rating ?? 0) - (first.rating ?? 0) ||
    Number(second.liked) - Number(first.liked) ||
    (second.dates[0] ?? '').localeCompare(first.dates[0] ?? '') ||
    first.title.localeCompare(second.title)
  );
}

export function MissingFilms({films, owner, onPublished}: MissingFilmsProps) {
  const [scope, setScope] = useState<'best' | 'all'>('best');
  const [count, setCount] = useState(PAGE);
  /** Bumped after each batch of TMDB lookups, to show the new posters. */
  const [, setLookups] = useState(0);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const best = useMemo(
    () => films.filter(film => film.favorite || film.liked || (film.rating ?? 0) >= 4).sort(rank),
    [films],
  );
  const all = useMemo(() => [...films].sort(rank), [films]);
  const list = scope === 'best' ? best : all;
  const shown = list.slice(0, count);

  // Looks up on TMDB the films shown that are not known yet.
  const wantedKey = shown
    .filter(film => knownFilm(film) === undefined)
    .map(entryKey)
    .join('\n');
  useEffect(() => {
    if (!wantedKey) return;
    const keys = new Set(wantedKey.split('\n'));
    const wanted = all.filter(film => keys.has(entryKey(film)));
    let cancelled = false;
    const load = async () => {
      try {
        await lookUpFilms(
          wanted,
          () => setLookups(current => current + 1),
          () => cancelled,
        );
      } catch (problem) {
        if (!cancelled) setError(problem instanceof Error ? problem.message : String(problem));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [wantedKey, all]);

  const add = async (film: LetterboxdFilm, tmdbId: number) => {
    const key = entryKey(film);
    setStatuses(current => ({...current, [key]: 'busy'}));
    try {
      // Letterboxd's year, like the catalog's: TMDB sometimes counts the release after the festival premiere.
      const answer = await suggestFilm({tmdbId, note: '', year: film.year});
      if (answer.status === 'published') onPublished(answer.film);
      rememberStatus(film, answer.status);
      setStatuses(current => ({...current, [key]: answer.status}));
    } catch (problem) {
      setStatuses(current => ({...current, [key]: problem instanceof Error ? problem.message : String(problem)}));
    }
  };

  return (
    <section className="lb-step">
      <h3>3. Not on the timeline yet</h3>
      <p>
        {owner
          ? 'Add the ones that belong in film history. The films you log on Letterboxd from now on are added by themselves, once a day or when you open the site.'
          : 'Suggest the ones that belong here: they join the timeline once reviewed.'}
      </p>
      <div className="view-switch scope-switch" role="group" aria-label="Which films">
        <button type="button" aria-pressed={scope === 'best'} onClick={() => setScope('best')}>
          Favorites, liked and top rated <span className="chip-count">{best.length}</span>
        </button>
        <button type="button" aria-pressed={scope === 'all'} onClick={() => setScope('all')}>
          All watched <span className="chip-count">{all.length}</span>
        </button>
      </div>
      {error && <p className="dialog-error">{error}</p>}
      <ul className="results missing-list">
        {shown.map(film => {
          const key = entryKey(film);
          const match = knownFilm(film);
          const status = statuses[key] ?? match?.status;
          const facts = [
            film.year,
            film.favorite && 'favorite',
            film.rating && starText(film.rating),
            film.liked && '♥',
          ].filter(Boolean);
          const otherName =
            match && (normalize(match.title) !== normalize(film.title) || (film.year && match.year !== film.year));
          return (
            <li key={key} className="result missing-item">
              {match?.tmdb?.poster ? (
                <img src={poster(match.tmdb.poster, 'w92')!} alt="" />
              ) : (
                <span className="result-blank" />
              )}
              <span className="result-text">
                <span className="result-title">{film.title}</span>
                <span className="result-meta">
                  {facts.join(' · ')}
                  {otherName && ` · TMDB: ${match.title} (${match.year})`}
                </span>
              </span>
              {match === undefined ? (
                <span className="result-status">…</span>
              ) : !match?.tmdb ? (
                <span className="result-status">Not on TMDB</span>
              ) : status ? (
                <span className="result-status">{STATUS_LABELS[status] ?? status}</span>
              ) : (
                <button type="button" className="text-button add-button" onClick={() => void add(film, match.tmdb!.id)}>
                  {owner ? 'Add' : 'Suggest'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {count < list.length && (
        <button type="button" className="text-button" onClick={() => setCount(current => current + PAGE)}>
          Show {Math.min(PAGE, list.length - count)} more
        </button>
      )}
    </section>
  );
}
