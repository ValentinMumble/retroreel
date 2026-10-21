import {lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {fetchFilms, fetchSuggestions, suggestFilm, syncFeed} from './api';
import {FilmPanel} from './components/FilmPanel';
import {LetterboxdDialog} from './components/LetterboxdDialog';
import {ReviewDialog} from './components/ReviewDialog';
import {SuggestDialog, type Pick} from './components/SuggestDialog';
import {ThemePicker} from './components/ThemePicker';
import {Timeline, type TimelineHandle} from './components/Timeline';
import {countryName, flag} from './countries';
import {fetchFeed, loadLetterboxd, saveLetterboxd, type LetterboxdData} from './letterboxd';
import {matchLogs, missingFilms, type FilmLog} from './logs';
import {forgetFilms, lookUpFilms, personalFilms} from './personal';
import {forgetOwnerKey, ownerKey} from './owner';
import {SCENES, SCENE_ORDER} from './scenes';
import {cssVars} from './style';
import type {Film, SceneKey} from './types';

/** Jump buttons, every twenty years: "20s" would not say which century. */
const JUMPS = [1900, 1920, 1940, 1960, 1980, 2000, 2020];
const FIRST_YEAR = 1900;
const CURRENT_YEAR = new Date().getFullYear();

type Mine = 'seen' | 'unseen' | 'liked' | 'watchlist';

const MINE_LABELS: Record<Mine, string> = {
  seen: 'Seen',
  unseen: 'Not seen yet',
  liked: 'Liked',
  watchlist: 'Watchlist',
};

function fold(text: string) {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function toggled<T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function sortFilms(films: Film[]) {
  return [...films].sort(
    (first, second) => first.date.localeCompare(second.date) || first.title.localeCompare(second.title),
  );
}

// The other views load when first opened: the map's world shapes stay out of the timeline's download.
const Directors = lazy(async () => ({default: (await import('./components/Directors')).Directors}));
const WorldMap = lazy(async () => ({default: (await import('./components/WorldMap')).WorldMap}));
const River = lazy(async () => ({default: (await import('./components/River')).River}));

type View = 'timeline' | 'directors' | 'map' | 'river';

const VIEWS: {id: View; label: string; icon: string}[] = [
  {id: 'timeline', label: 'Timeline', icon: '↔'},
  {id: 'directors', label: 'Directors', icon: '☰'},
  {id: 'map', label: 'Map', icon: '◍'},
  {id: 'river', label: 'River', icon: '≈'},
];

const VIEW_KEY = 'retroreel.view';

function storedView(): View {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    return VIEWS.find(option => option.id === saved)?.id ?? 'timeline';
  } catch {
    return 'timeline';
  }
}

const LAYER_KEY = 'retroreel.layer';
const MINE_KEY = 'retroreel.mine';
const NO_LAYER = {films: [] as Film[], logs: new Map<string, FilmLog>(), pending: 0};

function storedLayer() {
  try {
    return localStorage.getItem(LAYER_KEY) === 'on';
  } catch {
    return false;
  }
}

/** The "your films" filters that were on at the last visit. */
function storedMine(): ReadonlySet<Mine> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(MINE_KEY) ?? '[]');
    const options = Array.isArray(saved) ? saved : [];
    return new Set(options.filter((option): option is Mine => typeof option === 'string' && option in MINE_LABELS));
  } catch {
    return new Set();
  }
}

function possessive(name: string) {
  return name.endsWith('s') ? `${name}'` : `${name}'s`;
}

