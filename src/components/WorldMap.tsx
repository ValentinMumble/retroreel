import {geoEqualEarth, geoPath} from 'd3-geo';
import {select} from 'd3-selection';
import {zoom, zoomIdentity, type ZoomTransform} from 'd3-zoom';
import {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {feature, mesh} from 'topojson-client';
import type {GeometryCollection, Topology} from 'topojson-specification';
import world from 'world-atlas/countries-110m.json';
import {countryName, flag} from '../countries';
import {COUNTRY_POINTS} from '../geo';
import {poster} from '../images';
import type {LogsByFilm} from '../logs';
import {SCENES} from '../scenes';
import {cssVars} from '../style';
import type {Film, SceneKey} from '../types';

interface WorldMapProps {
  films: Film[];
  logs: LogsByFilm | null;
  selectedId: string | null;
  firstYear: number;
  lastYear: number;
  onSelect: (id: string) => void;
  /** Shows only this country on the timeline. */
  onShowCountry: (code: string) => void;
}

interface Country {
  code: string;
  films: Film[];
  seen: number;
  scene: SceneKey;
}

const topology = world as unknown as Topology<{countries: GeometryCollection; land: GeometryCollection}>;
const land = feature(topology, topology.objects.land);
const borders = mesh(topology, topology.objects.countries, (first, second) => first !== second);
const PLAY_STEP_MS = 1400;

/** The scene most of these films belong to. */
function mainScene(films: Film[]): SceneKey {
  const counts = new Map<SceneKey, number>();
  for (const film of films) counts.set(film.scene, (counts.get(film.scene) ?? 0) + 1);
  return [...counts.entries()].sort((first, second) => second[1] - first[1])[0][0];
}

/** Where films come from: one bubble per country, decade by decade or for all time. */
export function WorldMap({films, logs, selectedId, firstYear, lastYear, onSelect, onShowCountry}: WorldMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({width: 0, height: 0});
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  /** The decade shown, or null for all time. */
  const [decade, setDecade] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [hover, setHover] = useState<{code: string; x: number; y: number} | null>(null);

  const decades = useMemo(() => {
    const list: number[] = [];
    for (let year = Math.floor(firstYear / 10) * 10; year <= lastYear; year += 10) list.push(year);
    return list.filter(start => films.some(film => film.year >= start && film.year < start + 10));
  }, [films, firstYear, lastYear]);

  const countries = useMemo(() => {
    const inPeriod = decade === null ? films : films.filter(film => film.year >= decade && film.year < decade + 10);
    const byCode = new Map<string, Film[]>();
    for (const film of inPeriod)
      if (film.country) byCode.set(film.country, [...(byCode.get(film.country) ?? []), film]);
    return [...byCode.entries()]
      .map(([code, list]): Country => ({
        code,
        films: [...list].sort((first, second) => first.date.localeCompare(second.date)),
        seen: list.filter(film => logs?.get(film.id)?.watched).length,
        scene: mainScene(list),
      }))
      .sort((first, second) => second.films.length - first.films.length);
  }, [films, decade, logs]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => setSize({width: container.clientWidth, height: container.clientHeight}));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Pan with a drag, zoom with the wheel or a pinch. Bubbles keep their size on screen.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const behavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8])
      .on('zoom', (event: {transform: ZoomTransform}) => {
        setTransform(event.transform);
        setHover(null);
      });
    select(svg).call(behavior).on('dblclick.zoom', null);
    return () => {
      select(svg).on('.zoom', null);
    };
  }, []);

  // Play: one decade after the other, then stop on the last one.
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setDecade(current => {
        const index = current === null ? -1 : decades.indexOf(current);
        if (index >= decades.length - 1) {
          setPlaying(false);
          return current;
        }
        return decades[index + 1];
      });
    }, PLAY_STEP_MS);
    return () => window.clearInterval(timer);
  }, [playing, decades]);

  const projection = useMemo(
    () =>
      geoEqualEarth().fitExtent(
        [
          [12, 12],
          [Math.max(24, size.width - 12), Math.max(24, size.height - 12)],
        ],
        {type: 'Sphere'},
      ),
    [size],
  );
  // Drawn once per size: zooming only moves the group that holds them.
  const shapes = useMemo(() => {
    const draw = geoPath(projection);
    return {
      sphere: draw({type: 'Sphere'}) ?? undefined,
      land: draw(land) ?? undefined,
      borders: draw(borders) ?? undefined,
    };
  }, [projection]);
  const biggest = Math.max(1, ...countries.map(country => country.films.length));
  const maxRadius = Math.max(14, Math.min(size.width, size.height) / 14);
  const radius = (count: number) => Math.max(3.5, maxRadius * Math.sqrt(count / biggest));
  const placed = countries.filter(country => COUNTRY_POINTS[country.code]);
  const elsewhere = countries.filter(country => !COUNTRY_POINTS[country.code]);
  const pickedCountry = countries.find(country => country.code === picked) ?? null;
  const hoverCountry = countries.find(country => country.code === hover?.code) ?? null;

  const point = (code: string) => {
    const projected = projection(COUNTRY_POINTS[code]) ?? [0, 0];
    return transform.apply(projected);
  };

  return (
    <div className="map-view">
      <div className="view-toolbar">
        <div className="map-periods" role="group" aria-label="Period">
          <button
            type="button"
            className="toggle map-play"
            aria-pressed={playing}
            onClick={() => {
              if (!playing && (decade === null || decade === decades[decades.length - 1])) setDecade(decades[0]);
              setPlaying(current => !current);
            }}
          >
            <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span> {playing ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            className="chip chip-all"
            aria-pressed={decade === null}
            onClick={() => {
              setPlaying(false);
              setDecade(null);
            }}
          >
            All time
          </button>
          {decades.map(start => (
            <button
              key={start}
              type="button"
              className="chip chip-decade"
              aria-pressed={decade === start}
              onClick={() => {
                setPlaying(false);
                setDecade(start);
              }}
            >
              {start}s
            </button>
          ))}
        </div>
      </div>
      <div ref={containerRef} className="map-stage">
        <svg ref={svgRef} className="map-svg" role="img" aria-label="Map of where the films come from">
          <g transform={transform.toString()}>
            <path className="map-sphere" d={shapes.sphere} />
            <path className="map-land" d={shapes.land} />
            <path className="map-borders" d={shapes.borders} />
          </g>
          {placed.map(country => {
            const [x, y] = point(country.code);
            const hasSelected = country.films.some(film => film.id === selectedId);
            return (
              <circle
                key={country.code}
                className={`map-bubble${country.code === picked || hasSelected ? ' is-picked' : ''}${country.seen ? ' is-seen' : ''}`}
                cx={x}
                cy={y}
                r={radius(country.films.length)}
                style={{color: SCENES[country.scene].color}}
                onClick={() => setPicked(current => (current === country.code ? null : country.code))}
                onPointerEnter={event => {
                  const rect = containerRef.current?.getBoundingClientRect();
                  if (rect) setHover({code: country.code, x: event.clientX - rect.left, y: event.clientY - rect.top});
                }}
                onPointerLeave={() => setHover(current => (current?.code === country.code ? null : current))}
              />
            );
          })}
        </svg>

        {decade !== null && <p className="map-decade">{decade}s</p>}

        {hover && hoverCountry && (
          <div className="view-tooltip map-tooltip" style={{left: hover.x + 14, top: hover.y + 14}}>
            <span>
              <b>
                {flag(hoverCountry.code)} {countryName(hoverCountry.code)}
              </b>
              <span>
                {hoverCountry.films.length} {hoverCountry.films.length === 1 ? 'film' : 'films'}
                {logs ? `, ${hoverCountry.seen} seen` : ''} · mostly {SCENES[hoverCountry.scene].label}
              </span>
            </span>
          </div>
        )}

        {pickedCountry && (
          <div className="map-card" style={cssVars({'--scene': SCENES[pickedCountry.scene].color})}>
            <div className="map-card-head">
              <h3>
                {flag(pickedCountry.code)} {countryName(pickedCountry.code)}
              </h3>
              <button type="button" className="round" aria-label="Close" onClick={() => setPicked(null)}>
                ×
              </button>
            </div>
            <p className="field-hint">
              {pickedCountry.films.length} {pickedCountry.films.length === 1 ? 'film' : 'films'}
              {decade === null ? '' : ` from the ${decade}s`}
              {logs ? `, ${pickedCountry.seen} seen` : ''}
            </p>
            <ul className="map-films">
              {pickedCountry.films.map(film => (
                <li key={film.id}>
                  <button
                    type="button"
                    data-film={film.id}
                    className={`map-film${film.id === selectedId ? ' is-selected' : ''}${logs?.get(film.id)?.watched ? ' is-seen' : ''}`}
                    title={`${film.title} (${film.year})`}
                    onClick={() => onSelect(film.id)}
                  >
                    {film.tmdb?.poster ? (
                      <img src={poster(film.tmdb.poster, 'w92')!} alt="" loading="lazy" />
                    ) : (
                      <span className="result-blank" />
                    )}
                    <span className="map-film-year">{film.year}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="go" onClick={() => onShowCountry(pickedCountry.code)}>
              Show on the timeline
            </button>
          </div>
        )}

        {elsewhere.length > 0 && (
          <p className="map-elsewhere">
            Not on the map:{' '}
            {elsewhere.map(country => `${countryName(country.code)} (${country.films.length})`).join(', ')}
          </p>
        )}
      </div>
    </div>
  );
}
