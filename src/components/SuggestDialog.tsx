import {useEffect, useRef, useState} from 'react';
import {searchFilms, suggestFilm, type SearchResult} from '../api';
import {countryName, flag} from '../countries';
import {poster} from '../images';
import {SCENES} from '../scenes';
import type {Film} from '../types';
import {Dialog} from './Dialog';

/** A film to suggest: a search result, or a film recommended in the Explore section. */
export interface Pick {
  tmdbId: number;
  title: string;
  year: number | null;
  poster: string | null;
}

interface SuggestDialogProps {
  /** The site owner's suggestions go straight onto the timeline. */
  owner: boolean;
  /** A film picked already, e.g. from the Explore section. */
  initialPick?: Pick | null;
  onClose: () => void;
  onPublished: (film: Film) => void;
}

const STATUS_LABELS = {published: 'On the timeline', pending: 'Waiting for review'};
const MAX_YEAR = new Date().getFullYear() + 1;

export function SuggestDialog({owner, initialPick = null, onClose, onPublished}: SuggestDialogProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Pick | null>(initialPick);
  const [year, setYear] = useState(initialPick?.year ? String(initialPick.year) : '');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{status: 'published' | 'pending'; film: Film} | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const title = owner ? 'Add a film' : 'Suggest a film';

  useEffect(() => {
    inputRef.current?.focus();
  }, [picked, done]);

  useEffect(() => {
    const text = query.trim();
    if (picked || text.length < 2) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const found = await searchFilms(text);
        if (!cancelled) {
          setResults(found);
          setError(null);
        }
      } catch (problem) {
        if (!cancelled) setError(problem instanceof Error ? problem.message : String(problem));
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, picked]);

  const shown = picked || query.trim().length < 2 ? [] : results;

  const pick = (result: Pick) => {
    setPicked(result);
    setYear(result.year ? String(result.year) : '');
    setNote('');
    setError(null);
  };

  const send = async () => {
    if (!picked) return;
    setSending(true);
    setError(null);
    try {
      const answer = await suggestFilm({tmdbId: picked.tmdbId, note, year: year ? Number(year) : null});
      setDone(answer);
      if (answer.status === 'published') onPublished(answer.film);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setSending(false);
    }
  };

  const startOver = () => {
    setDone(null);
    setPicked(null);
    setQuery('');
    setResults([]);
  };

  if (done) {
    const {film} = done;
    return (
      <Dialog title={title} onClose={onClose}>
        <div className="suggest-done">
          {film.tmdb?.poster && <img src={poster(film.tmdb.poster, 'w185')!} alt="" />}
          <div>
            <p className="suggest-title">
              {film.title} <span>by {film.directors.join(', ')}</span>
            </p>
            <p>
              {done.status === 'published'
                ? 'It is on the timeline now.'
                : 'Thanks! It is waiting for review before it shows up on the timeline.'}
            </p>
            <p className="suggest-facts">
              {film.year} · {SCENES[film.scene].label}
              {film.country && ` · ${flag(film.country)} ${countryName(film.country)}`}
            </p>
          </div>
        </div>
        <div className="dialog-actions">
          <button type="button" className="go" onClick={startOver}>
            {owner ? 'Add another' : 'Suggest another'}
          </button>
        </div>
      </Dialog>
    );
  }

  if (picked) {
    return (
      <Dialog title={title} onClose={onClose}>
        <div className="suggest-picked">
          {picked.poster && <img src={poster(picked.poster, 'w185')!} alt="" />}
          <div>
            <p className="suggest-title">{picked.title}</p>
            <label className="field">
              Release year
              <input
                ref={inputRef}
                type="number"
                min={1888}
                max={MAX_YEAR}
                value={year}
                onChange={event => setYear(event.target.value)}
              />
            </label>
          </div>
        </div>
        <label className="field">
          Why it belongs here (optional)
          <textarea
            maxLength={280}
            rows={3}
            value={note}
            placeholder="One or two sentences about the film"
            onChange={event => setNote(event.target.value)}
          />
          <span className="field-hint">{280 - note.length} characters left</span>
        </label>
        <p className="field-hint">
          {owner ? 'It goes straight onto the timeline. ' : ''}The scene, the country, the poster and the trailer are
          fetched for you.
        </p>
        {error && <p className="dialog-error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="text-button" onClick={() => setPicked(null)}>
            Back
          </button>
          <button type="button" className="go" onClick={() => void send()} disabled={sending}>
            {sending ? 'Fetching the details…' : owner ? 'Add to the timeline' : 'Suggest it'}
          </button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title={title} onClose={onClose}>
      <input
        ref={inputRef}
        className="search dialog-search"
        type="search"
        placeholder="Search for a film"
        aria-label="Search for a film"
        value={query}
        onChange={event => setQuery(event.target.value)}
      />
      {error && <p className="dialog-error">{error}</p>}
      <ul className="results" aria-busy={searching}>
        {shown.map(result => (
          <li key={result.tmdbId}>
            <button type="button" className="result" disabled={result.status !== null} onClick={() => pick(result)}>
              {result.poster ? <img src={poster(result.poster, 'w92')!} alt="" /> : <span className="result-blank" />}
              <span className="result-text">
                <span className="result-title">{result.title}</span>
                <span className="result-meta">{[result.originalTitle, result.year].filter(Boolean).join(' · ')}</span>
              </span>
              {result.status && <span className="result-status">{STATUS_LABELS[result.status]}</span>}
            </button>
          </li>
        ))}
      </ul>
      {searching && <p className="field-hint">Searching…</p>}
      {!searching && query.trim().length >= 2 && shown.length === 0 && !error && (
        <p className="field-hint">Nothing found on TMDB.</p>
      )}
      <p className="field-hint">Film data from TMDB.</p>
    </Dialog>
  );
}
