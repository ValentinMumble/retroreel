import type {Film} from './types';

export interface Metrics {
  compact: boolean;
  cardWidth: number;
  /** Height of the poster, which is 2:3. */
  posterHeight: number;
  cardHeight: number;
  gapX: number;
  gapY: number;
  rows: number;
  erasHeight: number;
  axisHeight: number;
  introWidth: number;
  outroWidth: number;
  emptyWidth: number;
}

export interface YearBlock {
  year: number;
  films: Film[];
  /** Left edge in the scrolling track, in pixels. */
  x: number;
  width: number;
}

export interface Layout {
  blocks: YearBlock[];
  total: number;
  introWidth: number;
  outroWidth: number;
}

const TEXT_HEIGHT = 62;
const POSTER_RATIO = 1.5;

/** Card size and number of rows that fit the visible timeline area. */
export function measure(width: number, height: number): Metrics {
  const compact = width < 640;
  const gapX = compact ? 14 : 22;
  const gapY = compact ? 14 : 20;
  const erasHeight = 66;
  const axisHeight = compact ? 40 : 46;
  const available = height - erasHeight - axisHeight - 12;
  let cardWidth = compact ? 112 : 142;
  if (available < cardWidth * POSTER_RATIO + TEXT_HEIGHT) {
    cardWidth = Math.max(72, Math.floor((available - TEXT_HEIGHT) / POSTER_RATIO));
  }
  const posterHeight = Math.round(cardWidth * POSTER_RATIO);
  const cardHeight = posterHeight + TEXT_HEIGHT;
  const rows = Math.min(4, Math.max(1, Math.floor((available + gapY) / (cardHeight + gapY))));
  return {
    compact,
    cardWidth,
    posterHeight,
    cardHeight,
    gapX,
    gapY,
    rows,
    erasHeight,
    axisHeight,
    introWidth: compact ? Math.min(width, 340) : 460,
    outroWidth: compact ? Math.min(width, 320) : 420,
    emptyWidth: compact ? 34 : 40,
  };
}

/** One block per year, wide enough for its films stacked in `rows` rows. Empty years stay narrow. */
export function buildLayout(films: Film[], metrics: Metrics, firstYear: number, lastYear: number): Layout {
  const byYear = new Map<number, Film[]>();
  for (const film of films) byYear.set(film.year, [...(byYear.get(film.year) ?? []), film]);
  const blocks: YearBlock[] = [];
  let x = metrics.introWidth;
  for (let year = firstYear; year <= lastYear; year += 1) {
    const yearFilms = byYear.get(year) ?? [];
    const columns = Math.ceil(yearFilms.length / metrics.rows);
    const width = columns ? columns * (metrics.cardWidth + metrics.gapX) : metrics.emptyWidth;
    blocks.push({year, films: yearFilms, x, width});
    x += width;
  }
  return {blocks, total: x + metrics.outroWidth, introWidth: metrics.introWidth, outroWidth: metrics.outroWidth};
}

export function yearAt(layout: Layout, x: number): number {
  let found = layout.blocks[0];
  for (const block of layout.blocks) {
    if (block.x > x) break;
    found = block;
  }
  return found.year;
}

export function spanOf(layout: Layout, start: number, end: number) {
  const inRange = layout.blocks.filter(block => block.year >= start && block.year <= end);
  if (inRange.length === 0) return null;
  const first = inRange[0];
  const last = inRange[inRange.length - 1];
  return {left: first.x + 4, width: last.x + last.width - first.x - 8};
}
