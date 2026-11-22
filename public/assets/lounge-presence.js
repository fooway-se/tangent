import { ApiFailure, api } from './api.js';
const POLL_INTERVAL_MS = 15_000;
export function initLoungePresence(options) {
    const doc = options.doc ?? document;
    const request = options.request ?? api;
    const loungePresence = doc.querySelector('#lounge-presence');
    const loungeNavPresenceBadge = doc.querySelector('#lounge-nav-presence');
    let loungePresenceTimer = null;
    let loungePresenceRequestVersion = 0;
    let loungePresenceRenderKey = null;
    let workspacePresenceTimer = null;
    let workspacePresenceRequestVersion = 0;
    function renderNavigationPresence(members) {
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
    function setLoungePresenceStatus(message, renderKey) {
        if (loungePresenceRenderKey === renderKey)
            return;
        loungePresenceRenderKey = renderKey;
        loungePresence.textContent = message;
    }
    function renderLoungePresence(members) {
        const renderKey = JSON.stringify(members.map(({ id, name }) => [id, name]));
        if (loungePresenceRenderKey === renderKey)
            return;
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
    function stopLoungePolling() {
        if (loungePresenceTimer !== null)
            window.clearTimeout(loungePresenceTimer);
        loungePresenceTimer = null;
        loungePresenceRequestVersion += 1;
    }
    function scheduleLoungePoll(delay = POLL_INTERVAL_MS) {
        if (!options.isLoungeActive())
            return;
        if (loungePresenceTimer !== null)
            window.clearTimeout(loungePresenceTimer);
        loungePresenceTimer = window.setTimeout(() => {
            loungePresenceTimer = null;
            void pollLoungePresence();
        }, delay);
    }
    async function pollLoungePresence() {
        if (!options.isLoungeActive() || !options.isLoungeVisible())
            return;
        if (loungePresenceTimer !== null)
            window.clearTimeout(loungePresenceTimer);
        loungePresenceTimer = null;
        if (options.isDocumentHidden()) {
            scheduleLoungePoll();
            return;
        }
        const requestVersion = ++loungePresenceRequestVersion;
        try {
            const result = await request('/lounge/presence', {
                method: 'POST',
                body: JSON.stringify({}),
            });
            if (requestVersion !== loungePresenceRequestVersion || !options.isLoungeActive() || !options.isLoungeVisible())
                return;
            renderLoungePresence(result.members);
        }
        catch (error) {
            if (requestVersion !== loungePresenceRequestVersion || !options.isLoungeActive())
                return;
            if (error instanceof ApiFailure && error.status === 401) {
                options.onUnauthorized();
                return;
            }
            setLoungePresenceStatus('Could not check who’s in the Lounge.', 'error');
        }
        finally {
            if (requestVersion === loungePresenceRequestVersion && options.isLoungeActive())
                scheduleLoungePoll();
        }
    }
    function stopWorkspaceMonitor() {
        if (workspacePresenceTimer !== null)
            window.clearTimeout(workspacePresenceTimer);
        workspacePresenceTimer = null;
        workspacePresenceRequestVersion += 1;
    }
    function scheduleWorkspacePoll(delay = POLL_INTERVAL_MS) {
        const user = options.getUser();
        if (user === null || user.role === 'guest' || !options.isWorkspaceVisible())
            return;
        if (workspacePresenceTimer !== null)
            window.clearTimeout(workspacePresenceTimer);
        workspacePresenceTimer = window.setTimeout(() => {
            workspacePresenceTimer = null;
            void pollWorkspacePresence();
        }, delay);
    }
    async function pollWorkspacePresence() {
        const user = options.getUser();
        if (user === null || user.role === 'guest' || !options.isWorkspaceVisible())
            return;
        if (workspacePresenceTimer !== null)
            window.clearTimeout(workspacePresenceTimer);
        workspacePresenceTimer = null;
        if (options.isDocumentHidden() || (options.isLoungeActive() && options.isLoungeVisible())) {
            scheduleWorkspacePoll();
            return;
        }
        const requestVersion = ++workspacePresenceRequestVersion;
        try {
            const result = await request('/lounge/presence');
            if (requestVersion !== workspacePresenceRequestVersion || options.getUser() === null || options.isLoungeActive())
                return;
            renderNavigationPresence(result.members.filter((member) => member.id !== options.getUser()?.id));
        }
        catch (error) {
            if (requestVersion !== workspacePresenceRequestVersion)
                return;
            if (error instanceof ApiFailure && error.status === 401) {
                options.onUnauthorized();
                return;
            }
        }
        finally {
            if (requestVersion === workspacePresenceRequestVersion)
                scheduleWorkspacePoll();
        }
    }
    function reset() {
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
