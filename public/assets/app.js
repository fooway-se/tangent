import { resolveShortcut, shouldSubmitOnEnter } from './shortcuts.js';
import { filterIssues, groupIssues, sortIssues, } from './issue-board.js';
class ApiFailure extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}
const loginPanel = document.querySelector('#login-panel');
const loginShell = document.querySelector('#login-shell');
const workspacePanel = document.querySelector('#workspace-panel');
const accountBar = document.querySelector('#account-bar');
const currentUserLabel = document.querySelector('#current-user');
const workspaceNav = document.querySelector('#workspace-nav');
const workspaceSwitcher = document.querySelector('#workspace-switcher');
const createWorkspaceForm = document.querySelector('#create-workspace-form');
const breadcrumbProjectsButton = document.querySelector('#breadcrumb-projects');
const breadcrumbDivider = document.querySelector('#breadcrumb-divider');
const breadcrumbCurrent = document.querySelector('#breadcrumb-current');
const projectsNavButton = document.querySelector('#projects-nav');
const adminNavButton = document.querySelector('#admin-nav');
const projectsView = document.querySelector('#projects-view');
const projectView = document.querySelector('#project-view');
const adminView = document.querySelector('#admin-view');
const adminHeading = document.querySelector('#admin-heading');
const projectForm = document.querySelector('#project-form');
const toggleProjectFormButton = document.querySelector('#toggle-project-form');
const cancelProjectFormButton = document.querySelector('#cancel-project-form');
const developerForm = document.querySelector('#developer-form');
const loginForm = document.querySelector('#login-form');
const projectList = document.querySelector('#project-list');
const emptyProjects = document.querySelector('#empty-projects');
const projectFormPanel = document.querySelector('#project-form-panel');
const projectDescription = document.querySelector('#project-description');
const projectState = document.querySelector('#project-state');
const chatView = document.querySelector('#chat-view');
const projectChatColumn = document.querySelector('#project-chat-column');
const projectSidebarList = document.querySelector('#project-sidebar-list');
const issuesView = document.querySelector('#issues-view');
const membersView = document.querySelector('#members-view');
const issueDetailView = document.querySelector('#issue-detail-view');
const issueDetailDisplay = document.querySelector('#issue-detail-display');
const issueDetailTitle = document.querySelector('#issue-detail-title');
const issueDetailDescription = document.querySelector('#issue-detail-description');
const issueDetailStatus = document.querySelector('#issue-detail-status');
const issueSourceLink = document.querySelector('#issue-source-link');
const issueDetailEditForm = document.querySelector('#issue-detail-edit-form');
const issueDetailTitleInput = document.querySelector('#issue-detail-title-input');
const issueDetailDescriptionInput = document.querySelector('#issue-detail-description-input');
const issueDetailEditButton = document.querySelector('#issue-detail-edit-button');
const issueDetailSaveButton = document.querySelector('#issue-detail-save-button');
const keyboardHints = document.querySelector('#keyboard-hints');
const projectKeyboardHints = document.querySelector('#project-keyboard-hints');
const goPrefixHint = document.querySelector('#go-prefix-hint');
const commandPalette = document.querySelector('#command-palette');
const commandPaletteClose = document.querySelector('#command-palette-close');
const commandSearch = document.querySelector('#command-search');
const commandResults = document.querySelector('#command-results');
const shortcutHelp = document.querySelector('#shortcut-help');
const shortcutHelpClose = document.querySelector('#shortcut-help-close');
const membersTabButton = document.querySelector('#members-tab');
const issuesTabButton = document.querySelector('#issues-tab');
const issueBackButton = document.querySelector('#issue-back-button');
const issueDetailCancelButton = document.querySelector('#issue-detail-cancel-button');
const issueForm = document.querySelector('#issue-form');
const issueQuickAddTitle = document.querySelector('#issue-quick-add-title');
const issueDescriptionDetails = document.querySelector('#issue-description-details');
const issueProgress = document.querySelector('#issue-progress');
const issueProgressLabel = document.querySelector('#issue-progress-label');
const issueFilter = document.querySelector('#issue-filter');
const issueOrder = document.querySelector('#issue-order');
const issueCountSummary = document.querySelector('#issue-count-summary');
const issueList = document.querySelector('#issue-list');
const emptyIssues = document.querySelector('#empty-issues');
const memberList = document.querySelector('#member-list');
const memberForm = document.querySelector('#member-form');
const memberSelect = document.querySelector('#member-select');
const addMemberButton = document.querySelector('#add-member-button');
const statusMessage = document.querySelector('#status-message');
const loginStatusMessage = document.querySelector('#login-status-message');
const logoutButton = document.querySelector('#logout-button');
let activeUser = null;
let activeWorkspaces = [];
let activeProject = null;
let projectReturnFocusId = null;
const workspaceViewHistory = [];
let activeProjectMembers = [];
let projectIssues = [];
let selectedIssue = null;
let activeChatProjectId = null;
let chatPollTimer = null;
let chatCursor = 0;
let chatEtag = null;
let chatPollDelay = 1000;
let chatMessageList = null;
let chatEmptyState = null;
let chatInput = null;
let selectedChatMessageId = null;
const chatMessagesById = new Map();
let chatReplyHint = null;
let chatCancelReply = null;
let chatReplyParent = null;
let issueQuickAddEscapePending = false;
let issueQuickAddReturnFocus = null;
let goPrefixPending = false;
let goPrefixTimer = null;
let statusMessageTimer = null;
let paletteCommands = [];
let visiblePaletteCommands = [];
let activePaletteCommandIndex = 0;
async function api(path, init = {}) {
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = new Headers(init.headers);
    if (init.body !== undefined && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && path !== '/auth/login') {
        const csrf = cookie('tangent_csrf');
        if (csrf !== null)
            headers.set('X-CSRF-Token', csrf);
    }
    const response = await fetch(`/api/v1${path}`, {
        ...init,
        method,
        headers,
        credentials: 'same-origin',
    });
    if (response.status === 204)
        return undefined;
    const payload = await response.json();
    if (!response.ok) {
        throw new ApiFailure(payload.error?.message ?? 'The request could not be completed.', response.status);
    }
    return payload;
}
function cookie(name) {
    const entry = document.cookie.split(';').map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
    return entry === undefined ? null : decodeURIComponent(entry.slice(name.length + 1));
}
function report(message, isError = false) {
    if (statusMessageTimer !== null)
        window.clearTimeout(statusMessageTimer);
    statusMessageTimer = null;
    const target = workspacePanel.hidden ? loginStatusMessage : statusMessage;
    target.replaceChildren();
    target.classList.toggle('error', isError);
    if (message === '')
        return;
    const text = document.createElement('span');
    text.className = 'status-message-text';
    text.textContent = message;
    target.append(text);
    if (isError) {
        const dismiss = document.createElement('button');
        dismiss.className = 'status-message-dismiss';
        dismiss.type = 'button';
        dismiss.setAttribute('aria-label', 'Dismiss notification');
        dismiss.textContent = '×';
        dismiss.addEventListener('click', () => report(''));
        target.append(dismiss);
    }
    else {
        statusMessageTimer = window.setTimeout(() => {
            if (target.contains(text)) {
                target.replaceChildren();
                target.classList.remove('error');
            }
            statusMessageTimer = null;
        }, 4_000);
    }
}
function showSignedOut() {
    workspaceViewHistory.length = 0;
    projectReturnFocusId = null;
    stopChatPolling();
    activeUser = null;
    activeProject = null;
    activeProjectMembers = [];
    selectedIssue = null;
    activeWorkspaces = [];
    workspaceSwitcher.replaceChildren();
    workspaceSwitcher.disabled = true;
    loginShell.hidden = false;
    loginPanel.hidden = false;
    workspacePanel.hidden = true;
    accountBar.hidden = true;
    keyboardHints.hidden = true;
    projectKeyboardHints.hidden = true;
    clearGoPrefix();
    document.body.classList.remove('is-project-view');
    projectList.replaceChildren();
    projectSidebarList.replaceChildren();
    issueList.replaceChildren();
    chatView.replaceChildren();
    report('');
}
function showSignedIn(user) {
    workspaceViewHistory.length = 0;
    projectReturnFocusId = null;
    activeProject = null;
    activeUser = user;
    loginShell.hidden = true;
    loginPanel.hidden = true;
    workspacePanel.hidden = false;
    accountBar.hidden = false;
    keyboardHints.hidden = false;
    currentUserLabel.textContent = `${user.name} · ${user.role}`;
    adminNavButton.hidden = user.role !== 'admin';
    toggleProjectFormButton.hidden = user.role !== 'admin';
    showWorkspaceView('projects');
    report('');
}
async function loadWorkspaces() {
    const result = await api('/workspaces');
    activeWorkspaces = result.workspaces;
    workspaceSwitcher.replaceChildren();
    for (const workspace of activeWorkspaces) {
        const option = document.createElement('option');
        option.value = String(workspace.id);
        option.textContent = workspace.name;
        workspaceSwitcher.append(option);
    }
    workspaceSwitcher.value = String(activeUser?.workspace_id ?? '');
    workspaceSwitcher.disabled = activeWorkspaces.length === 0;
}
async function switchWorkspace(workspaceId) {
    if (activeUser === null || workspaceId === activeUser.workspace_id)
        return;
    workspaceSwitcher.disabled = true;
    try {
        const result = await api(`/workspaces/${workspaceId}/switch`, {
            method: 'POST',
            body: JSON.stringify({}),
        });
        showSignedIn(result.user);
        await loadWorkspaces();
        await loadProjects();
        report(`Switched to ${result.workspace.name}.`);
    }
    catch (error) {
        workspaceSwitcher.value = String(activeUser?.workspace_id ?? '');
        report(error instanceof Error ? error.message : 'Could not switch workspace.', true);
    }
    finally {
        workspaceSwitcher.disabled = activeWorkspaces.length === 0;
    }
}
function showWorkspaceView(view) {
    if (view !== 'project') {
        if (activeProject !== null)
            projectReturnFocusId = activeProject.id;
        stopChatPolling();
        activeProject = null;
        activeProjectMembers = [];
        selectedIssue = null;
        issueDetailEditForm.hidden = true;
        issueDetailDisplay.hidden = false;
    }
    projectsView.hidden = view !== 'projects';
    adminView.hidden = view !== 'admin';
    projectView.hidden = view !== 'project';
    projectChatColumn.hidden = view !== 'project';
    workspaceNav.hidden = false;
    keyboardHints.hidden = false;
    projectKeyboardHints.hidden = view !== 'project';
    breadcrumbProjectsButton.hidden = view === 'projects';
    breadcrumbDivider.hidden = view === 'projects';
    breadcrumbCurrent.textContent = view === 'project'
        ? activeProject?.name ?? 'Project'
        : view === 'admin' ? 'Administration' : 'Projects';
    document.body.classList.toggle('is-project-view', view === 'project');
    projectsNavButton.classList.toggle('is-active', view === 'projects');
    adminNavButton.classList.toggle('is-active', view === 'admin');
    projectSidebarList.querySelectorAll('.project-sidebar-link').forEach((button) => {
        button.classList.toggle('is-active', view === 'project' && button.dataset.projectId === String(activeProject?.id));
    });
    if (view === 'projects') {
        projectsNavButton.setAttribute('aria-current', 'page');
        adminNavButton.removeAttribute('aria-current');
    }
    else if (view === 'admin') {
        adminNavButton.setAttribute('aria-current', 'page');
        projectsNavButton.removeAttribute('aria-current');
    }
    else {
        projectsNavButton.removeAttribute('aria-current');
        adminNavButton.removeAttribute('aria-current');
    }
    if (view === 'projects' && projectReturnFocusId !== null) {
        const projectId = projectReturnFocusId;
        projectReturnFocusId = null;
        if (!focusProjectOpenButton(projectId))
            projectsNavButton.focus();
    }
}
function openWorkspaceAdmin() {
    const currentLocation = currentWorkspaceLocation();
    if (currentLocation.view !== 'admin')
        workspaceViewHistory.push(currentLocation);
    showWorkspaceView('admin');
    adminHeading.focus();
}
function currentWorkspaceLocation() {
    if (!projectView.hidden && activeProject !== null) {
        return {
            view: 'project',
            projectId: activeProject.id,
            tab: membersView.hidden ? 'issues' : 'members',
        };
    }
    if (!adminView.hidden)
        return { view: 'admin' };
    const focused = document.activeElement;
    const projectCard = focused instanceof HTMLElement ? focused.closest('.project-card') : null;
    const focusedProjectId = Number(projectCard?.dataset.projectId);
    if (Number.isSafeInteger(focusedProjectId) && focusedProjectId > 0) {
        return { view: 'projects', focusedProjectId };
    }
    return { view: 'projects' };
}
function sameWorkspaceLocation(left, right) {
    if (left.view !== right.view)
        return false;
    if (left.view === 'project' && right.view === 'project') {
        return left.projectId === right.projectId && left.tab === right.tab;
    }
    if (left.view === 'projects' && right.view === 'projects') {
        return left.focusedProjectId === right.focusedProjectId;
    }
    return left.view === right.view;
}
function goToProjects() {
    workspaceViewHistory.length = 0;
    showWorkspaceView('projects');
}
function goBackWorkspaceView() {
    const currentLocation = currentWorkspaceLocation();
    if (currentLocation.view === 'projects')
        return;
    const previousLocation = workspaceViewHistory.pop();
    if (previousLocation?.view === 'project') {
        void loadProjectDetail(previousLocation.projectId, previousLocation.tab, false);
    }
    else if (previousLocation?.view === 'admin') {
        showWorkspaceView('admin');
        adminHeading.focus();
    }
    else {
        showWorkspaceView('projects');
        if (previousLocation?.view === 'projects' && previousLocation.focusedProjectId !== undefined
            && focusProjectOpenButton(previousLocation.focusedProjectId))
            return;
        projectsNavButton.focus();
    }
}
function stopChatPolling() {
    activeChatProjectId = null;
    if (chatPollTimer !== null)
        window.clearTimeout(chatPollTimer);
    chatPollTimer = null;
    chatMessageList = null;
    chatEmptyState = null;
    chatInput = null;
    chatReplyHint = null;
    chatCancelReply = null;
    chatReplyParent = null;
    selectedChatMessageId = null;
    chatMessagesById.clear();
}
function selectedProjectButton() {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement) {
        const focusedCard = focused.closest('.project-card');
        if (focusedCard !== null)
            return focusedCard.querySelector('button');
    }
    return projectList.querySelector('.project-card.is-keyboard-selected button');
}
function focusProjectOpenButton(projectId) {
    const button = projectList.querySelector(`.project-card[data-project-id="${projectId}"] button`);
    if (button === null)
        return false;
    button.focus();
    return true;
}
function selectedIssueButton() {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement) {
        const focusedRow = focused.closest('.issue-card');
        if (focusedRow !== null && focusedRow.closest('.issue-group')?.open !== false) {
            return focusedRow.querySelector('.issue-title-button');
        }
    }
    return Array.from(issueList.querySelectorAll('.issue-card.is-keyboard-selected .issue-title-button'))
        .find((button) => button.closest('.issue-group')?.open !== false) ?? null;
}
function visibleIssueTitleButtons() {
    return Array.from(issueList.querySelectorAll('.issue-title-button'))
        .filter((button) => button.closest('.issue-group')?.open !== false);
}
function hasSelectedIssueInVisibleView() {
    return !projectView.hidden && (!issuesView.hidden || !issueDetailView.hidden)
        && (selectedIssue !== null || selectedIssueButton() !== null);
}
function latestChatIssueButton() {
    if (chatMessageList === null)
        return null;
    const messages = Array.from(chatMessageList.querySelectorAll('.chat-message'))
        .filter((message) => Number(message.dataset.messageId) > 0);
    return messages.at(-1)?.querySelector('.chat-create-issue-button:not(:disabled)') ?? null;
}
function chatMessageElements() {
    if (chatMessageList === null)
        return [];
    return Array.from(chatMessageList.querySelectorAll('.chat-message'))
        .filter((message) => Number(message.dataset.messageId) > 0);
}
function selectChatMessage(id, focus = true) {
    const item = chatMessageList?.querySelector(`.chat-message[data-message-id="${id}"]`);
    if (item === null || item === undefined)
        return;
    selectedChatMessageId = id;
    chatMessageList?.querySelectorAll('.chat-message').forEach((message) => {
        message.classList.toggle('is-keyboard-selected', message === item);
    });
    if (focus)
        item.focus();
}
function moveChatMessageSelection(direction) {
    const messages = chatMessageElements();
    if (messages.length === 0) {
        chatInput?.focus();
        return;
    }
    const currentIndex = messages.findIndex((message) => Number(message.dataset.messageId) === selectedChatMessageId);
    const nextIndex = currentIndex < 0
        ? direction > 0 ? 0 : messages.length - 1
        : Math.max(0, Math.min(messages.length - 1, currentIndex + direction));
    const next = messages[nextIndex];
    if (next !== undefined)
        selectChatMessage(Number(next.dataset.messageId));
}
function focusProjectChat() {
    const messages = chatMessageElements();
    const latest = messages.at(-1);
    if (latest !== undefined) {
        selectChatMessage(Number(latest.dataset.messageId));
    }
    else {
        chatInput?.focus();
    }
}
function replyToSelectedChatMessage() {
    if (selectedChatMessageId === null || selectedChatMessageId <= 0)
        return;
    const message = chatMessagesById.get(selectedChatMessageId);
    if (message !== undefined)
        setChatReplyParent(message);
}
function createIssueFromSelectedChatMessage() {
    if (selectedChatMessageId !== null) {
        const selectedButton = chatMessageList
            ?.querySelector(`.chat-message[data-message-id="${selectedChatMessageId}"]`)
            ?.querySelector('.chat-create-issue-button:not(:disabled)');
        if (selectedButton !== null && selectedButton !== undefined) {
            selectedButton.click();
            return;
        }
    }
    createIssueFromLatestMessage();
}
function goToProjectIssues() {
    if (activeProject === null)
        return;
    selectedIssue = null;
    issueDetailEditForm.hidden = true;
    issueDetailDisplay.hidden = false;
    switchProjectTab('issues');
    issuesTabButton.focus();
}
function goToProjectMembers() {
    if (activeProject === null)
        return;
    switchProjectTab('members');
    membersTabButton.focus();
}
function isEditableTarget(target) {
    if (!(target instanceof HTMLElement))
        return false;
    return target.isContentEditable || target.closest('summary') !== null
        || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
function isTextInputTarget(target) {
    if (!(target instanceof HTMLElement))
        return false;
    if (target.isContentEditable || target.closest('[contenteditable="true"]') !== null)
        return true;
    if (target instanceof HTMLTextAreaElement)
        return true;
    if (!(target instanceof HTMLInputElement))
        return false;
    return ['email', 'number', 'password', 'search', 'tel', 'text', 'url'].includes(target.type);
}
function shouldBlurOnEscape(target) {
    return target instanceof HTMLSelectElement || isTextInputTarget(target);
}
function shortcutContext(target) {
    return {
        targetIsEditable: isEditableTarget(target),
        goPrefixPending,
        hasWorkspace: activeUser !== null,
        canAdmin: activeUser?.role === 'admin',
        hasProject: activeProject !== null && !projectView.hidden,
        projectListVisible: !workspacePanel.hidden && !projectsView.hidden,
        hasSelectedProject: selectedProjectButton() !== null,
        issueListVisible: !projectView.hidden && !issuesView.hidden,
        issueDetailVisible: !projectView.hidden && !issueDetailView.hidden,
        hasSelectedIssue: hasSelectedIssueInVisibleView(),
        hasLatestChatMessage: latestChatIssueButton() !== null,
        chatMessagesFocused: document.activeElement instanceof HTMLElement
            && document.activeElement.matches('.chat-message'),
        hasSelectedChatMessage: selectedChatMessageId !== null && selectedChatMessageId > 0
            && chatMessagesById.has(selectedChatMessageId),
        textInputFocused: shouldBlurOnEscape(target),
        modalOpen: commandPalette.open || shortcutHelp.open,
        canDismiss: commandPalette.open || shortcutHelp.open || (!workspacePanel.hidden && ((!projectView.hidden && (!issueDetailView.hidden || !issueDetailEditForm.hidden
            || issueQuickAddEscapePending || chatReplyParent !== null))
            || (!projectsView.hidden && !projectFormPanel.hidden)
            || !projectView.hidden || !adminView.hidden)),
    };
}
function clearGoPrefix() {
    goPrefixPending = false;
    goPrefixHint.hidden = true;
    if (goPrefixTimer !== null)
        window.clearTimeout(goPrefixTimer);
    goPrefixTimer = null;
}
function startGoPrefix() {
    clearGoPrefix();
    goPrefixPending = true;
    goPrefixHint.hidden = false;
    goPrefixTimer = window.setTimeout(clearGoPrefix, 1200);
}
function moveFocusWithin(buttons, rowSelector, direction) {
    if (buttons.length === 0)
        return;
    const focused = document.activeElement;
    const currentIndex = buttons.findIndex((button) => {
        const row = button.closest(rowSelector);
        return row?.classList.contains('is-keyboard-selected') === true || (focused instanceof HTMLElement && row?.contains(focused) === true);
    });
    const nextIndex = currentIndex < 0
        ? direction > 0 ? 0 : buttons.length - 1
        : Math.max(0, Math.min(buttons.length - 1, currentIndex + direction));
    for (const button of buttons)
        button.closest(rowSelector)?.classList.remove('is-keyboard-selected');
    const next = buttons[nextIndex];
    next.closest(rowSelector)?.classList.add('is-keyboard-selected');
    next.focus();
}
function moveIssueSelection(direction) {
    const buttons = visibleIssueTitleButtons();
    if (!issueDetailView.hidden && selectedIssue !== null) {
        const currentIndex = buttons.findIndex((button) => button.closest('.issue-card')?.dataset.issueId === String(selectedIssue?.id));
        const nextIndex = currentIndex < 0
            ? direction > 0 ? 0 : buttons.length - 1
            : Math.max(0, Math.min(buttons.length - 1, currentIndex + direction));
        const next = buttons[nextIndex];
        if (next !== undefined)
            next.click();
        return;
    }
    moveFocusWithin(buttons, '.issue-card', direction);
}
function moveProjectSelection(direction) {
    moveFocusWithin(Array.from(projectList.querySelectorAll('.project-card button')), '.project-card', direction);
}
function moveSelection(direction) {
    if (!projectsView.hidden) {
        moveProjectSelection(direction);
    }
    else if (!issuesView.hidden || !issueDetailView.hidden) {
        moveIssueSelection(direction);
    }
}
function beginCreateIssue() {
    if (activeProject === null)
        return;
    selectedIssue = null;
    switchProjectTab('issues');
    issueQuickAddTitle.focus();
}
function editSelectedIssue() {
    if (selectedIssue === null) {
        const button = selectedIssueButton();
        if (button === null)
            return;
        button.click();
    }
    issueDetailEditButton.click();
}
function focusSelectedIssueStatus() {
    if (selectedIssue !== null) {
        issueDetailStatus.focus();
        return;
    }
    selectedIssueButton()?.closest('.issue-card')?.querySelector('.issue-status')?.focus();
}
function createIssueFromLatestMessage() {
    latestChatIssueButton()?.click();
}
function getPaletteCommands() {
    const commands = [
        { label: 'Go to Projects', detail: 'Open the project list', shortcut: 'g p', run: goToProjects },
        { label: 'Switch workspace', detail: 'Focus the workspace selector', shortcut: 'g w', run: () => workspaceSwitcher.focus() },
        { label: 'Show keyboard shortcuts', detail: 'View key bindings', shortcut: '?', run: showShortcutHelp },
    ];
    for (const workspace of activeWorkspaces) {
        if (workspace.id === activeUser?.workspace_id)
            continue;
        commands.splice(1, 0, {
            label: `Switch to ${workspace.name}`,
            detail: `Open the ${workspace.name} client workspace`,
            shortcut: '',
            run: () => void switchWorkspace(workspace.id),
        });
    }
    if (activeUser?.role === 'admin' && !projectsView.hidden) {
        commands.unshift({
            label: 'New project',
            detail: 'Create a project in this workspace',
            shortcut: '',
            run: () => {
                if (projectFormPanel.hidden)
                    toggleProjectFormButton.click();
                else
                    projectForm.querySelector('input[name="name"]')?.focus();
            },
        });
    }
    if (activeUser?.role === 'admin') {
        commands.unshift({
            label: 'Create workspace',
            detail: 'Create a separate workspace for another client',
            shortcut: '',
            run: () => {
                openWorkspaceAdmin();
                createWorkspaceForm.querySelector('input[name="name"]')?.focus();
            },
        });
    }
    if (activeProject !== null) {
        commands.splice(1, 0, {
            label: 'Project issues',
            detail: `Focus issues in ${activeProject.name}`,
            shortcut: 'g i',
            run: goToProjectIssues,
        }, {
            label: 'Project chat',
            detail: 'Focus the latest project chat message or composer',
            shortcut: 'g c',
            run: focusProjectChat,
        }, {
            label: 'Project members',
            detail: `Focus members in ${activeProject.name}`,
            shortcut: 'g m',
            run: goToProjectMembers,
        });
        if (activeUser?.role === 'admin') {
            commands.splice(4, 0, {
                label: 'Workspace admin',
                detail: 'Open workspace administration',
                shortcut: 'g a',
                run: openWorkspaceAdmin,
            });
        }
        commands.splice(1, 0, {
            label: 'New issue',
            detail: `Create an issue in ${activeProject.name}`,
            shortcut: 'c',
            run: beginCreateIssue,
        });
        if (hasSelectedIssueInVisibleView()) {
            commands.splice(2, 0, {
                label: 'Edit selected issue',
                detail: 'Edit the title and description',
                shortcut: 'e',
                run: editSelectedIssue,
            }, {
                label: 'Change issue status',
                detail: 'Focus the status selector',
                shortcut: 's',
                run: focusSelectedIssueStatus,
            });
        }
        if (latestChatIssueButton() !== null) {
            commands.splice(1, 0, {
                label: 'Create issue from selected chat message',
                detail: 'Use the selected message, or the latest message',
                shortcut: 'i',
                run: createIssueFromSelectedChatMessage,
            });
        }
    }
    commands.push({
        label: 'Sign out',
        detail: 'Sign out of Tangent',
        shortcut: '',
        run: () => { void signOut(); },
    });
    return commands;
}
function renderCommandResults() {
    const query = commandSearch.value.trim().toLocaleLowerCase();
    visiblePaletteCommands = paletteCommands.filter((command) => `${command.label} ${command.detail}`.toLocaleLowerCase().includes(query));
    activePaletteCommandIndex = Math.min(activePaletteCommandIndex, Math.max(visiblePaletteCommands.length - 1, 0));
    commandResults.replaceChildren();
    if (visiblePaletteCommands.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'command-empty-state';
        empty.textContent = 'No matching commands.';
        commandResults.append(empty);
        return;
    }
    visiblePaletteCommands.forEach((command, index) => {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.className = 'command-item';
        button.classList.toggle('is-active', index === activePaletteCommandIndex);
        button.type = 'button';
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', String(index === activePaletteCommandIndex));
        button.addEventListener('click', () => runPaletteCommand(index));
        const label = document.createElement('span');
        label.textContent = command.label;
        const detail = document.createElement('span');
        detail.className = 'command-item-description';
        detail.textContent = command.detail;
        button.append(label, detail);
        if (command.shortcut !== '') {
            const shortcut = document.createElement('kbd');
            shortcut.textContent = command.shortcut;
            button.append(shortcut);
        }
        item.append(button);
        commandResults.append(item);
    });
}
function closeCommandPalette() {
    if (commandPalette.open)
        commandPalette.close();
}
function runPaletteCommand(index) {
    const command = visiblePaletteCommands[index];
    if (command === undefined)
        return;
    closeCommandPalette();
    command.run();
}
function openCommandPalette() {
    if (shortcutHelp.open)
        shortcutHelp.close();
    if (commandPalette.open) {
        closeCommandPalette();
        return;
    }
    paletteCommands = getPaletteCommands();
    commandSearch.value = '';
    activePaletteCommandIndex = 0;
    renderCommandResults();
    commandPalette.showModal();
    commandSearch.focus();
}
function showShortcutHelp() {
    if (commandPalette.open)
        closeCommandPalette();
    if (shortcutHelp.open) {
        shortcutHelp.close();
        return;
    }
    shortcutHelp.showModal();
    shortcutHelpClose.focus();
}
function dismissCurrentView() {
    if (commandPalette.open) {
        closeCommandPalette();
    }
    else if (shortcutHelp.open) {
        shortcutHelp.close();
    }
    else if (!workspacePanel.hidden && !projectView.hidden && !issueDetailEditForm.hidden) {
        issueDetailCancelButton.click();
    }
    else if (!workspacePanel.hidden && !projectView.hidden && !issueDetailView.hidden) {
        issueBackButton.click();
    }
    else if (!workspacePanel.hidden && !projectsView.hidden && !projectFormPanel.hidden) {
        cancelProjectFormButton.click();
    }
    else if (!workspacePanel.hidden && !projectView.hidden && issueQuickAddEscapePending) {
        issueForm.reset();
        issueDescriptionDetails.open = false;
        issueQuickAddEscapePending = false;
        focusIssueQuickAddReturnTarget();
    }
    else if (!workspacePanel.hidden && !projectView.hidden && chatReplyParent !== null) {
        clearChatReplyParent();
    }
    else if (!workspacePanel.hidden && (!projectView.hidden || !adminView.hidden)) {
        goBackWorkspaceView();
    }
}
function focusIssueQuickAddReturnTarget() {
    const target = issueQuickAddReturnFocus;
    const dialog = target?.closest('dialog') ?? null;
    if (target !== null && target.isConnected && target.closest('[hidden]') === null
        && (dialog === null || dialog.open)) {
        target.focus();
    }
    else {
        issuesTabButton.focus();
    }
}
function issueQuickAddHasDraft() {
    const description = issueForm.querySelector('textarea[name="description"]');
    return issueQuickAddTitle.value.trim() !== '' || (description?.value.trim() ?? '') !== '';
}
function closeProjectForm() {
    projectForm.reset();
    projectFormPanel.hidden = true;
    toggleProjectFormButton.focus();
}
function submitFormOnEnter(event, form) {
    if (!shouldSubmitOnEnter(event.key, event.shiftKey, event.isComposing))
        return;
    event.preventDefault();
    form.requestSubmit();
}
function blurTextInput() {
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement))
        return;
    focused.blur();
    if (issueForm.contains(focused)) {
        if (issueQuickAddHasDraft()) {
            issueQuickAddEscapePending = true;
        }
        else {
            issueQuickAddEscapePending = false;
            issueDescriptionDetails.open = false;
            focusIssueQuickAddReturnTarget();
        }
        return;
    }
    if (focused !== chatInput)
        return;
    const selected = selectedChatMessageId === null
        ? null
        : chatMessageList?.querySelector(`.chat-message[data-message-id="${selectedChatMessageId}"]`) ?? null;
    const latest = chatMessageElements().at(-1) ?? null;
    const target = selected ?? latest;
    if (target !== null) {
        const messageId = Number(target.dataset.messageId);
        if (messageId > 0)
            selectChatMessage(messageId);
        else
            target.focus();
    }
    else {
        projectChatColumn.querySelector('.chat-heading')?.focus();
    }
}
function executeShortcut(action) {
    switch (action) {
        case 'command-palette':
            openCommandPalette();
            break;
        case 'shortcut-help':
            showShortcutHelp();
            break;
        case 'await-projects-key':
            startGoPrefix();
            break;
        case 'projects':
            clearGoPrefix();
            goToProjects();
            break;
        case 'workspace-switcher':
            workspaceSwitcher.focus();
            break;
        case 'issues':
            goToProjectIssues();
            break;
        case 'chat':
            focusProjectChat();
            break;
        case 'members':
            goToProjectMembers();
            break;
        case 'workspace-admin':
            openWorkspaceAdmin();
            break;
        case 'next-project':
            moveProjectSelection(1);
            break;
        case 'previous-project':
            moveProjectSelection(-1);
            break;
        case 'open-selected-project':
            selectedProjectButton()?.click();
            break;
        case 'next':
            moveIssueSelection(1);
            break;
        case 'previous':
            moveIssueSelection(-1);
            break;
        case 'open-selected':
            selectedIssueButton()?.click();
            break;
        case 'create-issue':
            beginCreateIssue();
            break;
        case 'edit-selected':
            editSelectedIssue();
            break;
        case 'focus-status':
            focusSelectedIssueStatus();
            break;
        case 'issue-from-latest-message':
            createIssueFromLatestMessage();
            break;
        case 'next-chat-message':
            moveChatMessageSelection(1);
            break;
        case 'previous-chat-message':
            moveChatMessageSelection(-1);
            break;
        case 'focus-chat-composer':
            chatInput?.focus();
            break;
        case 'reply-to-chat-message':
            replyToSelectedChatMessage();
            break;
        case 'issue-from-selected-chat-message':
            createIssueFromSelectedChatMessage();
            break;
        case 'blur-text-input':
            blurTextInput();
            break;
        case 'dismiss':
            dismissCurrentView();
            break;
    }
}
function handleKeyboardShortcut(event) {
    if ((commandPalette.open || shortcutHelp.open)
        && event.key !== 'Escape'
        && !((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k'))
        return;
    const context = shortcutContext(event.target);
    const action = resolveShortcut(event, context);
    if (action === null) {
        if (goPrefixPending && !context.targetIsEditable)
            clearGoPrefix();
        return;
    }
    event.preventDefault();
    if (action !== 'await-projects-key' && action !== 'projects')
        clearGoPrefix();
    executeShortcut(action);
}
function movePaletteCommandSelection(direction) {
    if (visiblePaletteCommands.length === 0)
        return;
    activePaletteCommandIndex = (activePaletteCommandIndex + direction + visiblePaletteCommands.length) % visiblePaletteCommands.length;
    renderCommandResults();
    commandResults.querySelectorAll('.command-item')[activePaletteCommandIndex]?.focus();
}
commandSearch.addEventListener('input', () => {
    activePaletteCommandIndex = 0;
    renderCommandResults();
});
commandPalette.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        movePaletteCommandSelection(event.key === 'ArrowDown' ? 1 : -1);
    }
    else if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        runPaletteCommand(activePaletteCommandIndex);
    }
});
commandPaletteClose.addEventListener('click', closeCommandPalette);
shortcutHelpClose.addEventListener('click', () => shortcutHelp.close());
document.addEventListener('keydown', handleKeyboardShortcut);
function scheduleChatPoll(delay = chatPollDelay) {
    if (activeChatProjectId === null)
        return;
    if (chatPollTimer !== null)
        window.clearTimeout(chatPollTimer);
    chatPollTimer = window.setTimeout(() => {
        chatPollTimer = null;
        if (activeChatProjectId !== null)
            void pollProjectChat(activeChatProjectId);
    }, delay);
}
async function pollProjectChat(projectId) {
    if (activeChatProjectId !== projectId)
        return;
    if (document.hidden) {
        chatPollDelay = Math.min(10_000, Math.max(5_000, chatPollDelay * 1.5));
        scheduleChatPoll();
        return;
    }
    const headers = new Headers();
    if (chatEtag !== null)
        headers.set('If-None-Match', chatEtag);
    const cursor = `?since=${chatCursor}`;
    try {
        const response = await fetch(`/api/v1/events${cursor}`, {
            headers,
            credentials: 'same-origin',
        });
        if (activeChatProjectId !== projectId)
            return;
        if (response.status === 304) {
            chatPollDelay = Math.min(10_000, chatPollDelay * 1.5);
        }
        else {
            const payload = await response.json();
            if (activeChatProjectId !== projectId)
                return;
            if (!response.ok)
                throw new ApiFailure(payload.error?.message ?? 'Could not load project chat.', response.status);
            chatEtag = response.headers.get('ETag');
            const received = payload.events ?? [];
            for (const event of received) {
                chatCursor = Math.max(chatCursor, event.id);
                if (event.project_id === projectId)
                    appendChatMessage(event);
            }
            if (received.length > 0) {
                chatPollDelay = 1000;
            }
            else {
                chatPollDelay = Math.min(10_000, chatPollDelay * 1.5);
            }
        }
    }
    catch (error) {
        if (error instanceof ApiFailure && error.status === 401) {
            showSignedOut();
            return;
        }
        report(error instanceof Error ? error.message : 'Could not load project chat.', true);
        chatPollDelay = Math.min(10_000, chatPollDelay * 1.5);
    }
    if (activeChatProjectId === projectId)
        scheduleChatPoll();
}
async function loadProjectChatHistory(projectId) {
    try {
        const result = await api(`/projects/${projectId}/messages`);
        if (activeChatProjectId !== projectId)
            return;
        for (const message of result.messages)
            appendChatMessage(message);
        void pollProjectChat(projectId);
    }
    catch (error) {
        if (error instanceof ApiFailure && error.status === 401) {
            showSignedOut();
            return;
        }
        report(error instanceof Error ? error.message : 'Could not load project chat.', true);
        scheduleChatPoll();
    }
}
function appendChatMessage(message) {
    if (chatMessageList === null)
        return;
    if (chatMessageList.querySelector(`[data-message-id="${message.id}"]`))
        return;
    chatMessagesById.set(message.id, message);
    const item = document.createElement('article');
    item.className = message.parent_id === null ? 'chat-message' : 'chat-message chat-reply';
    item.dataset.messageId = String(message.id);
    item.tabIndex = -1;
    item.addEventListener('focus', () => selectChatMessage(message.id, false));
    item.addEventListener('click', (event) => {
        if (!(event.target instanceof HTMLElement) || event.target.closest('button') === null) {
            selectChatMessage(message.id);
        }
    });
    const heading = document.createElement('div');
    heading.className = 'chat-message-heading';
    const avatar = document.createElement('span');
    avatar.className = 'chat-message-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = avatarInitials(message.author_name);
    const authorDetails = document.createElement('span');
    authorDetails.className = 'chat-message-author';
    const author = document.createElement('strong');
    author.textContent = message.author_name;
    const time = document.createElement('time');
    time.className = 'chat-message-time';
    time.dateTime = message.created_at;
    const parsedDate = new Date(message.created_at);
    time.textContent = Number.isNaN(parsedDate.getTime())
        ? ''
        : new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(parsedDate);
    authorDetails.append(author, time);
    const reply = document.createElement('button');
    reply.className = 'button button-quiet chat-reply-button';
    reply.type = 'button';
    reply.textContent = 'Reply';
    reply.addEventListener('click', () => {
        selectChatMessage(message.id, false);
        setChatReplyParent(message);
    });
    const createIssue = document.createElement('button');
    createIssue.className = 'button button-quiet chat-create-issue-button';
    createIssue.type = 'button';
    createIssue.textContent = 'Create issue';
    createIssue.addEventListener('click', async () => {
        selectChatMessage(message.id, false);
        const projectId = activeProject?.id;
        if (projectId === undefined || activeChatProjectId !== projectId)
            return;
        createIssue.disabled = true;
        createIssue.textContent = 'Creating…';
        try {
            const result = await api(`/messages/${message.id}/issue`, { method: 'POST' });
            if (activeProject?.id !== projectId)
                return;
            createIssue.textContent = 'Created';
            report(`Created issue: ${result.issue.title}`);
            selectedIssue = null;
            switchProjectTab('issues');
        }
        catch (error) {
            createIssue.disabled = false;
            createIssue.textContent = 'Create issue';
            report(error instanceof Error ? error.message : 'Could not create an issue from this message.', true);
        }
    });
    const actions = document.createElement('div');
    actions.className = 'chat-message-actions';
    actions.append(reply, createIssue);
    heading.append(avatar, authorDetails, actions);
    const body = document.createElement('p');
    body.className = 'chat-message-body';
    body.textContent = message.body;
    item.append(heading, body);
    const followingMessage = Array.from(chatMessageList.children).find((child) => {
        const existingId = Number(child.dataset.messageId);
        return Number.isFinite(existingId) && existingId > message.id;
    });
    chatMessageList.insertBefore(item, followingMessage ?? null);
    chatEmptyState.hidden = true;
    chatCursor = Math.max(chatCursor, message.id);
}
function avatarInitials(name) {
    return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase();
}
function setChatReplyParent(message) {
    chatReplyParent = { id: message.id, name: message.author_name };
    if (chatReplyHint !== null) {
        chatReplyHint.textContent = `Replying to ${message.author_name}`;
        chatReplyHint.hidden = false;
    }
    if (chatCancelReply !== null)
        chatCancelReply.hidden = false;
    chatInput?.focus();
}
function clearChatReplyParent() {
    chatReplyParent = null;
    if (chatReplyHint !== null)
        chatReplyHint.hidden = true;
    if (chatCancelReply !== null)
        chatCancelReply.hidden = true;
}
function createProjectChat(projectId) {
    const section = document.createElement('section');
    section.className = 'project-chat';
    const heading = document.createElement('h3');
    heading.className = 'chat-heading';
    heading.tabIndex = -1;
    const channelName = document.createElement('span');
    channelName.className = 'chat-channel-name';
    const channelHash = document.createElement('span');
    channelHash.className = 'chat-channel-hash';
    channelHash.textContent = '#';
    const channelSlug = document.createElement('span');
    channelSlug.textContent = activeProject?.slug ?? 'project';
    channelName.append(channelHash, channelSlug);
    const memberCount = document.createElement('span');
    memberCount.className = 'chat-members-count';
    memberCount.textContent = `${activeProjectMembers.length} ${activeProjectMembers.length === 1 ? 'member' : 'members'}`;
    heading.append(channelName, memberCount);
    chatMessageList = document.createElement('div');
    chatMessageList.className = 'chat-message-list';
    chatEmptyState = document.createElement('p');
    chatEmptyState.className = 'chat-empty-state';
    chatEmptyState.textContent = 'No messages yet.';
    chatMessageList.append(chatEmptyState);
    const form = document.createElement('form');
    form.className = 'chat-composer form-stack';
    const label = document.createElement('label');
    label.textContent = 'Message';
    chatInput = document.createElement('textarea');
    chatInput.name = 'body';
    chatInput.rows = 2;
    chatInput.maxLength = 10_000;
    chatInput.required = true;
    chatInput.placeholder = `Message #${activeProject?.slug ?? 'project'}…`;
    chatInput.setAttribute('aria-label', 'Message');
    chatInput.addEventListener('keydown', (event) => submitFormOnEnter(event, form));
    label.append(chatInput);
    chatReplyHint = document.createElement('p');
    chatReplyHint.className = 'chat-reply-hint';
    chatReplyHint.hidden = true;
    const actions = document.createElement('div');
    actions.className = 'chat-composer-actions';
    chatCancelReply = document.createElement('button');
    chatCancelReply.className = 'button button-quiet';
    chatCancelReply.type = 'button';
    chatCancelReply.textContent = 'Cancel reply';
    chatCancelReply.hidden = true;
    chatCancelReply.addEventListener('click', clearChatReplyParent);
    const send = document.createElement('button');
    send.className = 'button button-primary';
    send.type = 'submit';
    send.textContent = 'Send';
    actions.append(chatCancelReply, send);
    form.append(label, chatReplyHint, actions);
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const body = chatInput?.value.trim() ?? '';
        if (body === '')
            return;
        const messageBody = { body };
        if (chatReplyParent !== null)
            messageBody.parent_id = chatReplyParent.id;
        const optimisticId = -Date.now();
        const optimisticMessage = {
            id: optimisticId,
            channel_id: 0,
            parent_id: messageBody.parent_id ?? null,
            author_id: activeUser?.id ?? 0,
            author_name: activeUser?.name ?? 'You',
            body,
            created_at: new Date().toISOString(),
        };
        if (activeChatProjectId === projectId)
            appendChatMessage(optimisticMessage);
        send.disabled = true;
        try {
            const result = await api(`/projects/${projectId}/messages`, {
                method: 'POST',
                body: JSON.stringify(messageBody),
            });
            if (activeChatProjectId === projectId) {
                chatMessageList?.querySelector(`[data-message-id="${optimisticId}"]`)?.remove();
                appendChatMessage(result.message);
                selectChatMessage(result.message.id, false);
                chatInput.value = '';
                clearChatReplyParent();
                chatEtag = null;
                chatPollDelay = 1000;
                scheduleChatPoll(0);
            }
        }
        catch (error) {
            if (activeChatProjectId === projectId) {
                chatMessageList?.querySelector(`[data-message-id="${optimisticId}"]`)?.remove();
                report(error instanceof Error ? error.message : 'Could not send the message.', true);
            }
        }
        finally {
            send.disabled = false;
        }
    });
    section.append(heading, chatMessageList, form);
    activeChatProjectId = projectId;
    chatCursor = 0;
    chatEtag = null;
    chatPollDelay = 1000;
    void loadProjectChatHistory(projectId);
    return section;
}
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && activeChatProjectId !== null) {
        chatPollDelay = 1000;
        scheduleChatPoll(0);
    }
});
projectsNavButton.addEventListener('click', goToProjects);
adminNavButton.addEventListener('click', openWorkspaceAdmin);
breadcrumbProjectsButton.addEventListener('click', goToProjects);
issuesTabButton.addEventListener('click', () => switchProjectTab('issues'));
membersTabButton.addEventListener('click', () => switchProjectTab('members'));
const issueDescriptionInput = issueForm.querySelector('textarea[name="description"]');
const rememberIssueQuickAddOpener = (event) => {
    const previous = event.relatedTarget;
    if (previous instanceof HTMLElement && !issueForm.contains(previous)) {
        issueQuickAddReturnFocus = previous;
    }
    else if (issueQuickAddReturnFocus === null) {
        issueQuickAddReturnFocus = issuesTabButton;
    }
    issueQuickAddEscapePending = false;
};
issueQuickAddTitle.addEventListener('focus', rememberIssueQuickAddOpener);
issueDescriptionInput?.addEventListener('focus', rememberIssueQuickAddOpener);
projectForm.querySelector('textarea[name="description"]')
    ?.addEventListener('keydown', (event) => submitFormOnEnter(event, projectForm));
