const KEYBOARD_HINTS_STORAGE_KEY = 'tangent.keyboard-hints-visible';
export function initKeyboardHintsUi(options) {
    let preferenceEnabled = true;
    try {
        preferenceEnabled = options.getStoredPreference() !== 'false';
    }
    catch {
        preferenceEnabled = true;
    }
    const isCompactViewport = options.isCompactViewport ?? (() => false);
    let compactViewport = isCompactViewport();
    let compactOverride = null;
    function syncViewportMode() {
        const nextCompactViewport = isCompactViewport();
        if (nextCompactViewport !== compactViewport) {
            compactViewport = nextCompactViewport;
            compactOverride = null;
        }
        return compactViewport;
    }
    function updateVisibility() {
        const isCompact = syncViewportMode();
        const role = options.getUserRole();
        const showByPreference = isCompact ? (compactOverride ?? false) : preferenceEnabled;
        options.element.hidden = !showByPreference
            || role === null
            || role === 'guest'
            || !options.isWorkspaceVisible();
    }
    function toggle() {
        const role = options.getUserRole();
        if (role === null || role === 'guest' || !options.isWorkspaceVisible())
            return;
        if (syncViewportMode()) {
            compactOverride = !(compactOverride ?? false);
            updateVisibility();
            return;
        }
        preferenceEnabled = !preferenceEnabled;
        try {
            options.setStoredPreference(String(preferenceEnabled));
        }
        catch {
            // Storage can be blocked; the choice then lasts for this page only.
        }
        updateVisibility();
    }
    return {
        isPreferenceEnabled: () => {
            const isCompact = syncViewportMode();
            return isCompact ? (compactOverride ?? false) : preferenceEnabled;
        },
        updateVisibility,
        toggle,
    };
}
export { KEYBOARD_HINTS_STORAGE_KEY };
