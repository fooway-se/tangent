export const THEME_STORAGE_KEY = 'tangent.theme';
export const THEMES = [
    { id: 'putty', label: 'Putty & Screen' },
    { id: 'rainbow', label: 'Rubber & Rainbow' },
    { id: 'breadbin', label: 'Breadbin' },
];
export function normalizeTheme(value) {
    return THEMES.some((theme) => theme.id === value) ? value : 'putty';
}
export function nextTheme(current) {
    const index = THEMES.findIndex((theme) => theme.id === current);
    return THEMES[(index + 1) % THEMES.length].id;
}
export function themeLabel(id) {
    return THEMES.find((theme) => theme.id === id)?.label ?? THEMES[0].label;
}
export function loadTheme() {
    try {
        return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
    }
    catch {
        return 'putty';
    }
}
export function applyTheme(id) {
    const root = document.documentElement;
    if (id === 'putty')
        root.removeAttribute('data-theme');
    else
        root.setAttribute('data-theme', id);
    try {
        if (id === 'putty')
            window.localStorage.removeItem(THEME_STORAGE_KEY);
        else
            window.localStorage.setItem(THEME_STORAGE_KEY, id);
    }
    catch {
        /* Storage can be blocked; the choice then lasts for this page only. */
    }
}
