const KEYBOARD_HINTS_STORAGE_KEY = 'tangent.keyboard-hints-visible';

export interface KeyboardHintsUiOptions {
  element: HTMLElement;
  getUserRole: () => string | null;
  isWorkspaceVisible: () => boolean;
  isCompactViewport?: () => boolean;
  getStoredPreference: () => string | null;
  setStoredPreference: (value: string) => void;
}

export function initKeyboardHintsUi(options: KeyboardHintsUiOptions): {
  isPreferenceEnabled: () => boolean;
  updateVisibility: () => void;
  toggle: () => void;
} {
  let preferenceEnabled = true;
  try {
    preferenceEnabled = options.getStoredPreference() !== 'false';
  } catch {
    preferenceEnabled = true;
  }
  const isCompactViewport = options.isCompactViewport ?? (() => false);
  let compactViewport = isCompactViewport();
  let compactOverride: boolean | null = null;

  function syncViewportMode(): boolean {
    const nextCompactViewport = isCompactViewport();
    if (nextCompactViewport !== compactViewport) {
      compactViewport = nextCompactViewport;
      compactOverride = null;
    }
    return compactViewport;
  }

  function updateVisibility(): void {
    const isCompact = syncViewportMode();
    const role = options.getUserRole();
    const showByPreference = isCompact ? (compactOverride ?? false) : preferenceEnabled;
    options.element.hidden = !showByPreference
      || role === null
      || role === 'guest'
      || !options.isWorkspaceVisible();
  }

  function toggle(): void {
    const role = options.getUserRole();
    if (role === null || role === 'guest' || !options.isWorkspaceVisible()) return;
    if (syncViewportMode()) {
      compactOverride = !(compactOverride ?? false);
      updateVisibility();
      return;
    }
    preferenceEnabled = !preferenceEnabled;
    try {
      options.setStoredPreference(String(preferenceEnabled));
    } catch {
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
