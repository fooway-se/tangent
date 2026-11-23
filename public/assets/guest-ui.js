import { ApiFailure, api } from './api.js';
import { renderClientEmptyState, renderClientView } from './guest-view.js';
export function initGuestUi(options) {
    const doc = options.doc ?? document;
    const request = options.request ?? api;
    const renderView = options.renderView ?? renderClientView;
    const renderEmptyState = options.renderEmptyState ?? renderClientEmptyState;
    const guestShell = doc.querySelector('#guest-shell');
    const guestStatus = doc.querySelector('#guest-status');
    const guestMain = doc.querySelector('#guest-main');
    const guestTitle = doc.querySelector('#guest-title');
    const guestUser = doc.querySelector('#guest-user');
    const guestCap = doc.querySelector('#guest-cap');
    const guestProjectLabel = doc.querySelector('#guest-project-label');
    const guestProjectSelect = doc.querySelector('#guest-project-select');
    const guestPreviewMemberLabel = doc.querySelector('#guest-preview-member-label');
    const guestPreviewMemberSelect = doc.querySelector('#guest-preview-member-select');
    const guestPreviewReturnButton = doc.querySelector('#guest-preview-return-button');
    const listeners = new AbortController();
    let previewActive = false;
    let previewReturnFocus = null;
    let previewProjectId = null;
    let previewMembers = [];
    let viewRequestVersion = 0;
    let guestModeVersion = 0;
    function resetPreviewState() {
        previewActive = false;
        previewReturnFocus = null;
        previewProjectId = null;
        previewMembers = [];
    }
    function reset() {
        guestModeVersion += 1;
        viewRequestVersion += 1;
        resetPreviewState();
        guestShell.hidden = true;
        guestPreviewMemberLabel.hidden = true;
        guestPreviewMemberSelect.replaceChildren();
        guestPreviewReturnButton.hidden = true;
        guestProjectLabel.hidden = true;
        guestProjectSelect.replaceChildren();
        guestCap.textContent = 'Read-only · guest';
        guestUser.textContent = '';
        guestStatus.textContent = '';
        guestStatus.classList.remove('error');
    }
    async function showGuestShell(user) {
        guestModeVersion += 1;
        resetPreviewState();
        guestPreviewMemberLabel.hidden = true;
        guestPreviewReturnButton.hidden = true;
        guestCap.textContent = 'Read-only · guest';
        guestStatus.textContent = 'Loading projects…';
        guestStatus.classList.remove('error');
        guestUser.textContent = user.email;
        guestShell.hidden = false;
        options.onGuestMode();
        await loadGuestProjects(guestModeVersion);
    }
    async function openPreview() {
        const user = options.getUser();
        const project = options.getProject();
        if (user?.role !== 'admin' || project === null)
            return;
        guestModeVersion += 1;
        const activeElement = doc.activeElement;
        previewReturnFocus = activeElement instanceof HTMLElement && activeElement !== doc.body
            ? activeElement
            : options.getProjectHeading();
        previewActive = true;
        previewProjectId = project.id;
        previewMembers = options.getProjectMembers().filter((member) => member.role === 'guest' && member.is_active !== false && member.is_active !== 0);
        guestPreviewMemberSelect.replaceChildren(...previewMembers.map((member) => new Option(`${member.name} · ${member.email}`, String(member.id))));
        guestPreviewMemberLabel.hidden = previewMembers.length < 2;
        guestPreviewMemberSelect.value = previewMembers[0] === undefined ? '' : String(previewMembers[0].id);
        guestProjectSelect.replaceChildren();
        guestProjectLabel.hidden = true;
        guestTitle.textContent = 'Client portal';
        guestCap.textContent = 'Admin preview · read-only';
        guestUser.textContent = previewMembers[0]?.email ?? 'No guest access';
        guestStatus.classList.remove('error');
        guestStatus.textContent = previewMembers.length === 0
            ? 'No guest currently has access to this project.'
            : '';
        guestPreviewReturnButton.hidden = false;
        guestShell.hidden = false;
        options.onPreviewOpened();
        guestPreviewReturnButton.focus();
        await loadClientView(project.id, true, previewMembers[0]?.id ?? 0);
    }
    function closePreview() {
        if (!previewActive)
            return;
        const returnFocus = previewReturnFocus ?? options.getProjectHeading();
        resetPreviewState();
        guestModeVersion += 1;
        viewRequestVersion += 1;
        guestPreviewMemberSelect.replaceChildren();
        guestPreviewMemberLabel.hidden = true;
        guestProjectSelect.replaceChildren();
        guestProjectLabel.hidden = true;
        guestCap.textContent = 'Read-only · guest';
        guestUser.textContent = '';
        guestStatus.textContent = '';
        guestStatus.classList.remove('error');
        guestPreviewReturnButton.hidden = true;
        guestShell.hidden = true;
        options.onPreviewClosed();
        returnFocus.focus();
    }
    async function loadGuestProjects(requestVersion) {
        try {
            const result = await request('/projects');
            if (requestVersion !== guestModeVersion || previewActive)
                return;
            guestStatus.textContent = '';
            guestProjectSelect.replaceChildren(...result.projects.map((project) => {
                const option = doc.createElement('option');
                option.value = String(project.id);
                option.textContent = project.name;
                return option;
            }));
            guestProjectLabel.hidden = result.projects.length < 2;
            if (result.projects.length === 0) {
                renderEmptyState(guestMain, 'No projects have been shared with you yet.');
                return;
            }
            await loadClientView(result.projects[0].id);
        }
        catch (error) {
            if (requestVersion !== guestModeVersion)
                return;
            if (error instanceof ApiFailure && error.status === 401) {
                options.onUnauthorized();
                return;
            }
            guestStatus.textContent = 'Could not load projects.';
            options.report(error instanceof Error ? error.message : 'Could not load your projects.', true);
        }
    }
    async function loadClientView(projectId, previewMode = false, viewerUserId = options.getUser()?.id ?? 0) {
        const requestVersion = ++viewRequestVersion;
        if (!previewMode)
            guestStatus.textContent = 'Loading project…';
        try {
            const view = await request(`/projects/${projectId}/client-view`);
            if (requestVersion !== viewRequestVersion || (previewMode && !previewActive))
                return;
            if (!previewMode)
                guestStatus.textContent = '';
            guestTitle.textContent = 'Client portal';
            renderView(guestMain, view, {
                userId: viewerUserId,
                approve: async (approvalId) => {
                    if (previewMode)
                        return;
                    await request(`/approvals/${approvalId}/approve`, { method: 'POST' });
                    await loadClientView(projectId);
                },
                comment: async (body) => {
                    if (previewMode)
                        return;
                    await request(`/projects/${projectId}/client-comments`, { method: 'POST', body: JSON.stringify({ body }) });
                    await loadClientView(projectId);
                },
            }, { previewMode });
        }
        catch (error) {
            if (requestVersion !== viewRequestVersion || (previewMode && !previewActive))
                return;
            if (error instanceof ApiFailure && error.status === 401) {
                options.onUnauthorized();
                return;
            }
            if (!previewMode)
                guestStatus.textContent = 'Could not load the project view.';
            options.report(error instanceof Error ? error.message : 'Could not load the client view.', true);
        }
    }
    guestProjectSelect.addEventListener('change', () => {
        if (!previewActive)
            void loadClientView(Number(guestProjectSelect.value));
    }, { signal: listeners.signal });
    guestPreviewMemberSelect.addEventListener('change', () => {
        if (!previewActive || previewProjectId === null)
            return;
        const viewer = previewMembers.find((member) => member.id === Number(guestPreviewMemberSelect.value));
        if (viewer === undefined)
            return;
        guestUser.textContent = viewer.email;
        void loadClientView(previewProjectId, true, viewer.id);
    }, { signal: listeners.signal });
    guestPreviewReturnButton.addEventListener('click', closePreview, { signal: listeners.signal });
    return {
        showGuestShell,
        openPreview,
        closePreview,
        reset,
        isPreviewActive: () => previewActive,
        isShellVisible: () => !guestShell.hidden,
        setStatus: (message, isError = false) => {
            guestStatus.textContent = message;
            guestStatus.classList.toggle('error', isError);
        },
        dispose: () => listeners.abort(),
    };
}
