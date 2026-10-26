/**
 * StudyCloud design tokens. Contrast ratios were measured (WCAG 2.x) — see test/contrast.test.ts.
 * The suggested brand violet #7A61E8 only reaches 4.47:1 with white text, so it is used for decorative and
 * large elements; interactive fills use #6A50D8 (5.6:1) and accent text uses #5642B5 (7.1:1).
 */
export type Scheme = 'light' | 'dark';

export interface Colors {
  bg: string;
  surface: string;
  surfaceAlt: string; // lavender tint
  text: string;
  textMuted: string;
  border: string; // decorative dividers
  borderStrong: string; // input outlines (≥3:1 non-text contrast)
  brand: string; // decorative brand violet
  primary: string; // button fill (white text ≥4.5:1)
  onPrimary: string;
  accentText: string; // violet text on bg/surface (≥4.5:1)
  success: string;
  warning: string;
  danger: string;
  info: string;
  overlay: string;
  focus: string;
}

export const lightColors: Colors = {
  bg: '#FAFAFD',
  surface: '#FFFFFF',
  surfaceAlt: '#F3EFFF',
  text: '#1B1B2B',
  textMuted: '#5B5B73',
  border: '#E4E1F2',
  borderStrong: '#8C88A8',
  brand: '#7A61E8',
  primary: '#6A50D8',
  onPrimary: '#FFFFFF',
  accentText: '#5642B5',
  success: '#17744A',
  warning: '#8A5200',
  danger: '#B3261E',
  info: '#1F5FBF',
  overlay: 'rgba(17,18,27,0.5)',
  focus: '#1F5FBF',
};

export const darkColors: Colors = {
  bg: '#11121B',
  surface: '#1A1B28',
  surfaceAlt: '#25233A',
  text: '#F2F1FA',
  textMuted: '#A9A8C2',
  border: '#2E2F44',
  borderStrong: '#6D6A8C',
  brand: '#7A61E8',
  primary: '#A394F5',
  onPrimary: '#11121B',
  accentText: '#A394F5',
  success: '#4CC38A',
  warning: '#F0B24D',
  danger: '#FF8A7A',
  info: '#8DB7FF',
  overlay: 'rgba(0,0,0,0.6)',
  focus: '#8DB7FF',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;
export const fontSize = { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, xxl: 28, display: 34 } as const;
/** Minimum interactive size (WCAG 2.5.8 / platform guidance). */
export const MIN_TARGET = 48;

export const breakpoints = { wide: 900 } as const;

/** Subject colors are configuration (server). In dark mode they are lightened for contrast. */
export function subjectColor(hex: string, scheme: Scheme): string {
  if (scheme === 'light') return hex;
  const h = hex.replace('#', '');
  const mix = (c: number) => Math.round(c + (255 - c) * 0.45);
  const [r, g, b] = [0, 2, 4].map((i) => mix(parseInt(h.slice(i, i + 2), 16)));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const f = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : Math.pow((c / 255 + 0.055) / 1.055, 2.4));
  const [r, g, b] = [0, 2, 4].map((i) => f(parseInt(h.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
