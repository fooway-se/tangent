export type ThemeId = 'putty' | 'rainbow' | 'breadbin';

export interface ThemeOption {
  id: ThemeId;
  label: string;
}

export const THEME_STORAGE_KEY = 'tangent.theme';

export const THEMES: readonly ThemeOption[] = [
  { id: 'putty', label: 'Putty & Screen' },
  { id: 'rainbow', label: 'Rubber & Rainbow' },
  { id: 'breadbin', label: 'Breadbin' },
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
