import { ApiFailure, api } from './api.js';
import type { LoungePresenceMember, User } from './types.js';

const POLL_INTERVAL_MS = 15_000;

export interface LoungePresenceController {
  pollLoungePresence(): Promise<void>;
  pollWorkspacePresence(): Promise<void>;
  stopLoungePolling(): void;
  stopWorkspaceMonitor(): void;
  renderNavigationPresence(members: readonly LoungePresenceMember[]): void;
  setLoungePresenceStatus(message: string, renderKey: string): void;
  resetLoungeStatus(): void;
  reset(): void;
  dispose(): void;
}

export function initLoungePresence(options: {
  navigationButton: HTMLButtonElement;
  getUser: () => User | null;
  isLoungeActive: () => boolean;
  isLoungeVisible: () => boolean;
  isWorkspaceVisible: () => boolean;
  isDocumentHidden: () => boolean;
  onUnauthorized: () => void;
  request?: typeof api;
  doc?: Document;
}): LoungePresenceController {
  const doc = options.doc ?? document;
  const request = options.request ?? api;
  const loungePresence = doc.querySelector<HTMLElement>('#lounge-presence')!;
  const loungeNavPresenceBadge = doc.querySelector<HTMLElement>('#lounge-nav-presence')!;
  let loungePresenceTimer: number | null = null;
  let loungePresenceRequestVersion = 0;
  let loungePresenceRenderKey: string | null = null;
  let workspacePresenceTimer: number | null = null;
  let workspacePresenceRequestVersion = 0;

  function renderNavigationPresence(members: readonly LoungePresenceMember[]): void {
    if (members.length === 0) {
      loungeNavPresenceBadge.hidden = true;
      loungeNavPresenceBadge.textContent = '';
      options.navigationButton.removeAttribute('title');
      options.navigationButton.removeAttribute('aria-label');
      return;
    }

    const names = members.map((member) => member.name);
    const countLabel = `${members.length} here`;
    const countDescription = `${members.length} ${members.length === 1 ? 'person' : 'people'} in the Lounge`;
    loungeNavPresenceBadge.textContent = countLabel;
    loungeNavPresenceBadge.hidden = false;
    options.navigationButton.title = `${countDescription}: ${names.join(', ')}`;
    options.navigationButton.setAttribute('aria-label', `Lounge. ${countDescription}: ${names.join(', ')}`);
  }

  function setLoungePresenceStatus(message: string, renderKey: string): void {
    if (loungePresenceRenderKey === renderKey) return;
    loungePresenceRenderKey = renderKey;
    loungePresence.textContent = message;
  }

  function renderLoungePresence(members: readonly LoungePresenceMember[]): void {
    const renderKey = JSON.stringify(members.map(({ id, name }) => [id, name]));
    if (loungePresenceRenderKey === renderKey) return;
    loungePresenceRenderKey = renderKey;
    loungePresence.replaceChildren();

    const label = doc.createElement('span');
    label.className = 'lounge-presence-label';
    label.textContent = members.length === 1 ? 'Here now' : `Here now (${members.length})`;
    loungePresence.append(label);

    for (const member of members) {
      const person = doc.createElement('span');
      person.className = 'lounge-presence-person';
      person.textContent = member.name;
      loungePresence.append(person);
    }
    renderNavigationPresence(members);
  }

  function stopLoungePolling(): void {
    if (loungePresenceTimer !== null) window.clearTimeout(loungePresenceTimer);
    loungePresenceTimer = null;
    loungePresenceRequestVersion += 1;
  }

  function scheduleLoungePoll(delay = POLL_INTERVAL_MS): void {
    if (!options.isLoungeActive()) return;
    if (loungePresenceTimer !== null) window.clearTimeout(loungePresenceTimer);
    loungePresenceTimer = window.setTimeout(() => {
      loungePresenceTimer = null;
      void pollLoungePresence();
    }, delay);
  }

  async function pollLoungePresence(): Promise<void> {
    if (!options.isLoungeActive() || !options.isLoungeVisible()) return;
    if (loungePresenceTimer !== null) window.clearTimeout(loungePresenceTimer);
    loungePresenceTimer = null;
    if (options.isDocumentHidden()) {
      scheduleLoungePoll();
      return;
    }

    const requestVersion = ++loungePresenceRequestVersion;
    try {
      const result = await request<{ members: LoungePresenceMember[] }>('/lounge/presence', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (requestVersion !== loungePresenceRequestVersion || !options.isLoungeActive() || !options.isLoungeVisible()) return;
      renderLoungePresence(result.members);
    } catch (error) {
      if (requestVersion !== loungePresenceRequestVersion || !options.isLoungeActive()) return;
      if (error instanceof ApiFailure && error.status === 401) {
        options.onUnauthorized();
        return;
      }
      setLoungePresenceStatus('Could not check who’s in the Lounge.', 'error');
    } finally {
      if (requestVersion === loungePresenceRequestVersion && options.isLoungeActive()) scheduleLoungePoll();
    }
  }

  function stopWorkspaceMonitor(): void {
    if (workspacePresenceTimer !== null) window.clearTimeout(workspacePresenceTimer);
    workspacePresenceTimer = null;
    workspacePresenceRequestVersion += 1;
  }

  function scheduleWorkspacePoll(delay = POLL_INTERVAL_MS): void {
    const user = options.getUser();
    if (user === null || user.role === 'guest' || !options.isWorkspaceVisible()) return;
    if (workspacePresenceTimer !== null) window.clearTimeout(workspacePresenceTimer);
    workspacePresenceTimer = window.setTimeout(() => {
      workspacePresenceTimer = null;
      void pollWorkspacePresence();
    }, delay);
  }

  async function pollWorkspacePresence(): Promise<void> {
    const user = options.getUser();
    if (user === null || user.role === 'guest' || !options.isWorkspaceVisible()) return;
    if (workspacePresenceTimer !== null) window.clearTimeout(workspacePresenceTimer);
    workspacePresenceTimer = null;
    if (options.isDocumentHidden() || (options.isLoungeActive() && options.isLoungeVisible())) {
      scheduleWorkspacePoll();
      return;
    }

    const requestVersion = ++workspacePresenceRequestVersion;
    try {
      const result = await request<{ members: LoungePresenceMember[] }>('/lounge/presence');
      if (requestVersion !== workspacePresenceRequestVersion || options.getUser() === null || options.isLoungeActive()) return;
      renderNavigationPresence(result.members.filter((member) => member.id !== options.getUser()?.id));
    } catch (error) {
      if (requestVersion !== workspacePresenceRequestVersion) return;
      if (error instanceof ApiFailure && error.status === 401) {
        options.onUnauthorized();
        return;
      }
    } finally {
      if (requestVersion === workspacePresenceRequestVersion) scheduleWorkspacePoll();
    }
  }

  function reset(): void {
    stopLoungePolling();
    stopWorkspaceMonitor();
    loungePresenceRenderKey = null;
    renderNavigationPresence([]);
  }

  return {
    pollLoungePresence,
    pollWorkspacePresence,
    stopLoungePolling,
    stopWorkspaceMonitor,
    renderNavigationPresence,
    setLoungePresenceStatus,
    resetLoungeStatus: () => { loungePresenceRenderKey = null; },
    reset,
    dispose: () => {
      stopLoungePolling();
      stopWorkspaceMonitor();
    },
  };
}