issueDescriptionInput?.addEventListener('keydown', (event) => submitFormOnEnter(event, issueForm));
issueDetailDescriptionInput.addEventListener('keydown', (event) => submitFormOnEnter(event, issueDetailEditForm));
issueFilter.addEventListener('input', renderProjectIssueBoard);
issueOrder.addEventListener('change', renderProjectIssueBoard);
toggleProjectFormButton.addEventListener('click', () => {
    if (!projectFormPanel.hidden) {
        closeProjectForm();
        return;
    }
    projectFormPanel.hidden = false;
    projectForm.querySelector('input[name="name"]')?.focus();
});
cancelProjectFormButton.addEventListener('click', closeProjectForm);
issueForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (activeProject === null)
        return;
    const projectId = activeProject.id;
    const values = new FormData(issueForm);
    try {
        await api(`/projects/${projectId}/issues`, {
            method: 'POST',
            body: JSON.stringify({ title: values.get('title'), description: values.get('description') }),
        });
        issueForm.reset();
        issueDescriptionDetails.open = false;
        issueQuickAddEscapePending = false;
        report('Issue created.');
        await loadProjectIssues(projectId);
    }
    catch (error) {
        if (activeProject?.id === projectId)
            issueQuickAddTitle.focus();
        report(error instanceof Error ? error.message : 'Could not create the issue.', true);
    }
});
memberForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (activeProject === null || memberSelect.value === '')
        return;
    const projectId = activeProject.id;
    try {
        await api(`/projects/${projectId}/members/${memberSelect.value}`, { method: 'PUT' });
        report('Member added to the project.');
        await loadProjectDetail(projectId, 'members');
    }
    catch (error) {
        report(error instanceof Error ? error.message : 'Could not add member.', true);
    }
});
async function loadProjects() {
    const result = await api('/projects');
    projectList.replaceChildren();
    emptyProjects.hidden = result.projects.length > 0;
    projectSidebarList.replaceChildren();
    for (const project of result.projects) {
        const item = document.createElement('li');
        item.className = 'project-card';
        item.dataset.projectId = String(project.id);
        const details = document.createElement('div');
        const name = document.createElement('p');
        name.className = 'project-name';
        name.textContent = project.name;
        const description = document.createElement('p');
        description.className = 'project-description';
        description.textContent = project.description || project.slug;
        details.append(name, description);
        const actions = document.createElement('div');
        const state = document.createElement('span');
        state.className = 'project-status';
        state.textContent = project.status;
        const open = document.createElement('button');
        open.className = 'button button-quiet';
        open.type = 'button';
        open.textContent = 'Open';
        open.addEventListener('click', () => void loadProjectDetail(project.id));
        actions.append(state, open);
        item.append(details, actions);
        projectList.append(item);
        const sidebarItem = document.createElement('li');
        const sidebarButton = document.createElement('button');
        sidebarButton.type = 'button';
        sidebarButton.className = 'project-sidebar-link';
        sidebarButton.dataset.projectId = String(project.id);
        sidebarButton.classList.toggle('is-active', activeProject?.id === project.id);
        sidebarButton.textContent = project.name;
        sidebarButton.addEventListener('click', () => void loadProjectDetail(project.id));
        sidebarItem.append(sidebarButton);
        projectSidebarList.append(sidebarItem);
    }
}
async function loadProjectDetail(projectId, tab = 'issues', recordHistory = true) {
    const previousLocation = currentWorkspaceLocation();
    stopChatPolling();
    selectedIssue = null;
    issueDetailEditForm.hidden = true;
    issueDetailDisplay.hidden = false;
    try {
        const result = await api(`/projects/${projectId}`);
        const nextLocation = { view: 'project', projectId, tab };
        if (recordHistory && !sameWorkspaceLocation(previousLocation, nextLocation)) {
            workspaceViewHistory.push(previousLocation);
        }
        activeProject = result.project;
        activeProjectMembers = result.members;
        projectSidebarList.querySelectorAll('.project-sidebar-link').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.projectId === String(result.project.id));
        });
        projectDescription.textContent = result.project.description;
        projectDescription.hidden = result.project.description.trim() === '';
        projectState.textContent = result.project.status;
        projectIssues = [];
        issueFilter.value = '';
        issueOrder.value = 'updated';
        issueDescriptionDetails.open = false;
        renderProjectIssueBoard();
        showWorkspaceView('project');
        chatView.replaceChildren(createProjectChat(projectId));
        switchProjectTab(tab);
        (tab === 'issues' ? issuesTabButton : membersTabButton).focus();
    }
    catch (error) {
        workspaceViewHistory.length = 0;
        report(error instanceof Error ? error.message : 'Could not load the project.', true);
        showWorkspaceView('projects');
    }
}
function switchProjectTab(tab, returnFocusIssueId) {
    if (activeProject === null)
        return;
    const showingIssueDetail = tab === 'issues' && selectedIssue !== null;
    issuesView.hidden = tab !== 'issues' || showingIssueDetail;
    issueDetailView.hidden = !showingIssueDetail;
    membersView.hidden = tab !== 'members';
    issuesTabButton.classList.toggle('is-active', tab === 'issues');
    membersTabButton.classList.toggle('is-active', tab === 'members');
    if (tab === 'issues') {
        issuesTabButton.setAttribute('aria-current', 'page');
        membersTabButton.removeAttribute('aria-current');
        if (!showingIssueDetail) {
            const projectId = activeProject.id;
            const loadingIssues = loadProjectIssues(projectId);
            if (returnFocusIssueId !== undefined) {
                issuesTabButton.focus();
                void loadingIssues.then(() => {
                    if (activeProject?.id !== projectId || issuesView.hidden)
                        return;
                    if (!focusIssueTitleButton(returnFocusIssueId))
                        issuesTabButton.focus();
                });
            }
        }
        return;
    }
    membersTabButton.setAttribute('aria-current', 'page');
    issuesTabButton.removeAttribute('aria-current');
    void loadProjectMembers(activeProject.id);
}
async function loadProjectIssues(projectId) {
    try {
        const result = await api(`/projects/${projectId}/issues`);
        if (activeProject?.id !== projectId || issuesView.hidden)
            return;
        projectIssues = result.issues;
        renderProjectIssueBoard();
    }
    catch (error) {
        if (error instanceof ApiFailure && error.status === 401) {
            showSignedOut();
            return;
        }
        report(error instanceof Error ? error.message : 'Could not load project issues.', true);
    }
}
function renderProjectIssueBoard() {
    const total = projectIssues.length;
    const completed = projectIssues.filter((issue) => issue.status === 'done').length;
    const open = total - completed;
    issueProgress.max = Math.max(total, 1);
    issueProgress.value = completed;
    issueProgressLabel.textContent = `${completed} of ${total} issues done`;
    issueCountSummary.textContent = `${open} open · ${completed} done`;
    const ordered = sortIssues(projectIssues, issueOrder.value);
    const visible = filterIssues(ordered, issueFilter.value);
    issueList.replaceChildren();
    emptyIssues.hidden = visible.length > 0;
    emptyIssues.textContent = total === 0 ? 'No issues yet. Create the first one.' : 'No issues match that filter.';
    for (const group of groupIssues(visible)) {
        const details = document.createElement('details');
        details.className = 'issue-group';
        details.open = true;
        const summary = document.createElement('summary');
        summary.className = 'issue-group-summary';
        const chevron = document.createElement('span');
        chevron.className = 'issue-group-chevron';
        chevron.setAttribute('aria-hidden', 'true');
        chevron.textContent = '›';
        const name = document.createElement('span');
        name.className = 'issue-group-name';
        name.textContent = group.status;
        const count = document.createElement('span');
        count.className = 'issue-group-count';
        count.textContent = String(group.issues.length);
        summary.append(chevron, name, count);
        const rows = document.createElement('ul');
        rows.className = 'issue-group-items';
        for (const issue of group.issues)
            rows.append(createIssueRow(issue));
        details.append(summary, rows);
        issueList.append(details);
    }
}
function renderIssueDetail() {
    if (selectedIssue === null)
        return;
    issueDetailTitle.textContent = selectedIssue.title;
    issueDetailDescription.textContent = selectedIssue.description || 'No description yet.';
    issueDetailDescription.classList.toggle('is-empty', selectedIssue.description === '');
    issueDetailStatus.value = selectedIssue.status;
    issueSourceLink.hidden = selectedIssue.source_message_id === null;
    if (selectedIssue.source_message_id !== null) {
        issueSourceLink.dataset.messageId = String(selectedIssue.source_message_id);
    }
    else {
        delete issueSourceLink.dataset.messageId;
    }
}
function focusIssueTitleButton(issueId) {
    const button = issueList.querySelector(`.issue-card[data-issue-id="${issueId}"] .issue-title-button`);
    if (button === null)
        return false;
    button.focus();
    return true;
}
function closeIssueDetailEditForm() {
    issueDetailEditForm.reset();
    issueDetailEditForm.hidden = true;
    issueDetailDisplay.hidden = false;
    if (!issueDetailView.hidden)
        issueDetailEditButton.focus();
}
function openIssue(issue) {
    selectedIssue = issue;
    issueList.querySelectorAll('.issue-card').forEach((row) => {
        row.classList.toggle('is-keyboard-selected', row.dataset.issueId === String(issue.id));
    });
    issueDetailDisplay.hidden = false;
    issueDetailEditForm.hidden = true;
    renderIssueDetail();
    switchProjectTab('issues');
    issueBackButton.focus();
}
function createIssueStatusSelect(issue) {
    const status = document.createElement('select');
    status.className = 'issue-status';
    status.setAttribute('aria-label', `Status for ${issue.title}`);
    const statuses = [
        { value: 'backlog', label: 'Backlog' },
        { value: 'todo', label: 'Todo' },
        { value: 'doing', label: 'Doing' },
        { value: 'done', label: 'Done' },
    ];
    for (const entry of statuses) {
        const option = document.createElement('option');
        option.value = entry.value;
        option.textContent = entry.label;
        status.append(option);
    }
    status.value = issue.status;
    status.addEventListener('change', () => void updateIssueStatus(issue, status));
    return status;
}
async function updateIssueStatus(issue, status) {
    const previousStatus = selectedIssue?.id === issue.id ? selectedIssue.status : issue.status;
    try {
        const result = await api(`/issues/${issue.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: status.value }),
        });
        if (selectedIssue?.id === issue.id) {
            selectedIssue = result.issue;
            renderIssueDetail();
        }
        report('Issue status updated.');
        if (issueDetailView.hidden)
            await loadProjectIssues(issue.project_id);
    }
    catch (error) {
        status.value = previousStatus;
        report(error instanceof Error ? error.message : 'Could not update the issue status.', true);
    }
}
function createIssueRow(issue) {
    const item = document.createElement('li');
    item.className = 'issue-card';
    item.dataset.issueId = String(issue.id);
    const content = document.createElement('div');
    content.className = 'issue-content';
    const mainline = document.createElement('div');
    mainline.className = 'issue-mainline';
    const indicator = document.createElement('span');
    indicator.className = `issue-status-indicator is-${issue.status}`;
    indicator.setAttribute('aria-hidden', 'true');
    const key = document.createElement('span');
    key.className = 'issue-key';
    key.textContent = `#${issue.id}`;
    const title = document.createElement('button');
    title.className = 'issue-title issue-title-button';
    title.type = 'button';
    title.textContent = issue.title;
    title.addEventListener('click', () => openIssue(issue));
    mainline.append(indicator, key, title);
    content.append(mainline);
    if (issue.description !== '') {
        const description = document.createElement('p');
        description.className = 'issue-description';
        description.textContent = issue.description;
        content.append(description);
    }
    if (issue.source_message_id !== null) {
        const source = document.createElement('span');
        source.className = 'issue-source';
        source.textContent = 'From chat thread';
        content.append(source);
    }
    item.append(content, createIssueStatusSelect(issue));
    return item;
}
issueDetailEditButton.addEventListener('click', () => {
    if (selectedIssue === null)
        return;
    issueDetailTitleInput.value = selectedIssue.title;
    issueDetailDescriptionInput.value = selectedIssue.description;
    issueDetailDisplay.hidden = true;
    issueDetailEditForm.hidden = false;
    issueDetailTitleInput.focus();
});
issueDetailCancelButton.addEventListener('click', () => {
    closeIssueDetailEditForm();
});
issueBackButton.addEventListener('click', () => {
    const issueId = selectedIssue?.id;
    selectedIssue = null;
    issueDetailEditForm.reset();
    issueDetailEditForm.hidden = true;
    issueDetailDisplay.hidden = false;
    switchProjectTab('issues', issueId);
});
issueDetailEditForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (selectedIssue === null || activeProject === null)
        return;
    const issue = selectedIssue;
    issueDetailSaveButton.disabled = true;
    try {
        const result = await api(`/issues/${issue.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                title: issueDetailTitleInput.value,
                description: issueDetailDescriptionInput.value,
            }),
        });
        if (selectedIssue?.id !== issue.id || activeProject?.id !== issue.project_id)
            return;
        selectedIssue = result.issue;
        renderIssueDetail();
        closeIssueDetailEditForm();
        report('Issue updated.');
    }
    catch (error) {
        if (selectedIssue?.id === issue.id && activeProject?.id === issue.project_id) {
            issueDetailTitleInput.focus();
        }
        report(error instanceof Error ? error.message : 'Could not update the issue.', true);
    }
    finally {
        issueDetailSaveButton.disabled = false;
    }
});
issueDetailStatus.addEventListener('change', () => {
    if (selectedIssue !== null)
        void updateIssueStatus(selectedIssue, issueDetailStatus);
});
issueSourceLink.addEventListener('click', async (event) => {
    event.preventDefault();
    const issue = selectedIssue;
    const projectId = activeProject?.id;
    const messageId = Number(issueSourceLink.dataset.messageId);
    if (issue === null || projectId === undefined || !Number.isSafeInteger(messageId) || messageId < 1)
        return;
    let sourceMessage = chatMessageList?.querySelector(`[data-message-id="${messageId}"]`) ?? null;
    if (sourceMessage === null) {
        try {
            const result = await api(`/projects/${projectId}/messages?since=${messageId - 1}`);
            if (activeProject?.id !== projectId || selectedIssue?.id !== issue.id)
                return;
            for (const message of result.messages)
                appendChatMessage(message);
            sourceMessage = chatMessageList?.querySelector(`[data-message-id="${messageId}"]`) ?? null;
        }
        catch (error) {
            report(error instanceof Error ? error.message : 'Could not open the source chat thread.', true);
            return;
        }
    }
    if (sourceMessage === null) {
        report('The source message is unavailable in this project chat.', true);
        return;
    }
    chatMessageList?.querySelector('.is-chat-source')?.classList.remove('is-chat-source');
    sourceMessage.classList.add('is-chat-source');
    sourceMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
async function loadProjectMembers(projectId) {
    memberList.replaceChildren();
    for (const member of activeProjectMembers) {
        const item = document.createElement('li');
        item.textContent = `${member.name} · ${member.role}`;
        memberList.append(item);
    }
    memberForm.hidden = activeUser?.role !== 'admin';
    if (memberForm.hidden)
        return;
    try {
        const result = await api('/users');
        if (activeProject?.id !== projectId || membersView.hidden)
            return;
        memberSelect.replaceChildren();
        for (const candidate of result.users.filter((user) => !activeProjectMembers.some((member) => member.id === user.id))) {
            const option = document.createElement('option');
            option.value = String(candidate.id);
            option.textContent = `${candidate.name} · ${candidate.email}`;
            memberSelect.append(option);
        }
        addMemberButton.disabled = memberSelect.options.length === 0;
    }
    catch (error) {
        report(error instanceof Error ? error.message : 'Could not load workspace users.', true);
    }
}
loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = new FormData(loginForm);
    try {
        const result = await api('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email: values.get('email'), password: values.get('password') }),
        });
        showSignedIn(result.user);
        await loadWorkspaces();
        await loadProjects();
    }
    catch (error) {
        report(error instanceof Error ? error.message : 'Could not sign in.', true);
    }
});
workspaceSwitcher.addEventListener('change', () => {
    const workspaceId = Number(workspaceSwitcher.value);
    if (Number.isInteger(workspaceId) && workspaceId > 0)
        void switchWorkspace(workspaceId);
});
createWorkspaceForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = new FormData(createWorkspaceForm);
    try {
        const result = await api('/workspaces', {
            method: 'POST',
            body: JSON.stringify({ name: values.get('name') }),
        });
        createWorkspaceForm.reset();
        await loadWorkspaces();
        await switchWorkspace(result.workspace.id);
    }
    catch (error) {
        report(error instanceof Error ? error.message : 'Could not create the workspace.', true);
    }
});
projectForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = new FormData(projectForm);
    try {
        await api('/projects', {
            method: 'POST',
            body: JSON.stringify({ name: values.get('name'), description: values.get('description') }),
        });
        closeProjectForm();
        report('Project created.');
        await loadProjects();
    }
    catch (error) {
        if (!projectFormPanel.hidden)
            projectForm.querySelector('input[name="name"]')?.focus();
        report(error instanceof Error ? error.message : 'Could not create project.', true);
    }
});
developerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = new FormData(developerForm);
    try {
        await api('/users', {
            method: 'POST',
            body: JSON.stringify({
                name: values.get('name'),
                email: values.get('email'),
                password: values.get('password'),
            }),
        });
        developerForm.reset();
        report('Developer added. Open a project to add them as a member.');
    }
    catch (error) {
        report(error instanceof Error ? error.message : 'Could not add developer.', true);
    }
});
async function signOut() {
    try {
        await api('/auth/logout', { method: 'POST' });
    }
    finally {
        showSignedOut();
    }
}
logoutButton.addEventListener('click', () => { void signOut(); });
async function start() {
    try {
        const result = await api('/auth/me');
        showSignedIn(result.user);
        await loadWorkspaces();
        await loadProjects();
    }
    catch (error) {
        showSignedOut();
        if (error instanceof ApiFailure && error.status !== 401) {
            report(error.message, true);
        }
    }
}
void start();
