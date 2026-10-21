import type {CSSProperties} from 'react';

/** Inline style with CSS custom properties, e.g. cssVars({ '--scene': '#f00' }). */
export function cssVars(vars: Record<string, string | number>, style: CSSProperties = {}): CSSProperties {
  return {...style, ...vars} as CSSProperties;
}
