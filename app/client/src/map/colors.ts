export type RGBA = [number, number, number, number];
type RGB = [number, number, number];

/** Brand tokens as RGB (Navy 900 #0B2026, Lava 600 #FF3621) plus the two status accents from the spec. */
export const NAVY: RGB = [0x0b, 0x20, 0x26];
export const LAVA: RGB = [0xff, 0x36, 0x21];
export const AMBER: RGB = [0xf5, 0xa6, 0x23];
export const TEAL: RGB = [0x1b, 0x8a, 0x8f];
export const GRAY: RGBA = [150, 150, 150, 160];

const ALPHA = 230;

/** Percent of baseline on a Lava (0%) to Navy (100% or more) ramp; gray when unknown. */
export function pctColor(pct: number | null): RGBA {
  if (pct == null || Number.isNaN(pct)) return [...GRAY];
  const t = Math.min(1, Math.max(0, pct / 100));
  const mix = (i: number) => Math.round(LAVA[i] + (NAVY[i] - LAVA[i]) * t);
  return [mix(0), mix(1), mix(2), ALPHA];
}

export function statusColor(status: string | null | undefined): RGBA {
  switch (status) {
    case 'Normal':
      return [...NAVY, ALPHA];
    case 'Degraded':
      return [...AMBER, ALPHA];
    case 'Shifted to alternative':
      return [...TEAL, ALPHA];
    case 'Disrupted':
      return [...LAVA, ALPHA];
    default:
      return [...GRAY];
  }
}

export const rgbaCss = (c: RGBA | RGB): string =>
  c.length === 4 ? `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${(c[3] / 255).toFixed(2)})` : `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
