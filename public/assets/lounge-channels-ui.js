import { ApiFailure, api, apiBaseUrl } from './api.js';
import { bindRealtimePolling, shouldUsePolling } from './realtime-polling.js';
import { addUnreadChatEvents, latestChatFeedCursor, markChatChannelRead, parseLoungeChannelUnreadState, } from './lounge-channel-state.js';
const MAX_POLL_DELAY_MS = 10_000;
export function initLoungeChannelsUi(options) {
    const doc = options.doc ?? document;
    const request = options.request ?? api;
    const fetcher = options.fetcher ?? fetch;
    const listeners = new AbortController();
    const projectLinks = new Map();
    const projectEntries = new Map();
    let active = false;
    let timer = null;
    let pollDelay = 1000;
    let etag = null;
    let projects = [];
    let selectedId = null;
    let state = { cursor: 0, unreadByProject: {} };
    let stateKey = null;
    let hasSavedState = false;
    let projectsLoaded = false;
    let feedInitialized = false;
    let initialFeedPromise = Promise.resolve();
    function storage() {
        if (options.storage !== undefined)
            return options.storage;
        try {
            return window.localStorage;
        }
        catch {
            return null;
        }
    }
    function persistState() {
        if (stateKey === null)
            return;
        try {
            storage()?.setItem(stateKey, JSON.stringify(state));
        }
        catch {
            // Unread markers are a convenience; a full or unavailable store should not break chat.
        }
    }
    function readSavedState() {
        if (stateKey === null)
            return null;
        try {
            return storage()?.getItem(stateKey) ?? null;
        }
        catch {
            return null;
        }
    }
    function setSelectedChannel(link, projectId) {
        selectedId = projectId;
        const channelLinks = [options.generalLink, ...projectLinks.values()];
        for (const candidate of channelLinks) {
            if (candidate === link)
                candidate.setAttribute('aria-current', 'page');
            else
                candidate.removeAttribute('aria-current');
            candidate.classList.toggle('is-active', candidate === link);
        }
        options.generalPanel.hidden = projectId !== null;
        options.projectPanel.hidden = projectId === null;
        if (projectId === null) {
            options.projectPanel.removeAttribute('aria-labelledby');
            options.onGeneralSelected();
            return;
        }
        options.projectPanel.setAttribute('aria-labelledby', link.id);
        state = markChatChannelRead(state, projectId);
        renderUnread(projectId);
        persistState();
        const project = projects.find((candidate) => candidate.id === projectId);
        if (project !== undefined)
            options.onProjectSelected(project);
    }
    function createProjectLink(project) {
        const entry = doc.createElement('span');
        entry.className = 'lounge-channel-entry';
        const link = doc.createElement('a');
        link.id = `lounge-project-link-${project.id}`;
        link.className = 'lounge-channel-link';
        link.href = `#${options.projectPanel.id}`;
        link.dataset.projectId = String(project.id);
        const title = doc.createElement('span');
        title.className = 'lounge-channel-link-title';
        const prefix = doc.createElement('span');
        prefix.setAttribute('aria-hidden', 'true');
        prefix.textContent = '#';
        const label = doc.createElement('span');
        label.className = 'lounge-channel-link-label';
        label.textContent = project.name;
        const unread = doc.createElement('span');
        unread.className = 'lounge-channel-unread';
        unread.hidden = true;
        title.append(prefix, label);
        link.append(title);
        entry.append(link, unread);
        return { entry, link };
    }
    function renderUnread(projectId) {
        const link = projectLinks.get(projectId);
        const entry = projectEntries.get(projectId);
        if (link === undefined || entry === undefined)
            return;
        const unread = entry.querySelector('.lounge-channel-unread');
        if (unread === null)
            return;
        const count = state.unreadByProject[projectId] ?? 0;
        unread.hidden = count === 0;
        unread.textContent = `(${count > 99 ? '99+' : count})`;
        const project = projects.find((candidate) => candidate.id === projectId);
        link.setAttribute('aria-label', count === 0 || project === undefined
            ? project?.name ?? 'Project channel'
            : `${project.name}, ${count} unread ${count === 1 ? 'message' : 'messages'}`);
    }
    function renderLinks() {
        for (const entry of projectEntries.values())
            entry.remove();
        projectLinks.clear();
        projectEntries.clear();
        for (const project of projects.filter((candidate) => candidate.status === 'active')) {
            const { entry, link } = createProjectLink(project);
            projectLinks.set(project.id, link);
            projectEntries.set(project.id, entry);
            options.links.append(entry);
            renderUnread(project.id);
        }
    }
    function schedulePoll(delay = pollDelay) {
        if (!active || !options.isVisible() || !shouldUsePolling(options.realtime))
            return;
        if (timer !== null)
            window.clearTimeout(timer);
        timer = window.setTimeout(() => {
            timer = null;
            if (active)
                void pollEvents();
        }, delay);
    }
    async function fetchEvents(cursor) {
        const headers = new Headers();
        if (etag !== null)
            headers.set('If-None-Match', etag);
        const response = await fetcher(`${apiBaseUrl}/events?cursor=${cursor}`, {
            headers,
            credentials: 'same-origin',
        });
        if (response.status === 304)
            return { events: [], etag: response.headers.get('ETag') ?? etag };
        const payload = await response.json();
        if (!response.ok) {
            throw new ApiFailure(payload.error?.message ?? 'Could not check project chat activity.', response.status);
        }
        return { events: payload.events ?? [], etag: response.headers.get('ETag') };
    }
    async function establishInitialCursor() {
        if (hasSavedState)
            return;
        const initial = await fetchEvents(0);
        if (!active)
            return;
        state = { cursor: latestChatFeedCursor(initial.etag, initial.events), unreadByProject: {} };
        etag = initial.etag;
        persistState();
        feedInitialized = true;
    }
    async function initializeFeed() {
        await initialFeedPromise;
        if (!active)
            return;
        await pollEvents();
    }
    async function pollEvents() {
        if (!active || !projectsLoaded || !feedInitialized || !options.isVisible())
            return;
        if (timer !== null)
            window.clearTimeout(timer);
        timer = null;
        if (options.isDocumentHidden()) {
            pollDelay = Math.min(MAX_POLL_DELAY_MS, Math.max(5000, pollDelay * 1.5));
            schedulePoll();
            return;
        }
        const userId = options.getUserId();
        if (userId === null)
            return;
        try {
            const result = await fetchEvents(state.cursor);
            if (!active)
                return;
            etag = result.etag;
            if (result.events.length > 0) {
                const allowedProjectIds = new Set(projects.map((project) => project.id));
                state = addUnreadChatEvents(state, result.events.filter((event) => allowedProjectIds.has(event.project_id)), selectedId, userId);
                for (const projectId of projectLinks.keys())
                    renderUnread(projectId);
                persistState();
            }
            pollDelay = result.events.length >= 100 ? 0 : result.events.length > 0
                ? 1000 : Math.min(MAX_POLL_DELAY_MS, pollDelay * 1.5);
        }
        catch (error) {
            if (!active)
                return;
            if (error instanceof ApiFailure && error.status === 401) {
                options.onUnauthorized();
                return;
            }
            options.report(error instanceof Error ? error.message : 'Could not check project chat activity.', true);
            pollDelay = Math.min(MAX_POLL_DELAY_MS, pollDelay * 1.5);
        }
        if (active)
            schedulePoll();
    }
    async function loadProjects() {
        try {
            const result = await request('/projects');
            if (!active)
                return;
            projects = result.projects;
            renderLinks();
            projectsLoaded = true;
            for (const projectId of Object.keys(state.unreadByProject)) {
                if (!projectLinks.has(Number(projectId)))
                    delete state.unreadByProject[Number(projectId)];
            }
            for (const projectId of projectLinks.keys())
                renderUnread(projectId);
            persistState();
            await initializeFeed();
        }
        catch (error) {
            if (!active)
                return;
            if (error instanceof ApiFailure && error.status === 401) {
                options.onUnauthorized();
                return;
            }
            options.report(error instanceof Error ? error.message : 'Could not load project channels.', true);
        }
    }
    function selectGeneral() {
        setSelectedChannel(options.generalLink, null);
    }
    function stop() {
        active = false;
        if (timer !== null)
            window.clearTimeout(timer);
        timer = null;
        etag = null;
        pollDelay = 1000;
        selectedId = null;
        projects = [];
        projectsLoaded = false;
        feedInitialized = false;
        for (const entry of projectEntries.values())
            entry.remove();
        projectLinks.clear();
        projectEntries.clear();
        options.generalLink.setAttribute('aria-current', 'page');
        options.generalLink.classList.add('is-active');
        options.generalPanel.hidden = false;
        options.projectPanel.hidden = true;
        options.projectPanel.removeAttribute('aria-labelledby');
    }
    options.links.addEventListener('click', (event) => {
        if (!(event.target instanceof Element))
            return;
        const link = event.target.closest('a');
        if (link === null)
            return;
        if (link === options.generalLink) {
            event.preventDefault();
            selectGeneral();
            return;
        }
        const projectId = Number(link.dataset.projectId);
        if (!Number.isSafeInteger(projectId))
            return;
        event.preventDefault();
        setSelectedChannel(link, projectId);
    }, { signal: listeners.signal });
    const unbindRealtime = bindRealtimePolling({
        realtime: options.realtime,
        isActive: () => active && options.isVisible(),
        pausePolling: () => {
            if (timer !== null)
                window.clearTimeout(timer);
            timer = null;
        },
        resumePolling: () => schedulePoll(0),
        refresh: () => { void pollEvents(); },
    });
    return {
        load: () => {
            stop();
            active = true;
            pollDelay = 1000;
            const workspaceId = options.getWorkspaceId();
            const userId = options.getUserId();
            stateKey = workspaceId === null || userId === null
                ? null : `tangent:lounge-channels:${workspaceId}:${userId}`;
            const parsedState = parseLoungeChannelUnreadState(readSavedState());
            hasSavedState = parsedState !== null;
            state = parsedState ?? { cursor: 0, unreadByProject: {} };
            projectsLoaded = false;
            feedInitialized = hasSavedState;
            initialFeedPromise = establishInitialCursor();
            selectGeneral();
            void loadProjects();
        },
        stop,
        selectedProjectId: () => selectedId,
        selectedProject: () => projects.find((project) => project.id === selectedId) ?? null,
        dispose: () => {
            stop();
            listeners.abort();
            unbindRealtime();
        },
    };
}
