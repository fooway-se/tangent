export const THEME_STORAGE_KEY = 'tangent.theme';
export const THEMES = [
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
