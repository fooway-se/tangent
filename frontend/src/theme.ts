export type ThemeId = 'putty' | 'rainbow' | 'breadbin' | 'broadcast' | 'cassette' | 'mono' | 'stripe' | 'paper' | 'desk' | 'silver' | 'blue' | 'cartridge' | 'nordic' | 'desktop' | 'copper' | 'altair' | 'atari-st' | 'x68000' | 'pc88' | 'microbee' | 'coleco-adam' | 'jupiter-ace' | 'oric-1' | 'dragon-32' | 'acorn-atom' | 'clean' | 'clean-dark';

export interface ThemeOption {
  id: ThemeId;
  label: string;
}

export const THEME_STORAGE_KEY = 'tangent.theme';

export const THEMES: readonly ThemeOption[] = [
  { id: 'putty', label: 'Putty & Screen' },
  { id: 'rainbow', label: 'Rubber & Rainbow' },
  { id: 'breadbin', label: 'Breadbin' },
  { id: 'broadcast', label: 'Broadcast & Beige' },
  { id: 'cassette', label: 'Cassette & Colour' },
  { id: 'mono', label: 'Mono & Membrane' },
  { id: 'stripe', label: 'Stripe & Signal' },
  { id: 'paper', label: 'Paper & Rainbow' },
  { id: 'desk', label: 'Desk & Phosphor' },
  { id: 'silver', label: 'Silver & Speech' },
  { id: 'blue', label: 'Blue & Byte' },
  { id: 'cartridge', label: 'Cartridge & Cobalt' },
  { id: 'nordic', label: 'Nordic & Phosphor' },
  { id: 'desktop', label: 'Icon & Mouse' },
  { id: 'copper', label: 'Copper & Chroma' },
  { id: 'altair', label: 'Switches & Steel' },
  { id: 'atari-st', label: 'Studio & Sound' },
  { id: 'x68000', label: 'Arcade & Towers' },
  { id: 'pc88', label: 'Kana & Keycaps' },
  { id: 'microbee', label: 'Beehive & Beige' },
  { id: 'coleco-adam', label: 'Daisy & Data Pack' },
  { id: 'jupiter-ace', label: 'Ivory & Ink' },
  { id: 'oric-1', label: 'Chroma & Charcoal' },
  { id: 'dragon-32', label: 'Wedge & Raster' },
  { id: 'acorn-atom', label: 'Ivory & Assembly' },
  { id: 'clean', label: 'Clean' },
  { id: 'clean-dark', label: 'Clean (dark)' },
];

export function normalizeTheme(value: unknown): ThemeId {
  return THEMES.some((theme) => theme.id === value) ? (value as ThemeId) : 'putty';
}

export function nextTheme(current: ThemeId): ThemeId {
  const index = THEMES.findIndex((theme) => theme.id === current);
  return THEMES[(index + 1) % THEMES.length]!.id;
}

export function themeLabel(id: ThemeId): string {
  return THEMES.find((theme) => theme.id === id)?.label ?? THEMES[0]!.label;
}

export function loadTheme(): ThemeId {
  try {
    return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'putty';
  }
}

export function applyTheme(id: ThemeId): void {
  const root = document.documentElement;
  if (id === 'putty') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', id);
  try {
    if (id === 'putty') window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    /* Storage can be blocked; the choice then lasts for this page only. */
  }
}