export default function App() {
  const timelineRef = useRef<TimelineHandle>(null);
  const [allFilms, setAllFilms] = useState<Film[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [query, setQuery] = useState('');
  const [activeScenes, setActiveScenes] = useState<ReadonlySet<SceneKey>>(new Set());
  /** The "your films" filters that are on: a film shows when it matches any of them, like scenes. */
  const [mine, setMine] = useState<ReadonlySet<Mine>>(storedMine);
  const [activeCountries, setActiveCountries] = useState<ReadonlySet<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(
    () => decodeURIComponent(window.location.hash.slice(1)) || null,
  );
  const [centerYear, setCenterYear] = useState(FIRST_YEAR);
  const [letterboxd, setLetterboxd] = useState<LetterboxdData | null>(loadLetterboxd);
  const [owner, setOwner] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'suggest' | 'review' | 'letterboxd' | null>(null);
  /** On phones the filters fold away behind a Filters button. */
  const [filtersOpen, setFiltersOpen] = useState(false);
  /** "Light up related" from a film's Explore section: only these films stay bright. */
  const [lit, setLit] = useState<{seedId: string; ids: ReadonlySet<string>} | null>(null);
  const [suggestPick, setSuggestPick] = useState<Pick | null>(null);
  const [view, setView] = useState<View>(storedView);
  /** The personal layer: the visitor's other Letterboxd films on the timeline too, in this browser only. */
  const [layer, setLayer] = useState(storedLayer);
  /** Bumped after each batch of TMDB lookups, so the new films reach the timeline. */
  const [lookups, setLookups] = useState(0);

  const changeView = (next: View) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Storage blocked: the view just won't be remembered.
    }
  };

  const loadFilms = useCallback(async () => {
    try {
      setAllFilms(sortFilms(await fetchFilms()));
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    // The state changes once the fetch answers, not synchronously in the effect.
    // oxlint-disable-next-line react/set-state-in-effect
    void loadFilms();
  }, [loadFilms]);

  // Only the site owner may read the review queue: a refusal means the key is wrong or gone.
  useEffect(() => {
    if (!ownerKey()) return;
    let cancelled = false;
    const check = async () => {
      try {
        const suggestions = await fetchSuggestions();
        if (cancelled) return;
        setOwner(true);
        setPendingCount(suggestions.length);
      } catch {
        if (!cancelled) forgetOwnerKey();
        return;
      }
      // The films logged on Letterboxd since the last run go onto the timeline (the daily cron does it too).
      const added = await syncFeed().catch(() => []);
      if (cancelled || added.length === 0) return;
      const ids = new Set(added.map(film => film.id));
      setAllFilms(current => sortFilms([...current.filter(film => !ids.has(film.id)), ...added]));
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  const changeLetterboxd = useCallback((data: LetterboxdData | null) => {
    saveLetterboxd(data);
    setLetterboxd(data);
    if (!data) {
      forgetFilms();
      setMine(new Set());
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(MINE_KEY, JSON.stringify([...mine]));
    } catch {
      // Storage blocked: the filters just won't be remembered.
    }
  }, [mine]);

  const toggleLayer = () => {
    setLayer(current => {
      try {
        localStorage.setItem(LAYER_KEY, current ? 'off' : 'on');
      } catch {
        // Storage blocked: the choice just won't be remembered.
      }
      return !current;
    });
  };

  // The RSS feed brings the films logged since the last visit.
  useEffect(() => {
    const stored = loadLetterboxd();
    if (!stored?.username || !stored.feed) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const feed = await fetchFeed(stored.username!);
        if (cancelled) return;
        // Merged into the latest state: the visitor may have imported or forgotten their films meanwhile.
        setLetterboxd(current => {
          if (!current?.feed || current.username !== stored.username) return current;
          const next = {...current, feed: {films: feed.films, name: feed.name, fetchedAt: new Date().toISOString()}};
          saveLetterboxd(next);
          return next;
        });
        setFeedError(null);
      } catch (error) {
        if (!cancelled) setFeedError(`Letterboxd feed: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    void refresh();
    return () => {
      cancelled = true;
    };
  }, []);

  // The visitor's films that are not in the catalog, seen or on the watchlist: the personal layer.
  const missing = useMemo(
    () => (letterboxd && allFilms.length ? missingFilms(allFilms, letterboxd, {watchlist: true}) : []),
    [allFilms, letterboxd],
  );

  // The visitor's other films: the seen ones with the layer on or when seen or liked films are picked, the
  // watchlist ones only when the watchlist is picked.
  const otherSeenShown = layer || mine.has('seen') || mine.has('liked');
  const otherWatchlistShown = mine.has('watchlist');
  const personalShown = otherSeenShown || otherWatchlistShown;

  // The films not looked up yet come from TMDB, 40 at a time, each batch shown as it arrives.
  useEffect(() => {
    if (!personalShown || missing.length === 0) return;
    let cancelled = false;
    const run = async () => {
      try {
        await lookUpFilms(
          missing,
          () => setLookups(current => current + 1),
          () => cancelled,
        );
      } catch (error) {
        if (!cancelled) setFeedError(`Your films: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [personalShown, missing]);

  const personal = useMemo(() => {
    void lookups; // A new batch of looked-up films: build the layer again.
    if (!personalShown) return NO_LAYER;
    const built = personalFilms(missing, allFilms);
    const shown = (film: Film) => {
      const log = built.logs.get(film.id);
      return log?.watched ? otherSeenShown : otherWatchlistShown;
    };
    return {...built, films: built.films.filter(shown)};
  }, [personalShown, otherSeenShown, otherWatchlistShown, missing, allFilms, lookups]);

  /** The visitor's other seen films: the ones "My other films" adds. */
  const otherSeen = useMemo(() => missing.filter(film => film.watched), [missing]);

  const timelineFilms = useMemo(
    () => (personal.films.length ? sortFilms([...allFilms, ...personal.films]) : allFilms),
    [allFilms, personal],
  );

  const logs = useMemo(() => {
    if (!letterboxd || !allFilms.length) return null;
    const matched = new Map(matchLogs(allFilms, letterboxd));
    for (const [id, log] of personal.logs) matched.set(id, log);
    return matched;
  }, [allFilms, letterboxd, personal]);

  const mineCounts = useMemo(() => {
    const counts = {seen: 0, unseen: 0, liked: 0, watchlist: 0};
    if (!logs) return counts;
    for (const film of timelineFilms) {
      const log = logs.get(film.id);
      if (log?.watched) counts.seen += 1;
      else counts.unseen += 1;
      if (log?.liked) counts.liked += 1;
      if (log?.watchlist) counts.watchlist += 1;
    }
    return counts;
  }, [timelineFilms, logs]);

  /** Films each "your films" filter shows: seen and liked count the other films too, even before they are looked up. */
  const mineTotal = (option: Mine) => {
    if (option === 'seen' && !otherSeenShown) return mineCounts.seen + otherSeen.length;
    if (option === 'liked' && !otherSeenShown) return mineCounts.liked + otherSeen.filter(film => film.liked).length;
    if (option === 'watchlist' && !otherWatchlistShown) {
      return mineCounts.watchlist + missing.filter(film => film.watchlist && !film.watched).length;
    }
    return mineCounts[option];
  };
  const toggleMine = (option: Mine) => setMine(current => toggled(current, option));

  const years = useMemo(() => {
    const filmYears = timelineFilms.map(film => film.year);
    return {
      first: Math.min(FIRST_YEAR, ...filmYears),
      last: Math.max(CURRENT_YEAR, ...filmYears),
    };
  }, [timelineFilms]);

  const countries = useMemo(
    () =>
      Object.entries(
        timelineFilms.reduce<Record<string, number>>((counts, film) => {
          if (film.country) counts[film.country] = (counts[film.country] ?? 0) + 1;
          return counts;
        }, {}),
      )
        .map(([code, count]) => ({code, count, name: countryName(code)}))
        .sort((first, second) => second.count - first.count || first.name.localeCompare(second.name)),
    [timelineFilms],
  );

  const films = useMemo(() => {
    const keep = (film: Film) => {
      if (mine.size === 0 || !logs) return true;
      const log = logs.get(film.id);
      return (
        (mine.has('seen') && Boolean(log?.watched)) ||
        (mine.has('unseen') && !log?.watched) ||
        (mine.has('liked') && Boolean(log?.liked)) ||
        (mine.has('watchlist') && Boolean(log?.watchlist))
      );
    };
    return timelineFilms.filter(
      film =>
        (activeScenes.size === 0 || activeScenes.has(film.scene)) &&
        keep(film) &&
        (activeCountries.size === 0 || (film.country !== null && activeCountries.has(film.country))),
    );
  }, [timelineFilms, activeScenes, mine, activeCountries, logs]);

  const selected = timelineFilms.find(film => film.id === selectedId) ?? null;
  // The light-up belongs to the film that turned it on: opening another film or closing the panel ends it.
  const litIds = lit && lit.seedId === selectedId ? lit.ids : null;
  // Search highlights instead of hiding: matching films stay bright, the others dim.
  const needle = fold(query.trim());
  const matchList = useMemo(
    () =>
      needle
        ? films.filter(film =>
            fold(`${film.title} ${film.originalTitle ?? ''} ${film.directors.join(' ')}`).includes(needle),
          )
        : null,
    [films, needle],
  );
  const matches = useMemo(() => (matchList ? new Set(matchList.map(film => film.id)) : null), [matchList]);
  const highlighted = litIds ?? matches;
  const firstMatchId = matchList?.[0]?.id ?? null;

  // While typing, glide the timeline to the first match.
  useEffect(() => {
    if (!firstMatchId) return;
    const timer = window.setTimeout(() => timelineRef.current?.scrollToFilm(firstMatchId), 350);
    return () => window.clearTimeout(timer);
  }, [firstMatchId]);

  /** Enter in the search box opens the next match (Shift+Enter the previous one). */
  const stepMatch = (direction: 1 | -1) => {
    if (!matchList?.length) return;
    const index = matchList.findIndex(film => film.id === selectedId);
    const nextIndex =
      index < 0
        ? direction === 1
          ? 0
          : matchList.length - 1
        : (index + direction + matchList.length) % matchList.length;
    const next = matchList[nextIndex];
    setSelectedId(next.id);
    timelineRef.current?.scrollToFilm(next.id);
  };
  const selectedIndex = films.findIndex(film => film.id === selectedId);
  const earliest = allFilms[0];
  const latest = allFilms[allFilms.length - 1];

  const step = useCallback(
    (offset: 1 | -1) => {
      const next = films[selectedIndex + offset];
      if (selectedIndex < 0 || !next) return;
      setSelectedId(next.id);
      timelineRef.current?.scrollToFilm(next.id);
    },
    [films, selectedIndex],
  );

  const toggleScene = (scene: SceneKey) => setActiveScenes(current => toggled(current, scene));
  /** From the film panel: show only that scene (or every scene again if it was the only one). */
  const only = <T,>(current: ReadonlySet<T>, value: T): ReadonlySet<T> =>
    current.size === 1 && current.has(value) ? new Set() : new Set([value]);
  const keepSelectedInView = () => {
    const id = selectedId;
    if (id) requestAnimationFrame(() => requestAnimationFrame(() => timelineRef.current?.scrollToFilm(id)));
  };
  const toggleCountry = (code: string) => setActiveCountries(current => toggled(current, code));

  const addFilm = useCallback((film: Film) => {
    setAllFilms(current => sortFilms([...current.filter(item => item.id !== film.id), film]));
  }, []);

  /** From a personal film's panel: add it to the shared timeline (owner) or suggest it (visitors). */
  const promote = async (film: Film) => {
    const answer = await suggestFilm({tmdbId: film.tmdb!.id, note: '', year: film.year});
    if (answer.status === 'published') addFilm(answer.film);
    return answer.status;
  };

  useEffect(() => {
    if (loadState !== 'ready') return;
    const url = selectedId ? `#${selectedId}` : window.location.pathname + window.location.search;
    window.history.replaceState(null, '', url);
  }, [selectedId, loadState]);

  // Opened from a shared link: once the films are in, bring that film into view. An unknown id opens nothing.
  const openedFromLink = useRef(false);
  useEffect(() => {
    if (loadState !== 'ready' || openedFromLink.current) return;
    openedFromLink.current = true;
    if (selectedId && allFilms.some(film => film.id === selectedId)) {
      requestAnimationFrame(() => timelineRef.current?.scrollToFilm(selectedId, false));
    }
  }, [loadState, allFilms, selectedId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) {
        if (event.key === 'Escape') target.blur();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const timeline = timelineRef.current;
      if (!timeline) return;
      switch (event.key) {
        case 'Escape':
          if (litIds) setLit(null);
          else setSelectedId(null);
          break;
        case 'ArrowRight':
          if (selectedId) step(1);
          else timeline.step(1);
          break;
        case 'ArrowLeft':
          if (selectedId) step(-1);
          else timeline.step(-1);
          break;
        case 'PageDown':
          timeline.step(1, true);
          break;
        case 'PageUp':
          timeline.step(-1, true);
          break;
        case 'Home':
          timeline.scrollToEdge('start');
          break;
        case 'End':
          timeline.scrollToEdge('end');
          break;
        case '/':
          document.querySelector<HTMLInputElement>('.topbar .search')?.focus();
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId, step, litIds]);

  const filtered = activeScenes.size > 0 || mine.size > 0 || activeCountries.size > 0;
  const activeFilterCount = activeScenes.size + activeCountries.size + mine.size;
  const openSuggest = (pick: Pick | null = null) => {
    setSuggestPick(pick);
    setDialog('suggest');
  };
  /** From Explore: open a related film, clearing filters that would hide it. */
  const jumpTo = (id: string) => {
    if (!films.some(film => film.id === id)) clearFilters();
    setSelectedId(id);
    requestAnimationFrame(() => requestAnimationFrame(() => timelineRef.current?.scrollToFilm(id)));
  };
  /** Back to the timeline once it is shown again (a hidden timeline has no width to scroll in). */
  const backToTimeline = (year: number | null) => {
    changeView('timeline');
    if (year !== null)
      requestAnimationFrame(() => requestAnimationFrame(() => timelineRef.current?.scrollToYear(year)));
  };
  /** From the map: only that country's films, on the timeline. */
  const showCountry = (code: string) => {
    setActiveCountries(new Set([code]));
    backToTimeline(null);
  };
  /** From the river: only that scene, on the timeline, around the year clicked. */
  const showScene = (scene: SceneKey, year: number) => {
    setActiveScenes(new Set([scene]));
    backToTimeline(year);
  };
  const clearFilters = () => {
    setQuery('');
    setActiveScenes(new Set());
    setMine(new Set());
    setActiveCountries(new Set());
  };
  const currentJump = [...JUMPS].reverse().find(year => year <= centerYear) ?? JUMPS[0];
  const connected = Boolean(letterboxd?.archive || letterboxd?.feed);

  return (
    <div className={`app${filtersOpen ? ' filters-open' : ''}`}>
      <header className="topbar">
        <button type="button" className="brand" onClick={() => timelineRef.current?.scrollToEdge('start')}>
          <span className="brand-reel" aria-hidden="true" />
          Retroreel
        </button>
        <nav className="decades" aria-label="Jump to a period" hidden={view !== 'timeline'}>
          {JUMPS.map(year => (
            <button
              key={year}
              type="button"
              className={`decade${year === currentJump ? ' is-current' : ''}`}
              aria-current={year === currentJump ? 'true' : undefined}
              onClick={() => timelineRef.current?.scrollToYear(year)}
            >
              {year}
            </button>
          ))}
        </nav>
        <div className="finder">
          <input
            className="search"
            type="search"
            placeholder="Search film or director"
            aria-label="Search film or director"
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              stepMatch(event.shiftKey ? -1 : 1);
            }}
          />
          <button
            type="button"
            className="toggle filters-button"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen(open => !open)}
          >
            Filters{activeFilterCount > 0 && <b className="count-badge">{activeFilterCount}</b>}
          </button>
          <div className="view-switch" role="group" aria-label="View">
            {VIEWS.map(option => (
              <button
                key={option.id}
                type="button"
                aria-pressed={view === option.id}
                aria-label={option.label}
                title={option.label}
                onClick={() => changeView(option.id)}
              >
                <span aria-hidden="true">{option.icon}</span>
                <span className="wide-label view-label"> {option.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="actions">
          <button
            type="button"
            className="toggle"
            onClick={() => openSuggest()}
            aria-label={owner ? 'Add a film' : 'Suggest a film'}
            title={owner ? 'Add a film' : 'Suggest a film'}
          >
            <span aria-hidden="true">+</span>
            <span className="wide-label">{owner ? ' Add' : ' Suggest'}</span>
          </button>
          {owner && (
            <button type="button" className="toggle" onClick={() => setDialog('review')}>
              Review{pendingCount > 0 && <b className="count-badge">{pendingCount}</b>}
            </button>
          )}
          {logs && (
            <button
              type="button"
              className="toggle seen-toggle"
              aria-pressed={mine.has('seen')}
              aria-label="Only my films"
              title="Only the films you have seen, from your Letterboxd"
              onClick={() => toggleMine('seen')}
            >
              <span aria-hidden="true">✓</span>
              <span className="wide-label"> My films</span>
            </button>
          )}
          {connected ? (
            <button
              type="button"
              className="account"
              onClick={() => setDialog('letterboxd')}
              title="Your Letterboxd films"
            >
              <span className="lb-dots" aria-hidden="true" />
              <span className="wide-label">{letterboxd?.username ?? 'Letterboxd'}</span>
            </button>
          ) : (
            <button type="button" className="connect" onClick={() => setDialog('letterboxd')}>
              <span className="lb-dots" aria-hidden="true" />
              <span className="wide-label">Connect </span>Letterboxd
            </button>
          )}
          <ThemePicker />
        </div>
      </header>

      <div className="scenes" role="group" aria-label="Filter by scene">
        <button
          type="button"
          className="chip chip-all"
          aria-pressed={activeScenes.size === 0}
          onClick={() => setActiveScenes(new Set())}
        >
          All scenes
        </button>
        {SCENE_ORDER.map(scene => (
          <button
            key={scene}
            type="button"
            className="chip"
            style={cssVars({'--scene': SCENES[scene].color})}
            aria-pressed={activeScenes.has(scene)}
            onClick={() => toggleScene(scene)}
          >
            {SCENES[scene].label}
          </button>
        ))}
        {feedError && <span className="notice">{feedError}</span>}
        <span className="result-count">
          {matches
            ? `${matches.size} ${matches.size === 1 ? 'match' : 'matches'}${matches.size > 0 ? ', Enter to step through' : ''}`
            : `${films.length} of ${allFilms.length} films`}
        </span>
      </div>

      <div className="scenes countries" role="group" aria-label="Filter by country">
        <button
          type="button"
          className="chip chip-all"
          aria-pressed={activeCountries.size === 0}
          onClick={() => setActiveCountries(new Set())}
        >
          All countries
        </button>
        {countries.map(option => (
          <button
            key={option.code}
            type="button"
            className="chip chip-country"
            aria-pressed={activeCountries.has(option.code)}
            onClick={() => toggleCountry(option.code)}
          >
            <span aria-hidden="true">{flag(option.code)}</span> {option.name}
            <span className="chip-count">{option.count}</span>
          </button>
        ))}
      </div>

      {logs && (
        <div className="scenes mine" role="group" aria-label="Filter by your Letterboxd films">
          <button
            type="button"
            className="chip chip-all"
            aria-pressed={mine.size === 0}
            onClick={() => setMine(new Set())}
          >
            All films
          </button>
          {(Object.keys(MINE_LABELS) as Mine[]).map(option => (
            <button
              key={option}
              type="button"
              className={`chip chip-mine is-${option}`}
              aria-pressed={mine.has(option)}
              disabled={mineTotal(option) === 0}
              onClick={() => toggleMine(option)}
            >
              {MINE_LABELS[option]}
              <span className="chip-count">{mineTotal(option)}</span>
            </button>
          ))}
          {otherSeen.length > 0 && (
            <button
              type="button"
              className="chip chip-layer"
              aria-pressed={layer}
              title="Your other seen films from Letterboxd, on the timeline in this browser only"
              onClick={toggleLayer}
            >
              My other films
              <span className="chip-count">
                {layer && personal.pending > 0
                  ? `${missing.length - personal.pending} of ${missing.length}`
                  : otherSeen.length}
              </span>
            </button>
          )}
        </div>
      )}

      <Timeline
        ref={timelineRef}
        hidden={view !== 'timeline'}
        films={films}
        firstYear={years.first}
        lastYear={years.last}
        logs={logs}
        lit={highlighted}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onCenterYearChange={setCenterYear}
        intro={
          <>
            <p className="kicker">
              {earliest?.year ?? years.first} to {years.last}
            </p>
            <h1>Cinema, year by year</h1>
            <p>
              {earliest && latest ? (
                <>
                  <strong>{allFilms.length} films</strong>, from {possessive(earliest.directors[0] ?? 'the')}{' '}
                  <em>{earliest.title}</em> to {possessive(latest.directors[0] ?? 'the')} <em>{latest.title}</em>.
                </>
              ) : (
                'Landmark films from the first silent shorts to today.'
              )}{' '}
              Click a poster to read about the film and watch its trailer.
            </p>
            {logs ? (
              <p>
                <span className="seen-inline">✓</span> marks the <strong>{mineCounts.seen} films</strong> you have seen
                on Letterboxd, with your stars and <span className="heart-inline">♥</span> likes. A blue ribbon marks
                your watchlist.
                {personal.films.length > 0 &&
                  ` Your ${personal.films.length} other films are on it too, in a dashed frame, for you only.`}
              </p>
            ) : (
              <p>
                <button type="button" className="link" onClick={() => setDialog('letterboxd')}>
                  Connect Letterboxd
                </button>{' '}
                to see which of these films you have seen. Your films stay in this browser.
              </p>
            )}
            <p className="hint">
              <span className="hint-keys">
                Scroll or drag to travel in time. <kbd>←</kbd> <kbd>→</kbd> step, <kbd>/</kbd> search.
              </span>
              <span className="hint-touch">Swipe sideways to travel in time.</span>
            </p>
            <button
              type="button"
              className="go"
              onClick={() => timelineRef.current?.scrollToYear(earliest?.year ?? years.first)}
            >
              Start in {earliest?.year ?? years.first} <span aria-hidden="true">→</span>
            </button>
          </>
        }
        outro={
          <>
            <p className="kicker">Today</p>
            <h2>To be continued.</h2>
            <p>
              {owner
                ? 'Missing a film that belongs here? Add it, it goes straight onto the timeline.'
                : 'Missing a film that belongs here? Suggest it, and it joins the timeline once reviewed.'}
            </p>
            <button type="button" className="go" onClick={() => openSuggest()}>
              {owner ? 'Add a film' : 'Suggest a film'}
            </button>
            <p className="credits">
              Film data, posters and recommendations from{' '}
              <a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer">
                TMDB
              </a>
              . This site uses the TMDB API but is not endorsed or certified by TMDB, and it is not affiliated with
              Letterboxd.
            </p>
          </>
        }
        empty={
          loadState === 'loading' ? (
            <p>Loading the films…</p>
          ) : loadState === 'error' ? (
            <>
              <p>The films could not be loaded.</p>
              <button
                type="button"
                className="go"
                onClick={() => {
                  setLoadState('loading');
                  void loadFilms();
                }}
              >
                Try again
              </button>
            </>
          ) : (
            <>
              <p>No film matches these filters.</p>
              {filtered && (
                <button type="button" className="go" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </>
          )
        }
      />

      {view !== 'timeline' && (
        <Suspense fallback={<p className="view-loading">Loading…</p>}>
          {view === 'directors' && (
            <Directors
              films={films}
              logs={logs}
              lit={highlighted}
              selectedId={selectedId}
              firstYear={years.first}
              lastYear={years.last}
              onSelect={setSelectedId}
            />
          )}
          {view === 'map' && (
            <WorldMap
              films={films}
              logs={logs}
              selectedId={selectedId}
              firstYear={years.first}
              lastYear={years.last}
              onSelect={setSelectedId}
              onShowCountry={showCountry}
            />
          )}
          {view === 'river' && <River films={films} firstYear={years.first} lastYear={years.last} onPick={showScene} />}
        </Suspense>
      )}

      {selected && (
        <FilmPanel
          film={selected}
          log={logs ? (logs.get(selected.id) ?? null) : undefined}
          hasPrevious={selectedIndex > 0}
          hasNext={selectedIndex >= 0 && selectedIndex < films.length - 1}
          sceneActive={activeScenes.size === 1 && activeScenes.has(selected.scene)}
          countryActive={
            selected.country !== null && activeCountries.size === 1 && activeCountries.has(selected.country)
          }
          onFilterScene={() => {
            setActiveScenes(current => only(current, selected.scene));
            keepSelectedInView();
          }}
          onFilterCountry={() => {
            const country = selected.country;
            if (!country) return;
            setActiveCountries(current => only(current, country));
            keepSelectedInView();
          }}
          allFilms={allFilms}
          owner={owner}
          onPromote={promote}
          lit={litIds !== null}
          onJump={jumpTo}
          onSuggest={openSuggest}
          onLight={ids => setLit(ids ? {seedId: selected.id, ids} : null)}
          onPrevious={() => step(-1)}
          onNext={() => step(1)}
          onClose={() => setSelectedId(null)}
        />
      )}

      {dialog === 'suggest' && (
        <SuggestDialog
          key={suggestPick?.tmdbId ?? 'search'}
          owner={owner}
          initialPick={suggestPick}
          onClose={() => setDialog(null)}
          onPublished={addFilm}
        />
      )}
      {dialog === 'review' && (
        <ReviewDialog onClose={() => setDialog(null)} onPublished={addFilm} onCountChange={setPendingCount} />
      )}
      {dialog === 'letterboxd' && (
        <LetterboxdDialog
          data={letterboxd}
          seenOnTimeline={mineCounts.seen}
          allFilms={allFilms}
          owner={owner}
          onPublished={addFilm}
          onChange={changeLetterboxd}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
