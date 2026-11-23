const KEYBOARD_HINTS_STORAGE_KEY = 'tangent.keyboard-hints-visible';
export function initKeyboardHintsUi(options) {
    let preferenceEnabled = true;
    try {
        preferenceEnabled = options.getStoredPreference() !== 'false';
    }
    catch {
        preferenceEnabled = true;
    }
    function updateVisibility() {
        const role = options.getUserRole();
        options.element.hidden = !preferenceEnabled
            || role === null
            || role === 'guest'
            || !options.isWorkspaceVisible();
    }
    function toggle() {
        const role = options.getUserRole();
        if (role === null || role === 'guest' || !options.isWorkspaceVisible())
            return;
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
        isPreferenceEnabled: () => preferenceEnabled,
        updateVisibility,
        toggle,
    };
}
export { KEYBOARD_HINTS_STORAGE_KEY };
