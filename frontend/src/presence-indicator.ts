export type PresenceState = 'active' | 'alone' | 'unknown' | 'checking';

const PRESENCE_LABELS: Readonly<Record<PresenceState, string>> = {
  active: 'Another person is viewing this project',
  alone: 'No other active viewers',
  unknown: 'Could not check whether anyone else is viewing this project',
  checking: 'Checking project viewer status',
};

// Shared by the project chat heading and the workspace top bar, which show the
// same indicator in whichever of the two is currently visible.
export function applyPresenceState(indicator: HTMLElement, state: PresenceState): void {
  const isActive = state === 'active';
  const light = indicator.querySelector<HTMLElement>('.chat-presence-light');
  indicator.className = isActive
    ? 'chat-presence is-active'
    : state === 'alone' ? 'chat-presence is-alone' : 'chat-presence is-unknown';
  light?.classList.toggle('is-on', isActive);
  light?.classList.toggle('is-off', !isActive);
  indicator.setAttribute('aria-label', PRESENCE_LABELS[state]);
  indicator.title = PRESENCE_LABELS[state];
}
