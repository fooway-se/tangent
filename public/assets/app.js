import { api, apiBaseUrl, ApiFailure } from './api.js';
import { ISSUE_STATUS_OPTIONS, ISSUE_TYPE_OPTIONS, PROJECT_STATUS_HINTS, PROJECT_STATUS_LABELS, PROJECT_STATUS_ORDER, } from './types.js';
import { initGuestUi } from './guest-ui.js';
import { initInboxUi } from './inbox-ui.js';
import { createLogoutController } from './logout.js';
import { ProjectNavigationOwner, runOwnedRequest } from './project-navigation.js';
import { githubRepositorySelectionValue, parseGitHubRepositorySelection } from './github-repository-selection.js';
import { switchWorkspaceMembership } from './workspace-switch.js';
import { initAuthUi } from './auth-ui.js';
import { initClientSummaryUi } from './client-summary-ui.js';
import { resolveShortcut, shouldSubmitOnEnter } from './shortcuts.js';
import { nextTheme, themeLabel } from './theme.js';
import { initThemeUi } from './theme-ui.js';
import { initProjectNotesUi } from './project-notes-ui.js';
import { initMilestoneUi } from './milestone-ui.js';
import { initLoungePresence } from './lounge-presence.js';
import { initLoungeChatUi } from './lounge-chat-ui.js';
import { initWorkspaceAdminUi } from './workspace-admin-ui.js';
import { initProjectChatUi } from './project-chat-ui.js';
import { parseQuickIssueInput } from './quick-issue.js';
import { milestoneStatus } from './roadmap.js';
import { formatIssueMarkdown, formatIssuePrompt } from './issue-export.js';
import { filterIssues, filterIssuesByMilestoneArchive, groupIssues, groupIssuesByMilestone, discussionIndicatorLabel, projectProgress, sortIssues, } from './issue-board.js';
import { diffConditionalIssueCollections, loadIssueCollections, nextIssuePollDelay, refreshDeletedIssuesOnOpen, shouldDeferIssueUpdates, } from './issue-polling.js';
import { dom } from './dom.js';
const { project: { projectHeading, projectEditDialog, projectEditForm, projectEditClose, projectEditCancel, projectEditName, projectEditDescription, projectEditStatus, projectEditStatusHelp, projectReadOnlyNotice, projectEditMessage, projectEditSave, editProjectButton, projectGithubRepository, projectEditGithubRepository, githubProjectSelectionStatus, githubProjectEditStatus, connectGithubCreateButton, connectGithubEditButton, projectsNavButton, projectsView, projectView, projectForm, projectList, emptyProjects, projectFormPanel, projectDescription, projectState, projectChatColumn, projectSidebarList, projectSidebarEmpty, projectMain, projectTabs, projectKeyboardHints, }, auth: { loginPanel, loginShell, accountBar, currentUserLabel, loginStatusMessage, logoutButton, }, workspace: { workspacePanel, workspaceNav, workspaceSwitcher, workspaceSwitcherLabel, workspacePicker, workspacePickerCancel, workspacePickerConfirm, workspacePickerDescription, workspacePickerOptions, adminNavButton, adminView, adminHeading, membersView, adminGoPrefixOption, workspaceSwitchHint, membersTabButton, memberList, memberForm, memberAddControls, memberAddStatus, memberSelect, memberRemovalConfirmation, memberRemovalDescription, memberRemovalCancel, memberRemovalConfirm, }, shell: { createWorkspaceForm, breadcrumbProjectsButton, breadcrumbDivider, breadcrumbCurrent, cancelProjectFormButton, linkPullRequestButton, notesTabButton, emptyIssues, addMemberButton, statusMessage, }, roadmap: { roadmapNavButton, roadmapView, roadmapHeading, roadmapSummary, roadmapMilestoneList, roadmapEmptyState, roadmapGoPrefixOption, }, inbox: { inboxNavButton, inboxView, inboxHeading, }, lounge: { loungeNavButton, loungeView, loungeHeading, loungeMessageList, }, shortcuts: { toggleProjectFormButton, keyboardHints, goPrefixHint, goPrefixWorkspaceOption, goPrefixProjectOptions, commandPalette, commandPaletteClose, commandSearch, commandResults, shortcutHelp, shortcutHelpClose, }, chat: { chatView, }, issues: { issuesView, issueDetailView, issueDetailDisplay, issueDetailTitle, issueDetailPriority, issueDetailDueDate, issueDetailDescription, issueDetailBrief, issueDetailContextSection, issueDetailContext, issueDetailExpectedOutcomeSection, issueDetailExpectedOutcome, issueDetailAcceptanceCriteriaSection, issueDetailAcceptanceCriteria, issueDetailStatus, issueDetailStatusLabel, issueSourceLink, issuePullRequests, issuePullRequestsList, issuePullRequestsEmpty, issuePullRequestDialog, issuePullRequestForm, issuePullRequestClose, issuePullRequestCancel, issuePullRequestUrl, issuePullRequestMessage, issuePullRequestSubmit, issueDetailEditForm, issueDetailTitleInput, issueDetailDescriptionInput, issueDetailPriorityInput, issueDetailDueDateInput, issueDetailEditButton, issueAiPromptButton, issueAiPromptDialog, issueAiPromptCloseButton, issueAiPromptStepCount, issueAiPromptContext, issueAiPromptOutcome, issueAiPromptCriteria, issueAiPromptPreview, issueAiPromptStatus, issueAiPromptBackButton, issueAiPromptSkipButton, issueAiPromptNextButton, issueAiPromptActions, issueAiPromptSaveButton, issueAiPromptCopyButton, issueAiPromptCopyMarkdownButton, issueAiPromptDownloadButton, issueDetailDeleteButton, issueDetailSaveButton, issuesTabButton, issueBackButton, issueDetailCancelButton, issueForm, issueQuickAddTitle, issueQuickAddPriority, issueQuickAddDueDate, issueQuickAddAssignee, issueQuickAddMilestone, issueQuickAddOngoing, issueQuickAddShared, issueQuickAddApproval, issueQuickAddCancelButton, issueDetailType, issueDetailAssignee, issueDetailMilestone, issueDetailOngoingRow, issueDetailSharing, issueDetailApproval, issueDetailTypeInput, issueDetailAssigneeInput, issueDetailMilestoneInput, issueDetailOngoingInput, issueDetailSharedInput, issueDetailApprovalInput, issueStatusHistory, issueStatusHistoryCount, issueStatusHistoryEmpty, issueStatusHistoryList, issueDiscussionHeading, issueDiscussionCount, issueDiscussionStatus, issueDiscussionEmpty, issueDiscussionList, issueDiscussionForm, issueDiscussionInput, issueDiscussionSubmit, issueDiscussionReplyContext, issueDiscussionReplyLabel, issueDiscussionReplyCancel, issueDescriptionDetails, issueProgress, issueProgressLabel, issueFilter, issueGrouping, issueOrder, issueScope, issueCountSummary, issueBulkAssignToggle, issueBulkAssignToolbar, issueList, deletedIssuesDetails, deletedIssueCount, deletedIssueList, issueStatusPicker, issueStatusPickerClose, issueStatusPickerDescription, issueStatusPickerOptions, issueDeleteConfirmation, issueDeleteDescription, issueDeleteError, issueDeleteCancel, issueDeleteConfirm, }, guest: { guestWorkspaceSwitcher, guestWorkspaceSwitcherLabel, guestLogoutButton, }, } = dom;
const KEYBOARD_HINTS_STORAGE_KEY = 'tangent.keyboard-hints-visible';
function loadKeyboardHintsPreference() {
    try {
        return window.localStorage.getItem(KEYBOARD_HINTS_STORAGE_KEY) !== 'false';
    }
    catch {
        return true;
    }
}
function issueStatusLabel(status) {
    return ISSUE_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}
function issueStatusOptions(issue) {
    return issue.is_ongoing
        ? ISSUE_STATUS_OPTIONS.filter((option) => option.value !== 'done')
        : ISSUE_STATUS_OPTIONS;
}
function issueTypeLabel(type) {
    return ISSUE_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}
function issuePriorityLabel(priority) {
    return priority[0].toUpperCase() + priority.slice(1);
}
function formatIssueDueDate(dueDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate))
        return dueDate;
    const date = new Date(`${dueDate}T12:00:00Z`);
    return new Intl.DateTimeFormat(undefined, {
        month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    }).format(date);
}
function isIssueOverdue(issue) {
    if (issue.due_date === null || issue.status === 'done' || issue.status === 'cancelled')
        return false;
    const today = new Date();
    const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return issue.due_date < todayDate;
}
function issueAssigneeLabel(assigneeId) {
    if (assigneeId === null)
        return 'Unassigned';
    return activeProjectMembers.find((member) => member.id === assigneeId)?.name ?? 'Former project member';
}
function populateIssueAssigneeSelect(select, selectedAssigneeId) {
    const unassigned = document.createElement('option');
    unassigned.value = '';
    unassigned.textContent = 'Unassigned';
    select.replaceChildren(unassigned);
    for (const member of activeProjectMembers) {
        const option = document.createElement('option');
        option.value = String(member.id);
        option.textContent = member.name;
        select.append(option);
    }
    select.value = selectedAssigneeId === null ? '' : String(selectedAssigneeId);
}
function populateIssueMilestoneSelect(select, selectedMilestoneId) {
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'No milestone';
    select.replaceChildren(none);
    for (const milestone of projectMilestones) {
        if (milestone.archived_at !== null && milestone.id !== selectedMilestoneId)
            continue;
        const option = document.createElement('option');
        option.value = String(milestone.id);
        option.textContent = milestone.archived_at === null ? milestone.name : `${milestone.name} (archived)`;
        select.append(option);
    }
    select.value = selectedMilestoneId === null ? '' : String(selectedMilestoneId);
}
const themeUi = initThemeUi();
const projectSidebarSection = projectSidebarList.closest('.sidebar-projects');
const projectSidebarMore = createScrollMoreIndicator();
projectSidebarList.after(projectSidebarMore);
const issueAiPromptSteps = [
    document.querySelector('#issue-ai-prompt-step-context'),
    document.querySelector('#issue-ai-prompt-step-outcome'),
    document.querySelector('#issue-ai-prompt-step-criteria'),
    document.querySelector('#issue-ai-prompt-step-preview'),
];
const issueBulkAssignCount = issueBulkAssignToolbar.querySelector('.issue-bulk-assign-count');
const issueBulkAssignSelectVisible = issueBulkAssignToolbar.querySelector('.issue-bulk-assign-select-visible');
const issueBulkAssignTarget = issueBulkAssignToolbar.querySelector('.issue-bulk-assign-target');
const issueBulkAssignApply = issueBulkAssignToolbar.querySelector('.issue-bulk-assign-apply');
const issueBulkShareApply = issueBulkAssignToolbar.querySelector('.issue-bulk-share-apply');
const issueBulkUnshareApply = issueBulkAssignToolbar.querySelector('.issue-bulk-unshare-apply');
const issueBulkAssignCancel = issueBulkAssignToolbar.querySelector('.issue-bulk-assign-cancel');
let activeUser = null;
let keyboardHintsVisible = loadKeyboardHintsPreference();
let activeWorkspaces = [];
let activeProject = null;
let projectReturnFocusId = null;
let pendingWorkspaceId = null;
let workspacePickerOptionIndex = 0;
const workspaceViewHistory = [];
const projectNavigation = new ProjectNavigationOwner();
const clientSummaryUi = initClientSummaryUi({
    getProject: () => activeProject,
    canOpen: () => activeUser?.role === 'admin' && !projectView.hidden,
    defaultReturnFocus: () => projectHeading,
    onUnauthorized: () => showSignedOut(),
});
const projectNotesUi = initProjectNotesUi({
    getProject: () => activeProject,
    onUnauthorized: () => showSignedOut(),
});
let activeProjectMembers = [];
let projectMilestones = [];
let projectIssues = [];
let bulkMoveSelectionMode = false;
let bulkMovePending = false;
let selectedBulkMoveIssueIds = new Set();
let bulkMoveMilestoneId = null;
let bulkAssignSelectionMode = false;
let bulkSelectionActionPending = false;
let selectedBulkAssignIssueIds = new Set();
let visibleBulkAssignIssueIds = new Set();
let bulkAssignTargetValue = '';
let issueGroupingBeforeNextUp = 'status';
let issueGroupingForcedByNextUp = false;
let deletedProjectIssues = [];
let selectedIssue = null;
const milestoneUi = initMilestoneUi({
    getProject: () => activeProject,
    getMilestones: () => projectMilestones,
    setMilestones: (milestones) => { projectMilestones = milestones; },
    getIssues: () => projectIssues,
    setIssues: (issues) => { projectIssues = issues; },
    getSelectedIssue: () => selectedIssue,
    setSelectedIssue: (issue) => { selectedIssue = issue; },
    populateIssueMilestoneSelect,
    renderProjectIssueBoard,
    renderIssueDetail,
    report,
    onUnauthorized: () => showSignedOut(),
    shouldRestoreFocus: () => !projectView.hidden && activeProject !== null
        && !commandPalette.open && !shortcutHelp.open && !workspacePicker.open,
});
let linkedPullRequests = [];
let issuePullRequestsRequestVersion = 0;
let githubRepositories = [];
let issueAiPromptStepIndex = 0;
let issueAiPromptReturnFocus = null;
let loungeActive = false;
let issuePollTimer = null;
let issuePollDelay = 1000;
let activeIssuesEtag = null;
let deletedIssuesEtag = null;
let deletedIssuesLoadProjectId = null;
let deletedIssuesLoadPromise = null;
let issuePollHasDeferredChanges = false;
let issuePollInFlightProjectId = null;
let issuePollRequestVersion = 0;
let issueStatusHistoryRequestVersion = 0;
let issueDiscussionRequestVersion = 0;
let issueDiscussionPollTimer = null;
let issueDiscussionMessages = [];
let selectedIssueDiscussionMessageId = null;
let issueDiscussionParent = null;
let editingIssueDiscussionMessageId = null;
let confirmingIssueDiscussionDeleteId = null;
const issueRowRenderSignatures = new WeakMap();
const deletedIssueRowRenderSignatures = new WeakMap();
let selectedChatMessageId = null;
let issueQuickAddEscapePending = false;
let issueQuickAddReturnFocus = null;
let issueQuickAddSourceMessageId = null;
let issueQuickAddSourceProjectId = null;
let goPrefixPending = false;
let goPrefixTimer = null;
let statusMessageTimer = null;
let issueStatusPickerIssue = null;
let issueStatusPickerReturnFocus = null;
let issueStatusPickerOptionIndex = 0;
let issueDeleteTarget = null;
let memberRemovalTarget = null;
let paletteCommands = [];
let visiblePaletteCommands = [];
let activePaletteCommandIndex = 0;
const loungePresenceUi = initLoungePresence({
    navigationButton: loungeNavButton,
    getUser: () => activeUser,
    isLoungeActive: () => loungeActive,
    isLoungeVisible: () => !loungeView.hidden,
    isWorkspaceVisible: () => !workspacePanel.hidden,
    isDocumentHidden: () => document.hidden,
    onUnauthorized: () => showSignedOut(),
});
const loungeChatUi = initLoungeChatUi({
    isVisible: () => !loungeView.hidden,
    isDocumentHidden: () => document.hidden,
    getUserId: () => activeUser?.id ?? null,
    onActiveChange: (active) => { loungeActive = active; },
    onSelectionCleared: () => { selectedChatMessageId = null; },
    selectMessage: selectChatMessage,
    onUnauthorized: () => showSignedOut(),
    report,
    presence: loungePresenceUi,
    avatarInitials,
    compactMessage: compactChatMessage,
    submitFormOnEnter,
});
const projectChatUi = initProjectChatUi({
    getProject: () => activeProject,
    getMembers: () => activeProjectMembers,
    getUser: () => activeUser,
    isDocumentHidden: () => document.hidden,
    selectMessage: selectChatMessage,
    onClearSelection: () => { selectedChatMessageId = null; },
    onCreateIssue: (message, trigger) => beginCreateIssueFromChatMessage(message, trigger),
    onUnauthorized: () => showSignedOut(),
    report,
    avatarInitials,
    compactMessage: compactChatMessage,
    submitFormOnEnter,
});
const inboxUi = initInboxUi({
    isVisible: () => !workspacePanel.hidden && !inboxView.hidden,
    isDocumentHidden: () => document.hidden,
    onUnauthorized: () => showSignedOut(),
    report,
    onOpenEvent: (event) => { void openInboxEvent(event); },
    onOpenIssue: (issue) => { void openInboxIssue(issue); },
    issueStatusLabel,
    issueTypeLabel,
    issuePriorityLabel,
    formatDueDate: formatIssueDueDate,
    isIssueOverdue,
    createDiscussionIndicator,
});
const workspaceAdminUi = initWorkspaceAdminUi({
    getUser: () => activeUser,
    isVisible: () => !adminView.hidden,
    report,
});
const authUi = initAuthUi({
    onSignedIn: showSignedIn,
    loadWorkspaces,
    loadProjects,
    report,
});
const guestUi = initGuestUi({
    getUser: () => activeUser,
    getProject: () => activeProject,
    getProjectMembers: () => activeProjectMembers,
    getProjectHeading: () => projectHeading,
    onGuestMode: () => {
        loginShell.hidden = true;
        loginPanel.hidden = true;
        workspacePanel.hidden = true;
        accountBar.hidden = true;
        guestWorkspaceSwitcher.hidden = false;
        guestLogoutButton.hidden = false;
        guestLogoutButton.textContent = 'Sign out';
        updateKeyboardHintsVisibility();
        document.body.classList.add('is-guest');
    },
    onPreviewOpened: () => {
        workspacePanel.hidden = true;
        accountBar.hidden = true;
        guestWorkspaceSwitcher.hidden = true;
        guestLogoutButton.hidden = true;
        updateKeyboardHintsVisibility();
        projectKeyboardHints.hidden = true;
        document.body.classList.remove('is-project-view');
        document.body.classList.add('is-guest');
    },
    onPreviewClosed: () => {
        document.body.classList.remove('is-guest');
        workspacePanel.hidden = false;
        accountBar.hidden = false;
        guestWorkspaceSwitcher.hidden = true;
        guestLogoutButton.hidden = false;
        updateKeyboardHintsVisibility();
        showWorkspaceView('project');
    },
    onUnauthorized: () => showSignedOut(),
    report,
});
function renderLoginTerminal(message, isError = false) {
    loginStatusMessage.replaceChildren();
    const label = document.createElement('span');
    label.className = 'login-terminal-label';
    label.textContent = message === '' ? 'READY.' : isError ? 'SIGN-IN FAILED.' : 'NOTICE.';
    const line = document.createElement('span');
    line.className = 'login-terminal-line';
    const prompt = document.createElement('span');
    prompt.setAttribute('aria-hidden', 'true');
    prompt.textContent = '>';
    line.append(prompt);
    let text = null;
    if (message === '') {
        const cursor = document.createElement('span');
        cursor.className = 'login-terminal-cursor';
        cursor.setAttribute('aria-hidden', 'true');
        line.append(cursor);
    }
    else {
        text = document.createElement('span');
        text.className = 'status-message-text';
        text.textContent = message;
        line.append(text);
    }
    loginStatusMessage.append(label, line);
    return text;
}
function report(message, isError = false) {
    if (guestUi.isShellVisible()) {
        guestUi.setStatus(message, isError);
        return;
    }
    if (statusMessageTimer !== null)
        window.clearTimeout(statusMessageTimer);
    statusMessageTimer = null;
    const target = workspacePanel.hidden ? loginStatusMessage : statusMessage;
    if (target === statusMessage)
        moveWorkspaceStatusToCurrentHeading();
    target.replaceChildren();
    target.classList.toggle('error', isError);
    const text = target === loginStatusMessage
        ? renderLoginTerminal(message, isError)
        : message === '' ? null : document.createElement('span');
    if (target !== loginStatusMessage && text !== null) {
        text.className = 'status-message-text';
        text.textContent = message;
        target.append(text);
    }
    if (message === '')
        return;
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
            if (text !== null && target.contains(text)) {
                if (target === loginStatusMessage)
                    renderLoginTerminal('');
                else
                    target.replaceChildren();
                target.classList.remove('error');
            }
            statusMessageTimer = null;
        }, 4_000);
    }
}
function updateKeyboardHintsVisibility() {
    keyboardHints.hidden = !keyboardHintsVisible
        || activeUser === null
        || activeUser.role === 'guest'
        || workspacePanel.hidden;
}
function toggleKeyboardHints() {
    if (activeUser === null || activeUser.role === 'guest' || workspacePanel.hidden)
        return;
    keyboardHintsVisible = !keyboardHintsVisible;
    try {
        window.localStorage.setItem(KEYBOARD_HINTS_STORAGE_KEY, String(keyboardHintsVisible));
    }
    catch {
        /* Storage can be blocked; the choice then lasts for this page only. */
    }
    updateKeyboardHintsVisibility();
}
function invalidateProjectNavigation(sessionChanged = false) {
    if (sessionChanged)
        projectNavigation.changeSession();
    else
        projectNavigation.invalidate();
}
function showSignedOut() {
    invalidateProjectNavigation(true);
    authUi.resetForms();
    workspaceViewHistory.length = 0;
    projectReturnFocusId = null;
    issueQuickAddSourceMessageId = null;
    issueQuickAddSourceProjectId = null;
    issueQuickAddReturnFocus = null;
    stopIssuePolling();
    clearIssueDiscussion();
    inboxUi.reset();
    resetPendingWorkspaceSwitch();
    projectChatUi.stop();
    loungeChatUi.stop();
    loungePresenceUi.reset();
    if (clientSummaryUi.dialog.open)
        clientSummaryUi.close();
    activeUser = null;
    githubRepositories = [];
    projectGithubRepository.replaceChildren(new Option('No repository connected', ''));
    projectEditGithubRepository.replaceChildren(new Option('No repository connected', ''));
    githubProjectSelectionStatus.textContent = '';
    githubProjectEditStatus.textContent = '';
    connectGithubCreateButton.hidden = true;
    connectGithubEditButton.hidden = true;
    editProjectButton.hidden = true;
    if (projectEditDialog.open)
        projectEditDialog.close();
    activeProject = null;
    activeProjectMembers = [];
    selectedIssue = null;
    activeWorkspaces = [];
    workspaceSwitcherLabel.textContent = 'Choose workspace';
    workspaceSwitcher.setAttribute('aria-label', 'Choose workspace');
    workspaceSwitcher.disabled = true;
    guestWorkspaceSwitcherLabel.textContent = 'Choose workspace';
    guestWorkspaceSwitcher.setAttribute('aria-label', 'Choose workspace');
    guestWorkspaceSwitcher.disabled = true;
    guestWorkspaceSwitcher.hidden = true;
    loginShell.hidden = false;
    loginPanel.hidden = false;
    workspacePanel.hidden = true;
    accountBar.hidden = true;
    updateKeyboardHintsVisibility();
    projectKeyboardHints.hidden = true;
    clearGoPrefix();
    document.body.classList.remove('is-project-view', 'is-guest');
    guestUi.reset();
    guestLogoutButton.hidden = false;
    projectList.replaceChildren();
    projectSidebarList.replaceChildren();
    issueList.replaceChildren();
    chatView.replaceChildren();
    report('');
}
function showSignedIn(user) {
    invalidateProjectNavigation(true);
    workspaceViewHistory.length = 0;
    projectReturnFocusId = null;
    activeProject = null;
    loungeChatUi.stop();
    loungePresenceUi.reset();
    activeUser = user;
    guestWorkspaceSwitcher.hidden = user.role !== 'guest';
    editProjectButton.hidden = user.role !== 'admin';
    roadmapNavButton.hidden = user.role === 'guest';
    resetPendingWorkspaceSwitch();
    if (user.role === 'guest') {
        void guestUi.showGuestShell(user);
        return;
    }
    guestUi.reset();
    loginShell.hidden = true;
    loginPanel.hidden = true;
    workspacePanel.hidden = false;
    accountBar.hidden = false;
    updateKeyboardHintsVisibility();
    currentUserLabel.textContent = `${user.name} · ${user.role}`;
    adminNavButton.hidden = user.role !== 'admin';
    toggleProjectFormButton.hidden = user.role !== 'admin';
    showWorkspaceView('projects');
    void loungePresenceUi.pollWorkspacePresence();
    if (user.role === 'admin')
        void loadGithubRepositories();
    report('');
}
async function loadWorkspaces() {
    resetPendingWorkspaceSwitch();
    const result = await api('/workspaces');
    activeWorkspaces = result.workspaces;
    renderWorkspaceSwitcher();
}
async function switchWorkspace(workspaceId, restoreSwitcherFocus = false) {
    resetPendingWorkspaceSwitch();
    if (activeUser === null || workspaceId === activeUser.workspace_id)
        return;
    workspaceSwitcher.disabled = true;
    guestWorkspaceSwitcher.disabled = true;
    try {
        const result = await switchWorkspaceMembership(activeUser, workspaceId, (targetWorkspaceId) => api(`/workspaces/${targetWorkspaceId}/switch`, {
            method: 'POST',
            body: JSON.stringify({}),
        }), showSignedIn, loadWorkspaces, loadProjects);
        if (result === null)
            return;
        report(`Switched to ${result.workspace.name}.`);
    }
    catch (error) {
        renderWorkspaceSwitcher();
        report(error instanceof Error ? error.message : 'Could not switch workspace.', true);
    }
    finally {
        renderWorkspaceSwitcher();
        const switcher = activeUser?.role === 'guest' ? guestWorkspaceSwitcher : workspaceSwitcher;
        if (restoreSwitcherFocus && !switcher.disabled)
            switcher.focus();
    }
}
function renderWorkspaceSwitcher() {
    const currentName = activeWorkspaces.find((workspace) => workspace.id === activeUser?.workspace_id)?.name
        ?? 'Choose workspace';
    workspaceSwitcherLabel.textContent = currentName;
    workspaceSwitcher.setAttribute('aria-label', `Choose workspace. Current workspace: ${currentName}.`);
    workspaceSwitcher.disabled = activeWorkspaces.length < 2;
    guestWorkspaceSwitcherLabel.textContent = currentName;
    guestWorkspaceSwitcher.setAttribute('aria-label', `Choose workspace. Current workspace: ${currentName}.`);
    guestWorkspaceSwitcher.disabled = activeWorkspaces.length < 2;
    workspaceSwitchHint.hidden = activeWorkspaces.length < 2;
}
function resetPendingWorkspaceSwitch() {
    pendingWorkspaceId = null;
    if (workspacePicker.open)
        workspacePicker.close();
}
function updateWorkspacePickerSelection(index) {
    const workspace = activeWorkspaces[index];
    if (workspace === undefined)
        return;
    workspacePickerOptionIndex = index;
    pendingWorkspaceId = workspace.id;
    const currentName = activeWorkspaces.find((candidate) => candidate.id === activeUser?.workspace_id)?.name ?? 'Current workspace';
    workspacePickerDescription.textContent = `Current: ${currentName}. Proposed: ${workspace.name}.`;
    workspacePickerConfirm.disabled = workspace.id === activeUser?.workspace_id;
    workspacePickerConfirm.textContent = workspacePickerConfirm.disabled ? 'Already in this workspace' : `Switch to ${workspace.name}`;
    const options = Array.from(workspacePickerOptions.querySelectorAll('.workspace-picker-option'));
    options.forEach((option, optionIndex) => {
        const active = optionIndex === index;
        option.classList.toggle('is-active', active);
        option.setAttribute('aria-selected', String(active));
        option.tabIndex = active ? 0 : -1;
    });
    options[index]?.focus();
}
function stageWorkspaceSwitch(workspaceId) {
    const index = activeWorkspaces.findIndex((workspace) => workspace.id === workspaceId);
    if (index >= 0)
        updateWorkspacePickerSelection(index);
}
function openWorkspacePicker(proposedWorkspaceId) {
    if (activeUser === null || activeWorkspaces.length < 2)
        return;
    if (workspacePicker.open) {
        resetPendingWorkspaceSwitch();
        return;
    }
    const currentWorkspaceId = activeUser.workspace_id;
    pendingWorkspaceId = currentWorkspaceId;
    workspacePickerOptionIndex = 0;
    workspacePickerOptions.replaceChildren();
    activeWorkspaces.forEach((workspace, index) => {
        const option = document.createElement('button');
        option.className = 'button workspace-picker-option';
        option.type = 'button';
        option.setAttribute('role', 'option');
        option.dataset.workspaceId = String(workspace.id);
        const name = document.createElement('span');
        name.textContent = workspace.name;
        option.append(name);
        if (workspace.id === currentWorkspaceId) {
            const current = document.createElement('span');
            current.className = 'workspace-picker-current';
            current.textContent = 'Current';
            option.append(current);
        }
        option.addEventListener('click', () => stageWorkspaceSwitch(workspace.id));
        workspacePickerOptions.append(option);
        if (workspace.id === currentWorkspaceId)
            workspacePickerOptionIndex = index;
    });
    const proposedIndex = activeWorkspaces.findIndex((workspace) => workspace.id === proposedWorkspaceId);
    if (proposedIndex >= 0)
        workspacePickerOptionIndex = proposedIndex;
    workspacePicker.showModal();
    updateWorkspacePickerSelection(workspacePickerOptionIndex);
}
function commitPendingWorkspaceSwitch() {
    const workspaceId = pendingWorkspaceId;
    pendingWorkspaceId = null;
    if (workspacePicker.open)
        workspacePicker.close();
    if (workspaceId === null || activeUser === null || workspaceId === activeUser.workspace_id)
        return;
    void switchWorkspace(workspaceId, true);
}
function moveWorkspaceStatusToCurrentHeading() {
    const currentView = Array.from(workspacePanel.querySelectorAll('.workspace-view'))
        .find((view) => !view.hidden);
    const heading = currentView?.querySelector('.page-heading');
    if (heading !== undefined && heading !== null && statusMessage.parentElement !== heading) {
        heading.append(statusMessage);
    }
}
function showWorkspaceView(view) {
    if (view !== 'project')
        invalidateProjectNavigation();
    const wasLoungeActive = view !== 'lounge' && loungeActive;
    if (view !== 'inbox') {
        inboxUi.clearForNavigation();
    }
    if (view !== 'lounge')
        loungeChatUi.stop();
    if (view !== 'project') {
        if (activeProject !== null)
            projectReturnFocusId = activeProject.id;
        projectChatUi.stop();
        stopIssuePolling();
        clearIssueDiscussion();
        activeProject = null;
        activeProjectMembers = [];
        selectedIssue = null;
        issueDetailEditForm.hidden = true;
        issueDetailDisplay.hidden = false;
    }
    projectsView.hidden = view !== 'projects';
    roadmapView.hidden = view !== 'roadmap';
    inboxView.hidden = view !== 'inbox';
    loungeView.hidden = view !== 'lounge';
    adminView.hidden = view !== 'admin';
    projectView.hidden = view !== 'project';
    projectChatColumn.hidden = view !== 'project';
    moveWorkspaceStatusToCurrentHeading();
    workspaceNav.hidden = false;
    updateKeyboardHintsVisibility();
    projectKeyboardHints.hidden = view !== 'project';
    breadcrumbProjectsButton.hidden = view === 'projects';
    breadcrumbDivider.hidden = view === 'projects';
    breadcrumbCurrent.textContent = view === 'project'
        ? activeProject?.name ?? 'Project'
        : view === 'admin' ? 'Administration' : view === 'inbox' ? 'My Work' : view === 'lounge' ? 'Lounge' : view === 'roadmap' ? 'Roadmap' : 'Projects';
    document.body.classList.toggle('is-project-view', view === 'project');
    projectsNavButton.classList.toggle('is-active', view === 'projects');
    roadmapNavButton.classList.toggle('is-active', view === 'roadmap');
    inboxNavButton.classList.toggle('is-active', view === 'inbox');
    loungeNavButton.classList.toggle('is-active', view === 'lounge');
    adminNavButton.classList.toggle('is-active', view === 'admin');
    projectSidebarList.querySelectorAll('.project-sidebar-link').forEach((button) => {
        button.classList.toggle('is-active', view === 'project' && button.dataset.projectId === String(activeProject?.id));
    });
    for (const button of [projectsNavButton, roadmapNavButton, inboxNavButton, loungeNavButton, adminNavButton]) {
        button.removeAttribute('aria-current');
    }
    const activeNavButton = view === 'projects' ? projectsNavButton
        : view === 'roadmap' ? roadmapNavButton
            : view === 'inbox' ? inboxNavButton
                : view === 'lounge' ? loungeNavButton
                    : view === 'admin' ? adminNavButton
                        : null;
    activeNavButton?.setAttribute('aria-current', 'page');
    if (view === 'projects' && projectReturnFocusId !== null) {
        const projectId = projectReturnFocusId;
        projectReturnFocusId = null;
        if (!focusProjectOpenButton(projectId))
            projectsNavButton.focus();
    }
    if (wasLoungeActive)
        void loungePresenceUi.pollWorkspacePresence();
}
function openWorkspaceAdmin() {
    const currentLocation = currentWorkspaceLocation();
    if (currentLocation.view !== 'admin')
        workspaceViewHistory.push(currentLocation);
    showWorkspaceView('admin');
    workspaceAdminUi.open();
    adminHeading.focus();
}
function switchWorkspaceAdminTab(tab) {
    workspaceAdminUi.switchTab(tab);
}
function currentWorkspaceLocation() {
    if (!projectView.hidden && activeProject !== null) {
        return {
            view: 'project',
            projectId: activeProject.id,
            tab: !projectNotesUi.view.hidden ? 'notes' : membersView.hidden ? 'issues' : 'members',
        };
    }
    if (!inboxView.hidden)
        return { view: 'inbox' };
    if (!roadmapView.hidden)
        return { view: 'roadmap' };
    if (!loungeView.hidden)
        return { view: 'lounge' };
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
    if (left.view === 'lounge' && right.view === 'lounge')
        return true;
    return left.view === right.view;
}
function goToProjects() {
    workspaceViewHistory.length = 0;
    showWorkspaceView('projects');
}
function goToRoadmap() {
    if (activeUser === null || activeUser.role === 'guest')
        return;
    const currentLocation = currentWorkspaceLocation();
    if (currentLocation.view !== 'roadmap')
        workspaceViewHistory.push(currentLocation);
    showWorkspaceView('roadmap');
    roadmapHeading.focus();
    void loadRoadmap();
}
function goToInbox() {
    const currentLocation = currentWorkspaceLocation();
    if (currentLocation.view !== 'inbox')
        workspaceViewHistory.push(currentLocation);
    showWorkspaceView('inbox');
    inboxHeading.focus();
    inboxUi.load();
}
function goToLounge() {
    const currentLocation = currentWorkspaceLocation();
    if (currentLocation.view !== 'lounge')
        workspaceViewHistory.push(currentLocation);
    showWorkspaceView('lounge');
    loungeHeading.focus();
    loungeChatUi.load();
}
function goBackWorkspaceView() {
    const currentLocation = currentWorkspaceLocation();
    if (currentLocation.view === 'projects')
        return;
    const previousLocation = workspaceViewHistory.pop();
    if (previousLocation?.view === 'project') {
        void loadProjectDetail(previousLocation.projectId, previousLocation.tab, false);
    }
    else if (previousLocation?.view === 'inbox') {
        showWorkspaceView('inbox');
        inboxHeading.focus();
        inboxUi.load();
    }
    else if (previousLocation?.view === 'roadmap') {
        showWorkspaceView('roadmap');
        roadmapHeading.focus();
        void loadRoadmap();
    }
    else if (previousLocation?.view === 'lounge') {
        showWorkspaceView('lounge');
        loungeHeading.focus();
        void loungeChatUi.load();
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
function pauseIssuePolling() {
    if (issuePollTimer !== null)
        window.clearTimeout(issuePollTimer);
    issuePollTimer = null;
    issuePollRequestVersion += 1;
    issuePollInFlightProjectId = null;
}
function stopIssuePolling(resetState = true) {
    pauseIssuePolling();
    if (!resetState)
        return;
    issuePollDelay = 1000;
    activeIssuesEtag = null;
    deletedIssuesEtag = null;
    issuePollHasDeferredChanges = false;
}
function resumeDeferredIssuePolling() {
    const projectId = activeProject?.id;
    if (issuePollHasDeferredChanges && projectId !== undefined && issuePollingIsActive(projectId)
        && !issueUpdatesAreDeferred()) {
        issuePollDelay = 1000;
        scheduleIssuePoll(0);
    }
}
function issuePollingIsActive(projectId) {
    return activeProject?.id === projectId && !projectView.hidden
        && (!issuesView.hidden || !issueDetailView.hidden);
}
function issueUpdatesAreDeferred() {
    const dialogOpen = issueStatusPicker.open || issueDeleteConfirmation.open
        || memberRemovalConfirmation.open || workspaceAdminUi.hasOpenDialog()
        || milestoneUi.deleteConfirmation.open || milestoneUi.managerDialog.open;
    return shouldDeferIssueUpdates({
        issueEditorOpen: !issueDetailEditForm.hidden,
        quickAddActive: issueForm.classList.contains('is-active') || issueQuickAddHasDraft(),
        filterFocused: document.activeElement === issueFilter,
        dialogOpen,
    });
}
async function fetchConditionalIssueList(projectId, deleted, etag) {
    const headers = new Headers();
    if (etag !== null)
        headers.set('If-None-Match', etag);
    const suffix = deleted ? '/deleted' : '';
    const response = await fetch(`${apiBaseUrl}/projects/${projectId}/issues${suffix}`, {
        headers,
        credentials: 'same-origin',
    });
    const responseEtag = response.headers.get('ETag') ?? etag;
    if (response.status === 304)
        return { issues: null, etag: responseEtag };
    const payload = await response.json();
    if (!response.ok) {
        throw new ApiFailure(payload.error?.message ?? 'Could not load project issues.', response.status);
    }
    return { issues: payload.issues ?? [], etag: responseEtag };
}
function scheduleIssuePoll(delay = issuePollDelay) {
    const projectId = activeProject?.id;
    if (projectId === undefined || !issuePollingIsActive(projectId)) {
        pauseIssuePolling();
        return;
    }
    if (issuePollTimer !== null)
        window.clearTimeout(issuePollTimer);
    issuePollTimer = window.setTimeout(() => {
        issuePollTimer = null;
        void pollProjectIssues(projectId);
    }, delay);
}
async function pollProjectIssues(projectId) {
    if (!issuePollingIsActive(projectId))
        return;
    if (issuePollInFlightProjectId === projectId)
        return;
    if (document.hidden) {
        issuePollDelay = nextIssuePollDelay(issuePollDelay, false, true);
        scheduleIssuePoll(issuePollDelay);
        return;
    }
    const deferUpdatesAtStart = issueUpdatesAreDeferred();
    const forceDeferredRefresh = issuePollHasDeferredChanges && !deferUpdatesAtStart;
    const activeEtag = forceDeferredRefresh ? null : activeIssuesEtag;
    const deletedEtag = forceDeferredRefresh ? null : deletedIssuesEtag;
    const requestVersion = ++issuePollRequestVersion;
    issuePollInFlightProjectId = projectId;
    let changed = false;
    try {
        const collections = await loadIssueCollections(() => fetchConditionalIssueList(projectId, false, activeEtag), () => fetchConditionalIssueList(projectId, true, deletedEtag), deletedIssuesDetails.open);
        const activeResult = collections.active;
        const deletedResult = collections.deleted ?? { issues: null, etag: deletedIssuesEtag };
        if (requestVersion !== issuePollRequestVersion || !issuePollingIsActive(projectId))
            return;
        const deferUpdates = deferUpdatesAtStart || issueUpdatesAreDeferred();
        const diffs = diffConditionalIssueCollections(projectIssues, activeResult.issues, deletedProjectIssues, deletedResult.issues);
        const activeDiff = diffs.active;
        const changedIssueIds = activeDiff === null
            ? []
            : [...activeDiff.added, ...activeDiff.changed, ...activeDiff.removed];
        const deletedDiff = diffs.deleted;
        const changedDeletedIssueIds = deletedDiff === null
            ? []
            : [...deletedDiff.added, ...deletedDiff.changed, ...deletedDiff.removed];
        changed = changedIssueIds.length > 0 || changedDeletedIssueIds.length > 0;
        activeIssuesEtag = activeResult.etag;
        if (collections.deleted !== null)
            deletedIssuesEtag = deletedResult.etag;
        if (deferUpdates && changed) {
            issuePollHasDeferredChanges = true;
        }
        else if (!deferUpdates) {
            if (activeResult.issues !== null)
                projectIssues = activeResult.issues;
            if (deletedResult.issues !== null)
                deletedProjectIssues = deletedResult.issues;
            issuePollHasDeferredChanges = false;
            if (changed) {
                if (selectedIssue !== null) {
                    const selectedIssueId = selectedIssue.id;
                    const previousSelectedStatus = selectedIssue.status;
                    const refreshedSelectedIssue = projectIssues.find((issue) => issue.id === selectedIssueId);
                    if (refreshedSelectedIssue !== undefined) {
                        selectedIssue = refreshedSelectedIssue;
                        if (activeDiff?.added.includes(selectedIssueId) || activeDiff?.changed.includes(selectedIssueId)) {
                            renderIssueDetail();
                            if (previousSelectedStatus !== refreshedSelectedIssue.status) {
                                void loadIssueStatusHistory(selectedIssueId);
                            }
                        }
                    }
                    else if (!issueDetailView.hidden) {
                        selectedIssue = null;
                        issueDetailView.hidden = true;
                        issuesView.hidden = false;
                        issueFilter.focus();
                    }
                }
                renderProjectIssueBoard();
            }
        }
        issuePollDelay = nextIssuePollDelay(issuePollDelay, changed && !deferUpdates, false);
    }
    catch (error) {
        if (error instanceof ApiFailure && error.status === 401) {
            showSignedOut();
            return;
        }
        report(error instanceof Error ? error.message : 'Could not refresh project issues.', true);
        issuePollDelay = nextIssuePollDelay(issuePollDelay, false, false);
    }
    finally {
        if (requestVersion === issuePollRequestVersion) {
            if (issuePollInFlightProjectId === projectId)
                issuePollInFlightProjectId = null;
            const readyToApplyDeferredChanges = issuePollHasDeferredChanges && !issueUpdatesAreDeferred();
            if (readyToApplyDeferredChanges)
                issuePollDelay = 1000;
            if (issuePollingIsActive(projectId))
                scheduleIssuePoll(readyToApplyDeferredChanges ? 0 : issuePollDelay);
        }
    }
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
function issueSelectedInVisibleView() {
    if (selectedIssue !== null)
        return selectedIssue;
    const titleButton = selectedIssueButton();
    const issueId = Number(titleButton?.closest('.issue-card')?.dataset.issueId);
    return projectIssues.find((issue) => issue.id === issueId) ?? null;
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
    const list = projectChatUi.messageList();
    if (list === null)
        return null;
    const messages = Array.from(list.querySelectorAll('.chat-message'))
        .filter((message) => Number(message.dataset.messageId) > 0);
    return messages.at(-1)?.querySelector('.chat-create-issue-button:not(:disabled)') ?? null;
}
function activeChatMessageList() {
    return loungeView.hidden ? projectChatUi.messageList() : loungeMessageList;
}
function activeChatMessagesById() {
    return loungeView.hidden ? projectChatUi.messagesById() : loungeChatUi.messagesById();
}
function focusActiveChatComposer() {
    if (loungeView.hidden)
        projectChatUi.focusComposer();
    else
        loungeChatUi.focusComposer();
}
function chatMessageElements() {
    const list = activeChatMessageList();
    if (list === null)
        return [];
    return Array.from(list.querySelectorAll('.chat-message'))
        .filter((message) => Number(message.dataset.messageId) > 0);
}
function selectChatMessage(id, focus = true) {
    const list = activeChatMessageList();
    const item = list?.querySelector(`.chat-message[data-message-id="${id}"]`);
    if (item === null || item === undefined)
        return;
    selectedChatMessageId = id;
    if (loungeView.hidden)
        projectChatUi.setFollowLatest(chatMessageElements().at(-1) === item);
    else
        loungeChatUi.setFollowLatest(chatMessageElements().at(-1) === item);
    list?.querySelectorAll('.chat-message').forEach((message) => {
        message.classList.toggle('is-keyboard-selected', message === item);
    });
    if (focus)
        item.focus();
}
function moveChatMessageSelection(direction) {
    const messages = chatMessageElements();
    if (messages.length === 0) {
        focusActiveChatComposer();
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
function moveChatMessageSelectionToBoundary(edge) {
    const messages = chatMessageElements();
    const target = messages[edge === 'first' ? 0 : messages.length - 1];
    if (target !== undefined)
        selectChatMessage(Number(target.dataset.messageId));
}
function moveChatMessageSelectionByPage(direction) {
    const messages = chatMessageElements();
    const list = activeChatMessageList();
    if (messages.length === 0 || list === null)
        return;
    const currentIndex = messages.findIndex((message) => Number(message.dataset.messageId) === selectedChatMessageId);
    const pageSize = Math.max(1, visibleRowsInViewport(messages, list, '.chat-message') - 1);
    const baseIndex = currentIndex < 0
        ? direction > 0 ? 0 : Math.min(pageSize, messages.length - 1)
        : currentIndex;
    const targetIndex = Math.max(0, Math.min(messages.length - 1, baseIndex + direction * pageSize));
    const target = messages[targetIndex];
    if (target !== undefined)
        selectChatMessage(Number(target.dataset.messageId));
}
function focusProjectChat() {
    const messages = chatMessageElements();
    const latest = messages.at(-1);
    if (latest !== undefined) {
        selectChatMessage(Number(latest.dataset.messageId));
    }
    else {
        projectChatUi.focusComposer();
    }
}
function replyToSelectedChatMessage() {
    if (selectedChatMessageId === null || selectedChatMessageId <= 0)
        return;
    const message = activeChatMessagesById().get(selectedChatMessageId);
    if (message === undefined)
        return;
    if (loungeView.hidden)
        projectChatUi.setReplyParent(message);
    else
        loungeChatUi.setReplyParent(message);
}
function createIssueFromSelectedChatMessage() {
    if (selectedChatMessageId !== null) {
        const selectedButton = projectChatUi.messageList()
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
    clearIssueDiscussion();
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
function goToProjectNotes() {
    if (activeProject === null)
        return;
    switchProjectTab('notes');
    notesTabButton.focus();
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
        canToggleKeyboardHints: activeUser !== null && activeUser.role !== 'guest' && !workspacePanel.hidden,
        canSwitchWorkspace: activeWorkspaces.length > 1,
        canAdmin: activeUser?.role === 'admin',
        canRoadmap: activeUser?.role === 'admin' || activeUser?.role === 'developer',
        hasProject: activeProject !== null && !projectView.hidden,
        projectListVisible: !workspacePanel.hidden && !projectsView.hidden,
        inboxListVisible: !workspacePanel.hidden && !inboxView.hidden,
        hasSelectedInboxIssue: inboxUi.hasSelectedIssue(),
        issueFilterFocused: target === issueFilter,
        hasSelectedProject: selectedProjectButton() !== null,
        issueListVisible: !projectView.hidden && !issuesView.hidden,
        issueDetailVisible: !projectView.hidden && !issueDetailView.hidden,
        hasSelectedIssue: hasSelectedIssueInVisibleView(),
        hasLatestChatMessage: latestChatIssueButton() !== null,
        chatMessagesFocused: target instanceof HTMLElement
            && target.closest('.chat-message') !== null,
        hasSelectedChatMessage: selectedChatMessageId !== null && selectedChatMessageId > 0
            && activeChatMessagesById().has(selectedChatMessageId),
        canCreateIssueFromChatMessage: loungeView.hidden,
        issueDiscussionMessagesFocused: target instanceof HTMLElement
            && target.closest('.issue-discussion-message') !== null,
        hasSelectedIssueDiscussionMessage: selectedIssueDiscussionMessageId !== null
            && issueDiscussionMessages.some((message) => message.id === selectedIssueDiscussionMessageId),
        issueGroupFocused: target instanceof HTMLElement && target.closest('.issue-group > summary') !== null,
        statusHistoryFocused: issueStatusHistory.open && issueStatusHistory.contains(document.activeElement),
        textInputFocused: shouldBlurOnEscape(target),
        modalOpen: commandPalette.open || clientSummaryUi.dialog.open || shortcutHelp.open || issueAiPromptDialog.open || issueStatusPicker.open || issueDeleteConfirmation.open || themeUi.aboutDialog.open || projectEditDialog.open
            || memberRemovalConfirmation.open || workspaceAdminUi.hasOpenDialog() || milestoneUi.deleteConfirmation.open || milestoneUi.managerDialog.open
            || workspacePicker.open,
        canDismiss: commandPalette.open || shortcutHelp.open || (!workspacePanel.hidden && (pendingWorkspaceId !== null
            || (!projectView.hidden && (!issueDetailView.hidden || !issueDetailEditForm.hidden
                || issueQuickAddEscapePending || projectChatUi.hasReplyParent()))
            || (!loungeView.hidden && loungeChatUi.hasReplyParent())
            || (!projectsView.hidden && !projectFormPanel.hidden)
            || !projectView.hidden || !roadmapView.hidden || !inboxView.hidden || !loungeView.hidden || !adminView.hidden)),
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
    goPrefixWorkspaceOption.hidden = activeWorkspaces.length < 2;
    goPrefixProjectOptions.hidden = activeProject === null || projectView.hidden;
    adminGoPrefixOption.hidden = activeUser?.role !== 'admin';
    roadmapGoPrefixOption.hidden = activeUser?.role === 'guest' || activeUser === null;
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
function visibleRowsInViewport(items, viewport, rowSelector) {
    const viewportRect = viewport.getBoundingClientRect();
    const viewportTop = viewportRect.top + viewport.clientTop;
    const viewportBottom = viewportTop + viewport.clientHeight;
    return items.filter((item) => {
        const row = item.closest(rowSelector);
        if (row === null)
            return false;
        const rowRect = row.getBoundingClientRect();
        return rowRect.bottom > viewportTop && rowRect.top < viewportBottom;
    }).length;
}
function moveFocusByPage(buttons, rowSelector, viewport, direction) {
    if (buttons.length === 0)
        return;
    const focused = document.activeElement;
    const currentIndex = buttons.findIndex((button) => {
        const row = button.closest(rowSelector);
        return row?.classList.contains('is-keyboard-selected') === true
            || (focused instanceof HTMLElement && row?.contains(focused) === true);
    });
    const pageSize = Math.max(1, visibleRowsInViewport(buttons, viewport, rowSelector) - 1);
    const baseIndex = currentIndex < 0
        ? direction > 0 ? 0 : Math.min(pageSize, buttons.length - 1)
        : currentIndex;
    const targetIndex = Math.max(0, Math.min(buttons.length - 1, baseIndex + direction * pageSize));
    for (const button of buttons)
        button.closest(rowSelector)?.classList.remove('is-keyboard-selected');
    const target = buttons[targetIndex];
    if (target === undefined)
        return;
    target.closest(rowSelector)?.classList.add('is-keyboard-selected');
    target.focus();
}
function moveFocusToBoundary(buttons, rowSelector, edge) {
    if (buttons.length === 0)
        return;
    for (const button of buttons)
        button.closest(rowSelector)?.classList.remove('is-keyboard-selected');
    const target = buttons[edge === 'first' ? 0 : buttons.length - 1];
    target.closest(rowSelector)?.classList.add('is-keyboard-selected');
    target.focus();
}
function moveIssueSelection(direction) {
    if (!inboxView.hidden) {
        moveFocusWithin(inboxUi.visibleIssueTitleButtons(), '.inbox-issue-card', direction);
        return;
    }
    if (document.activeElement instanceof HTMLElement
        && document.activeElement.matches('.issue-group > summary')) {
        moveIssueSelectionFromGroup(direction);
        return;
    }
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
function moveIssueSelectionFromGroup(direction) {
    const summary = document.activeElement;
    if (!(summary instanceof HTMLElement))
        return;
    const buttons = visibleIssueTitleButtons();
    const target = direction > 0
        ? buttons.find((button) => (summary.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0)
        : buttons.filter((button) => (summary.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_PRECEDING) !== 0).at(-1);
    if (target === undefined)
        return;
    for (const button of buttons)
        button.closest('.issue-card')?.classList.remove('is-keyboard-selected');
    target.closest('.issue-card')?.classList.add('is-keyboard-selected');
    target.focus();
}
function moveIssueSelectionToBoundary(edge) {
    if (!inboxView.hidden) {
        moveFocusToBoundary(inboxUi.visibleIssueTitleButtons(), '.inbox-issue-card', edge);
        return;
    }
    const buttons = visibleIssueTitleButtons();
    const target = buttons[edge === 'first' ? 0 : buttons.length - 1];
    if (target === undefined)
        return;
    if (!issueDetailView.hidden && selectedIssue !== null) {
        target.click();
        return;
    }
    moveFocusToBoundary(buttons, '.issue-card', edge);
}
function moveProjectSelection(direction) {
    moveFocusWithin(Array.from(projectList.querySelectorAll('.project-card button')), '.project-card', direction);
}
function moveProjectSelectionToBoundary(edge) {
    moveFocusToBoundary(Array.from(projectList.querySelectorAll('.project-card button')), '.project-card', edge);
}
function moveSelectionByPage(direction) {
    if (document.activeElement instanceof HTMLElement && document.activeElement.closest('.chat-message') !== null) {
        moveChatMessageSelectionByPage(direction);
    }
    else if (document.activeElement instanceof HTMLElement
        && document.activeElement.closest('.issue-discussion-message') !== null) {
        moveIssueDiscussionSelectionByPage(direction);
    }
    else if (!projectsView.hidden) {
        moveFocusByPage(Array.from(projectList.querySelectorAll('.project-card button')), '.project-card', projectsView, direction);
    }
    else if (!inboxView.hidden) {
        moveFocusByPage(inboxUi.visibleIssueTitleButtons(), '.inbox-issue-card', inboxView, direction);
    }
    else if (!issuesView.hidden) {
        moveFocusByPage(visibleIssueTitleButtons(), '.issue-card', projectMain, direction);
    }
}
function moveSelection(direction) {
    if (!projectsView.hidden) {
        moveProjectSelection(direction);
    }
    else if (!inboxView.hidden) {
        moveIssueSelection(direction);
    }
    else if (!issuesView.hidden || !issueDetailView.hidden) {
        moveIssueSelection(direction);
    }
}
function beginCreateIssue() {
    if (activeProject === null)
        return;
    clearIssueDiscussion();
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
        openIssueStatusPicker(selectedIssue, issueDetailStatus);
        return;
    }
    const titleButton = selectedIssueButton();
    const row = titleButton?.closest('.issue-card');
    const issueId = Number(row?.dataset.issueId);
    const issue = projectIssues.find((candidate) => candidate.id === issueId);
    if (issue !== undefined && titleButton !== null && titleButton !== undefined) {
        openIssueStatusPicker(issue, titleButton);
    }
}
function createIssueFromLatestMessage() {
    latestChatIssueButton()?.click();
}
function compactChatMessage(body) {
    const normalized = body.replace(/\s+/g, ' ').trim();
    const characters = Array.from(normalized);
    return characters.length > 110 ? `${characters.slice(0, 109).join('').trimEnd()}…` : normalized;
}
function avatarInitials(name) {
    return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase();
}
function beginCreateIssueFromChatMessage(message, trigger) {
    const projectId = activeProject?.id;
    if (projectId === undefined || projectChatUi.activeProjectId() !== projectId)
        return;
    if (issueQuickAddSourceMessageId === message.id && issueQuickAddSourceProjectId === projectId) {
        issueQuickAddTitle.focus();
        return;
    }
    if (issueQuickAddHasDraft()) {
        report('Finish or cancel the current issue draft first.');
        issueQuickAddTitle.focus();
        return;
    }
    issueForm.reset();
    updateOngoingMilestoneControl(issueQuickAddOngoing, issueQuickAddMilestone);
    issueQuickAddSourceMessageId = message.id;
    issueQuickAddSourceProjectId = projectId;
    issueQuickAddReturnFocus = trigger;
    issueQuickAddTitle.value = Array.from(message.body).slice(0, 200).join('');
    issueDescriptionDetails.open = false;
    issueQuickAddEscapePending = false;
    updateIssueQuickAddApproval();
    clearIssueDiscussion();
    selectedIssue = null;
    issueDetailEditForm.hidden = true;
    issueDetailDisplay.hidden = false;
    switchProjectTab('issues');
    setIssueQuickAddActive(true);
    issueQuickAddTitle.focus();
    issueQuickAddTitle.setSelectionRange(issueQuickAddTitle.value.length, issueQuickAddTitle.value.length);
}
function getPaletteCommands() {
    if (activeUser === null)
        return [];
    const commands = [
        { label: 'Go to Projects', detail: 'Open the project list', shortcut: 'g p', run: goToProjects },
        { label: 'Open My Work', detail: 'Review inbox updates and tasks assigned to you', shortcut: 'g n', run: goToInbox },
        { label: 'Open Lounge', detail: 'Open the workspace-wide Lounge chat', shortcut: 'g l', run: goToLounge },
        { label: 'Show keyboard shortcuts', detail: 'View key bindings', shortcut: '?', run: showShortcutHelp },
    ];
    if (activeUser.role !== 'guest' && !workspacePanel.hidden) {
        commands.push({
            label: keyboardHintsVisible ? 'Hide keyboard hints' : 'Show keyboard hints',
            detail: keyboardHintsVisible
                ? 'Hide the shortcut hints along the bottom of the workspace'
                : 'Show the shortcut hints along the bottom of the workspace',
            shortcut: 'h',
            run: toggleKeyboardHints,
        });
    }
    if (activeUser.role === 'admin' || activeUser.role === 'developer') {
        commands.splice(1, 0, {
            label: 'Open Roadmap',
            detail: 'Review milestones across your projects',
            shortcut: 'g r',
            run: goToRoadmap,
        });
    }
    if (activeWorkspaces.length > 1) {
        commands.splice(2, 0, {
            label: 'Switch workspace',
            detail: 'Choose a workspace; Enter switches, Escape cancels',
            shortcut: 'g w',
            run: openWorkspacePicker,
        });
        for (const workspace of activeWorkspaces) {
            if (workspace.id === activeUser.workspace_id)
                continue;
            commands.splice(1, 0, {
                label: `Switch to ${workspace.name}`,
                detail: `Review and confirm switching to ${workspace.name}`,
                shortcut: '',
                run: () => openWorkspacePicker(workspace.id),
            });
        }
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
    if (activeUser.role === 'admin') {
        commands.unshift({
            label: 'Workspace admin',
            detail: 'Open workspace administration',
            shortcut: 'g a',
            run: openWorkspaceAdmin,
        });
        commands.unshift({
            label: 'Create workspace',
            detail: 'Create a workspace for a separate organization',
            shortcut: '',
            run: () => {
                openWorkspaceAdmin();
                switchWorkspaceAdminTab('workspaces');
                createWorkspaceForm.querySelector('input[name="name"]')?.focus();
            },
        });
    }
    if (activeProject !== null && activeUser.role === 'admin' && !projectView.hidden) {
        commands.splice(1, 0, {
            label: 'Generate summary',
            detail: 'Prepare a client-safe summary for ' + activeProject.name,
            shortcut: '',
            run: clientSummaryUi.open,
        }, {
            label: 'Preview guest view',
            detail: 'Preview the client portal for ' + activeProject.name,
            shortcut: '',
            run: () => { void guestUi.openPreview(); },
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
        }, {
            label: 'Project notes',
            detail: `Open notes for ${activeProject.name}`,
            shortcut: '',
            run: goToProjectNotes,
        });
        commands.splice(1, 0, {
            label: 'New issue',
            detail: `Create an issue in ${activeProject.name}`,
            shortcut: 'c',
            run: beginCreateIssue,
        });
        if (hasSelectedIssueInVisibleView()) {
            const issue = issueSelectedInVisibleView();
            commands.splice(2, 0, {
                label: 'Edit selected issue',
                detail: 'Edit the title and description',
                shortcut: 'e',
                run: editSelectedIssue,
            }, {
                label: 'Change issue status',
                detail: 'Choose a status, then save or cancel',
                shortcut: 's',
                run: focusSelectedIssueStatus,
            }, {
                label: 'Delete issue',
                detail: issue === null
                    ? 'Move the selected issue to Deleted issues; it can be restored later'
                    : `Move “${issue.title}” (${issueStatusLabel(issue.status)}) to Deleted issues; it can be restored later`,
                shortcut: '',
                run: () => openIssueDeleteConfirmation(issue),
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
        if (deletedProjectIssues.length > 0) {
            commands.push({
                label: 'Show deleted issues',
                detail: `Jump to ${deletedProjectIssues.length} deleted issue${deletedProjectIssues.length === 1 ? '' : 's'} in ${activeProject.name}`,
                shortcut: '',
                run: () => showDeletedIssues(),
            });
            for (const issue of deletedProjectIssues) {
                commands.push({
                    label: `Restore issue: ${issue.title}`,
                    detail: `Restore it with its previous status (${issueStatusLabel(issue.status)})`,
                    shortcut: '',
                    run: () => showDeletedIssues(issue.id),
                });
            }
        }
    }
    commands.push({
        label: 'Switch theme',
        detail: `Now ${themeLabel(themeUi.getActiveTheme())}; next ${themeLabel(nextTheme(themeUi.getActiveTheme()))}`,
        shortcut: '',
        run: () => themeUi.setTheme(nextTheme(themeUi.getActiveTheme())),
    });
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
    if (activeUser === null || milestoneUi.deleteConfirmButton.disabled)
        return;
    if (themeUi.aboutDialog.open)
        themeUi.aboutDialog.close();
    if (projectEditDialog.open)
        projectEditDialog.close();
    if (workspacePicker.open)
        resetPendingWorkspaceSwitch();
    if (clientSummaryUi.dialog.open)
        clientSummaryUi.close();
    if (issueAiPromptDialog.open)
        issueAiPromptDialog.close();
    if (milestoneUi.deleteConfirmation.open)
        milestoneUi.closeDeleteConfirmation();
    if (milestoneUi.managerDialog.open)
        milestoneUi.close();
    if (issueStatusPicker.open)
        closeIssueStatusPicker();
    if (issueDeleteConfirmation.open)
        closeIssueDeleteConfirmation();
    if (memberRemovalConfirmation.open)
        closeMemberRemovalConfirmation();
    workspaceAdminUi.closeOpenDialogs();
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
    if (activeUser === null || milestoneUi.deleteConfirmButton.disabled)
        return;
    if (workspacePicker.open)
        resetPendingWorkspaceSwitch();
    if (clientSummaryUi.dialog.open)
        clientSummaryUi.close();
    if (issueAiPromptDialog.open)
        issueAiPromptDialog.close();
    if (milestoneUi.deleteConfirmation.open)
        milestoneUi.closeDeleteConfirmation();
    if (milestoneUi.managerDialog.open)
        milestoneUi.close();
    if (issueStatusPicker.open)
        closeIssueStatusPicker();
    if (issueDeleteConfirmation.open)
        closeIssueDeleteConfirmation();
    if (memberRemovalConfirmation.open)
        closeMemberRemovalConfirmation();
    workspaceAdminUi.closeOpenDialogs();
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
    if (milestoneUi.deleteConfirmButton.disabled)
        return;
    if (themeUi.aboutDialog.open) {
        themeUi.aboutDialog.close();
    }
    else if (projectEditDialog.open) {
        projectEditDialog.close();
    }
    else if (workspacePicker.open) {
        resetPendingWorkspaceSwitch();
    }
    else if (clientSummaryUi.dialog.open) {
        clientSummaryUi.close();
    }
    else if (issueAiPromptDialog.open) {
        issueAiPromptDialog.close();
    }
    else if (milestoneUi.deleteConfirmation.open) {
        milestoneUi.closeDeleteConfirmation();
    }
    else if (milestoneUi.managerDialog.open) {
        milestoneUi.close();
    }
    else if (issueDeleteConfirmation.open) {
        closeIssueDeleteConfirmation();
    }
    else if (memberRemovalConfirmation.open) {
        closeMemberRemovalConfirmation();
    }
    else if (workspaceAdminUi.hasOpenDialog()) {
        workspaceAdminUi.closeCurrentDialog();
    }
    else if (issueStatusPicker.open) {
        closeIssueStatusPicker();
    }
    else if (commandPalette.open) {
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
    else if (!workspacePanel.hidden && !projectView.hidden
        && (issueQuickAddEscapePending || issueForm.classList.contains('is-active'))) {
        cancelIssueQuickAdd();
    }
    else if (!workspacePanel.hidden && !loungeView.hidden && loungeChatUi.hasReplyParent()) {
        loungeChatUi.clearReplyParent();
    }
    else if (!workspacePanel.hidden && !projectView.hidden && projectChatUi.hasReplyParent()) {
        projectChatUi.clearReplyParent();
    }
    else if (!workspacePanel.hidden && (!projectView.hidden || !inboxView.hidden || !adminView.hidden)) {
        goBackWorkspaceView();
    }
}
function focusIssueQuickAddReturnTarget() {
    const target = issueQuickAddReturnFocus;
    const dialog = target?.closest('dialog') ?? null;
    if (target !== null && (projectView.contains(target) || projectChatColumn.contains(target))
        && target.isConnected && target.closest('[hidden]') === null
        && (dialog === null || dialog.open)) {
        target.focus();
    }
    else {
        issuesTabButton.focus();
    }
}
function setIssueQuickAddActive(active) {
    issueForm.classList.toggle('is-active', active);
    issueQuickAddCancelButton.hidden = !active;
}
function updateIssueQuickAddApproval() {
    issueQuickAddApproval.disabled = !issueQuickAddShared.checked;
    if (issueQuickAddApproval.disabled)
        issueQuickAddApproval.checked = false;
}
function updateOngoingMilestoneControl(ongoing, milestone) {
    if (ongoing.checked)
        milestone.value = '';
    milestone.disabled = ongoing.checked;
}
function cancelIssueQuickAdd() {
    issueForm.reset();
    updateOngoingMilestoneControl(issueQuickAddOngoing, issueQuickAddMilestone);
    issueQuickAddTitle.setCustomValidity('');
    issueQuickAddSourceMessageId = null;
    issueQuickAddSourceProjectId = null;
    issueDescriptionDetails.open = false;
    issueQuickAddEscapePending = false;
    setIssueQuickAddActive(false);
    updateIssueQuickAddApproval();
    focusIssueQuickAddReturnTarget();
    issueQuickAddReturnFocus = null;
    resumeDeferredIssuePolling();
}
function issueQuickAddHasDraft() {
    const description = issueForm.querySelector('textarea[name="description"]');
    const type = issueForm.querySelector('select[name="type"]');
    return issueQuickAddTitle.value.trim() !== ''
        || (description?.value.trim() ?? '') !== ''
        || (type?.value ?? 'task') !== 'task'
        || issueQuickAddAssignee.value !== ''
        || issueQuickAddMilestone.value !== ''
        || issueQuickAddOngoing.checked
        || issueQuickAddShared.checked
        || issueQuickAddApproval.checked;
}
function closeProjectForm() {
    projectForm.reset();
    projectFormPanel.hidden = true;
    toggleProjectFormButton.focus();
}
function populateGithubRepositorySelect(select, selected = null, unavailableRepository = null) {
    const selectedRepositoryId = selected === null
        ? null
        : 'id' in selected ? selected.id : selected.repository_id;
    const options = [new Option('No repository connected', '')];
    for (const repository of githubRepositories) {
        options.push(new Option(repository.full_name, githubRepositorySelectionValue(repository)));
    }
    if (selected !== null && !githubRepositories.some((repository) => repository.id === selectedRepositoryId && repository.installation_id === selected.installation_id)) {
        if (unavailableRepository?.id === selectedRepositoryId
            && unavailableRepository.installation_id === selected.installation_id) {
            options.push(new Option(`${unavailableRepository.full_name} (access unavailable)`, githubRepositorySelectionValue(unavailableRepository)));
        }
    }
    select.replaceChildren(...options);
    select.value = selected === null ? '' : githubRepositorySelectionValue({
        installation_id: selected.installation_id,
        id: selectedRepositoryId ?? 0,
        owner: selected.owner,
        name: selected.name,
    });
}
async function loadGithubRepositories() {
    if (activeUser?.role !== 'admin')
        return;
    try {
        const result = await api('/github/repositories');
        githubRepositories = result.repositories;
        const createSelected = parseGitHubRepositorySelection(projectGithubRepository.value);
        const editSelected = activeProject?.github_repository
            ?? parseGitHubRepositorySelection(projectEditGithubRepository.value);
        populateGithubRepositorySelect(projectGithubRepository, createSelected);
        populateGithubRepositorySelect(projectEditGithubRepository, editSelected, activeProject?.github_repository ?? null);
        const status = !result.configured
            ? 'GitHub App settings are not configured for this Tangent installation.'
            : !result.can_connect && !result.connected
                ? 'Configure GitHub user authorization before connecting an installation.'
                : !result.connected
                    ? 'Connect a GitHub App installation to choose a repository.'
                    : result.repositories.length === 0
                        ? 'No repositories are available. Check which repositories the GitHub App can access.'
                        : 'Choose a repository available to this workspace.';
        githubProjectSelectionStatus.textContent = status;
        githubProjectEditStatus.textContent = status;
        connectGithubCreateButton.hidden = !result.can_connect;
        connectGithubEditButton.hidden = !result.can_connect;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Could not load GitHub repositories.';
        githubProjectSelectionStatus.textContent = message;
        githubProjectEditStatus.textContent = message;
        connectGithubCreateButton.hidden = false;
        connectGithubEditButton.hidden = false;
    }
}
async function connectGithub() {
    const githubWindow = window.open('about:blank', '_blank');
    if (githubWindow === null) {
        report('Allow pop-up windows to connect a GitHub installation.', true);
        return;
    }
    githubWindow.opener = null;
    try {
        const result = await api('/github/install', { method: 'POST', body: '{}' });
        githubWindow.location.assign(result.url);
    }
    catch (error) {
        githubWindow.close();
        report(error instanceof Error ? error.message : 'Could not start GitHub connection.', true);
    }
}
function openProjectEditDialog() {
    if (activeUser?.role !== 'admin' || activeProject === null)
        return;
    projectEditName.value = activeProject.name;
    projectEditDescription.value = activeProject.description;
    projectEditStatus.value = activeProject.status;
    populateGithubRepositorySelect(projectEditGithubRepository, activeProject.github_repository, activeProject.github_repository);
    updateProjectStatusHint();
    projectEditMessage.textContent = '';
    projectEditMessage.classList.remove('is-error');
    projectEditDialog.showModal();
    projectEditName.focus();
}
function projectStatusHint(status) {
    return PROJECT_STATUS_HINTS[status];
}
function projectStatusIsReadOnly(status) {
    return status === 'completed' || status === 'archived';
}
function updateProjectReadOnlyNotice(status) {
    const readOnly = projectStatusIsReadOnly(status);
    projectReadOnlyNotice.hidden = !readOnly;
    issueForm.hidden = readOnly;
    milestoneUi.manageButton.disabled = readOnly;
    issueDetailStatus.disabled = readOnly;
    issueDetailEditButton.disabled = readOnly;
    issueDetailDeleteButton.disabled = readOnly;
    issueDiscussionInput.disabled = readOnly;
    issueDiscussionSubmit.disabled = readOnly;
    issueDiscussionReplyCancel.disabled = readOnly;
    projectNotesUi.setReadOnly(readOnly);
    memberForm.hidden = activeUser?.role !== 'admin' || readOnly;
    if (readOnly) {
        issueDetailEditForm.hidden = true;
        issueDetailDisplay.hidden = false;
        projectNotesUi.setMode('preview');
    }
    projectChatUi.setReadOnly(readOnly);
    if (status === 'completed') {
        projectReadOnlyNotice.textContent = 'This project is completed and read-only. An admin can reopen it from Edit project.';
    }
    else if (status === 'archived') {
        projectReadOnlyNotice.textContent = 'This project is archived and read-only. An admin can restore its previous work state from Edit project.';
    }
    else {
        projectReadOnlyNotice.textContent = '';
    }
}
function updateProjectStatusHint() {
    const status = projectEditStatus.value;
    let hint = projectStatusHint(status);
    const completedLocked = activeProject?.status === 'completed' && !['active', 'paused'].includes(status);
    const archivedLocked = activeProject?.status === 'archived' && status === 'archived';
    projectEditName.disabled = completedLocked || archivedLocked;
    projectEditDescription.disabled = completedLocked || archivedLocked;
    projectEditGithubRepository.disabled = completedLocked || archivedLocked;
    const archivedFromStatus = activeProject?.status === 'archived' ? activeProject.archived_from_status : null;
    if (activeProject?.status === 'archived' && archivedFromStatus !== null && status === 'archived') {
        const previousState = PROJECT_STATUS_LABELS[archivedFromStatus];
        hint += ` This project was ${previousState.toLowerCase()} before archiving; select ${previousState} to restore it.`;
    }
    else if (activeProject?.status === 'archived' && status !== 'archived') {
        hint += status === archivedFromStatus
            ? ' Saving will restore the previous work state.'
            : ` Saving will unarchive the project as ${PROJECT_STATUS_LABELS[status].toLowerCase()}.`;
    }
    projectEditStatusHelp.textContent = hint;
}
async function saveProjectEdit(event) {
    event.preventDefault();
    if (activeUser?.role !== 'admin' || activeProject === null)
        return;
    const projectId = activeProject.id;
    projectEditSave.disabled = true;
    projectEditMessage.textContent = '';
    projectEditMessage.classList.remove('is-error');
    try {
        const githubRepositorySelection = parseGitHubRepositorySelection(projectEditGithubRepository.value);
        const result = await api(`/projects/${projectId}`, {
            method: 'PATCH',
            body: JSON.stringify({
                name: projectEditName.value,
                description: projectEditDescription.value,
                status: projectEditStatus.value,
                github_installation_id: githubRepositorySelection?.installation_id ?? null,
                github_repository_id: githubRepositorySelection?.repository_id ?? null,
                github_repository_owner: githubRepositorySelection?.owner ?? null,
                github_repository_name: githubRepositorySelection?.name ?? null,
            }),
        });
        if (activeProject?.id !== projectId)
            return;
        activeProject = result.project;
        projectHeading.textContent = result.project.name;
        projectDescription.textContent = result.project.description;
        projectDescription.hidden = result.project.description.trim() === '';
        projectState.textContent = projectStatusLabel(result.project.status);
        projectState.classList.toggle('is-paused', result.project.status === 'paused');
        projectState.classList.toggle('is-read-only', result.project.status === 'completed' || result.project.status === 'archived');
        updateProjectReadOnlyNotice(result.project.status);
        if (selectedIssue !== null) {
            renderIssueDetail();
            renderIssueDiscussion();
        }
        breadcrumbCurrent.textContent = result.project.name;
        report('Project updated.');
        projectEditDialog.close();
        try {
            await loadProjects();
        }
        catch (error) {
            report(error instanceof Error ? error.message : 'Project updated, but the project list could not be refreshed.', true);
        }
    }
    catch (error) {
        projectEditMessage.textContent = error instanceof Error ? error.message : 'Could not update the project.';
        projectEditMessage.classList.add('is-error');
        projectEditName.focus();
    }
    finally {
        projectEditSave.disabled = false;
    }
}
projectEditClose.addEventListener('click', () => projectEditDialog.close());
projectEditCancel.addEventListener('click', () => projectEditDialog.close());
projectEditForm.addEventListener('submit', (event) => void saveProjectEdit(event));
projectEditDialog.addEventListener('close', () => {
    projectEditForm.reset();
    projectEditMessage.textContent = '';
    projectEditMessage.classList.remove('is-error');
    projectEditSave.disabled = false;
    if (activeUser?.role === 'admin' && !projectView.hidden)
        editProjectButton.focus();
});
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
            setIssueQuickAddActive(false);
            focusIssueQuickAddReturnTarget();
        }
        return;
    }
    if (adminView.contains(focused)) {
        workspaceAdminUi.focusSelectedTab();
        return;
    }
    if (focused === issueDiscussionInput) {
        const selected = selectedIssueDiscussionMessageId === null
            ? null
            : issueDiscussionList.querySelector(`.issue-discussion-message[data-message-id="${selectedIssueDiscussionMessageId}"]`);
        const latest = issueDiscussionMessageElements().at(-1) ?? null;
        const target = selected ?? latest;
        if (target !== null)
            selectIssueDiscussionMessage(Number(target.dataset.messageId));
        else
            issueDiscussionHeading.focus();
        return;
    }
    if (loungeChatUi.isComposer(focused)) {
        const selected = selectedChatMessageId === null
            ? null
            : loungeMessageList.querySelector(`.chat-message[data-message-id="${selectedChatMessageId}"]`);
        const latest = chatMessageElements().at(-1) ?? null;
        const target = selected ?? latest;
        if (target !== null)
            selectChatMessage(Number(target.dataset.messageId));
        else
            loungeHeading.focus();
        return;
    }
    if (!projectChatUi.isComposer(focused))
        return;
    const selected = selectedChatMessageId === null
        ? null
        : projectChatUi.messageList()?.querySelector(`.chat-message[data-message-id="${selectedChatMessageId}"]`) ?? null;
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
        case 'toggle-keyboard-hints':
            toggleKeyboardHints();
            break;
        case 'theme-selector':
            themeUi.focusSelector();
            break;
        case 'await-projects-key':
            startGoPrefix();
            break;
        case 'projects':
            clearGoPrefix();
            goToProjects();
            break;
        case 'roadmap':
            clearGoPrefix();
            goToRoadmap();
            break;
        case 'inbox':
            goToInbox();
            break;
        case 'lounge':
            goToLounge();
            break;
        case 'workspace-switcher':
            openWorkspacePicker();
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
        case 'first-project':
            moveProjectSelectionToBoundary('first');
            break;
        case 'last-project':
            moveProjectSelectionToBoundary('last');
            break;
        case 'open-selected-project':
            selectedProjectButton()?.click();
            break;
        case 'first-chat-message':
            moveChatMessageSelectionToBoundary('first');
            break;
        case 'last-chat-message':
            moveChatMessageSelectionToBoundary('last');
            break;
        case 'first-issue-discussion-message':
            moveIssueDiscussionSelectionToBoundary('first');
            break;
        case 'last-issue-discussion-message':
            moveIssueDiscussionSelectionToBoundary('last');
            break;
        case 'page-up':
            moveSelectionByPage(-1);
            break;
        case 'page-down':
            moveSelectionByPage(1);
            break;
        case 'next':
            moveIssueSelection(1);
            break;
        case 'previous':
            moveIssueSelection(-1);
            break;
        case 'first-issue':
            moveIssueSelectionToBoundary('first');
            break;
        case 'last-issue':
            moveIssueSelectionToBoundary('last');
            break;
        case 'focus-issue-filter':
            issueFilter.focus();
            break;
        case 'open-selected':
            if (!inboxView.hidden)
                inboxUi.selectedIssueButton()?.click();
            else
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
        case 'next-issue-discussion-message':
            moveIssueDiscussionSelection(1);
            break;
        case 'previous-issue-discussion-message':
            moveIssueDiscussionSelection(-1);
            break;
        case 'focus-chat-composer':
            focusActiveChatComposer();
            break;
        case 'reply-to-chat-message':
            replyToSelectedChatMessage();
            break;
        case 'focus-issue-discussion-composer':
            issueDiscussionInput.focus();
            break;
        case 'reply-to-issue-discussion-message':
            replyToSelectedIssueDiscussionMessage();
            break;
        case 'issue-from-selected-chat-message':
            createIssueFromSelectedChatMessage();
            break;
        case 'blur-text-input':
            blurTextInput();
            break;
        case 'collapse-status-history':
            issueStatusHistory.open = false;
            break;
        case 'dismiss':
            dismissCurrentView();
            break;
    }
}
function handleKeyboardShortcut(event) {
    if (guestUi.isPreviewActive()) {
        if (event.key === 'Escape')
            guestUi.closePreview();
        return;
    }
    if ((commandPalette.open || clientSummaryUi.dialog.open || shortcutHelp.open || issueAiPromptDialog.open || issueStatusPicker.open || issueDeleteConfirmation.open || memberRemovalConfirmation.open || workspaceAdminUi.hasOpenDialog() || milestoneUi.deleteConfirmation.open || milestoneUi.managerDialog.open || workspacePicker.open || themeUi.aboutDialog.open || projectEditDialog.open)
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
issueStatusPickerClose.addEventListener('click', closeIssueStatusPicker);
issueStatusPicker.addEventListener('close', () => {
    const returnFocus = issueStatusPickerReturnFocus;
    issueStatusPickerIssue = null;
    issueStatusPickerReturnFocus = null;
    if (returnFocus !== null && returnFocus.isConnected && returnFocus.closest('[hidden]') === null
        && !commandPalette.open && !shortcutHelp.open && !workspacePicker.open) {
        returnFocus.focus();
    }
});
issueStatusPicker.addEventListener('keydown', (event) => {
    if (!(event.target instanceof HTMLElement) || !event.target.matches('.issue-status-option'))
        return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        focusIssueStatusPickerOption(issueStatusPickerOptionIndex + (event.key === 'ArrowDown' ? 1 : -1));
    }
    else if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        void applyIssueStatusPickerSelection();
    }
});
document.addEventListener('keydown', handleKeyboardShortcut);
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && projectChatUi.activeProjectId() !== null)
        projectChatUi.resume();
    if (!document.hidden && loungeActive) {
        loungeChatUi.resume();
        void loungePresenceUi.pollLoungePresence();
    }
    if (!document.hidden && !loungeActive)
        void loungePresenceUi.pollWorkspacePresence();
    if (!document.hidden && activeProject !== null && issuePollingIsActive(activeProject.id)) {
        issuePollDelay = 1000;
        scheduleIssuePoll(0);
    }
    if (!document.hidden && inboxUi.isPollingActive())
        inboxUi.resumePolling();
});
document.addEventListener('focusout', () => {
    window.setTimeout(resumeDeferredIssuePolling, 0);
    window.setTimeout(() => inboxUi.resumeDeferredUpdates(), 0);
});
projectsNavButton.addEventListener('click', goToProjects);
projectSidebarList.addEventListener('scroll', updateProjectSidebarMoreCue, { passive: true });
window.addEventListener('resize', updateProjectSidebarMoreCue);
const projectSidebarResizeObserver = new ResizeObserver(updateProjectSidebarMoreCue);
projectSidebarResizeObserver.observe(projectSidebarList);
roadmapNavButton.addEventListener('click', goToRoadmap);
inboxNavButton.addEventListener('click', goToInbox);
loungeNavButton.addEventListener('click', goToLounge);
adminNavButton.addEventListener('click', openWorkspaceAdmin);
breadcrumbProjectsButton.addEventListener('click', goToProjects);
issuesTabButton.addEventListener('click', () => switchProjectTab('issues'));
deletedIssuesDetails.addEventListener('toggle', () => {
    const projectId = activeProject?.id ?? null;
    void refreshDeletedIssuesOnOpen(deletedIssuesDetails.open, projectId, loadDeletedProjectIssues);
});
membersTabButton.addEventListener('click', () => switchProjectTab('members'));
notesTabButton.addEventListener('click', () => switchProjectTab('notes'));
projectTabs.addEventListener('keydown', (event) => {
    const tabs = [issuesTabButton, membersTabButton, notesTabButton];
    const currentIndex = tabs.indexOf(event.target);
    if (currentIndex < 0 || event.altKey || event.ctrlKey || event.metaKey)
        return;
    let nextIndex;
    if (event.key === 'ArrowRight')
        nextIndex = (currentIndex + 1) % tabs.length;
    else if (event.key === 'ArrowLeft')
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home')
        nextIndex = 0;
    else if (event.key === 'End')
        nextIndex = tabs.length - 1;
    else
        return;
    event.preventDefault();
    event.stopPropagation();
    const nextTab = tabs[nextIndex];
    nextTab?.focus();
    nextTab?.click();
});
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
issueForm.addEventListener('focusin', (event) => {
    rememberIssueQuickAddOpener(event);
    setIssueQuickAddActive(true);
});
issueForm.addEventListener('focusout', (event) => {
    if (event.relatedTarget instanceof Node && issueForm.contains(event.relatedTarget))
        return;
    setTimeout(() => {
        if (issueForm.contains(document.activeElement) || issueQuickAddHasDraft())
            return;
        issueDescriptionDetails.open = false;
        issueQuickAddEscapePending = false;
        setIssueQuickAddActive(false);
    }, 0);
});
issueDescriptionDetails.addEventListener('toggle', () => {
    if (issueDescriptionDetails.open)
        setIssueQuickAddActive(true);
});
issueQuickAddCancelButton.addEventListener('click', cancelIssueQuickAdd);
issueQuickAddShared.addEventListener('change', updateIssueQuickAddApproval);
issueQuickAddOngoing.addEventListener('change', () => updateOngoingMilestoneControl(issueQuickAddOngoing, issueQuickAddMilestone));
issueDetailOngoingInput.addEventListener('change', () => updateOngoingMilestoneControl(issueDetailOngoingInput, issueDetailMilestoneInput));
issueQuickAddTitle.addEventListener('input', () => issueQuickAddTitle.setCustomValidity(''));
projectForm.querySelector('textarea[name="description"]')
    ?.addEventListener('keydown', (event) => submitFormOnEnter(event, projectForm));
issueDescriptionInput?.addEventListener('keydown', (event) => submitFormOnEnter(event, issueForm));
issueDetailDescriptionInput.addEventListener('keydown', (event) => submitFormOnEnter(event, issueDetailEditForm));
issueDiscussionInput.addEventListener('keydown', (event) => submitFormOnEnter(event, issueDiscussionForm));
issueDiscussionForm.addEventListener('submit', (event) => void postIssueDiscussionMessage(event));
issueDiscussionReplyCancel.addEventListener('click', clearIssueDiscussionReply);
issueFilter.addEventListener('input', () => {
    clearBulkMoveSelection();
    renderProjectIssueBoard();
});
issueGrouping.addEventListener('change', () => {
    clearBulkMoveSelection();
    renderProjectIssueBoard();
});
issueOrder.addEventListener('change', handleIssueOrderChange);
issueScope.addEventListener('change', () => {
    clearBulkMoveSelection();
    renderProjectIssueBoard();
});
issueBulkAssignToggle.addEventListener('click', () => {
    if (bulkSelectionActionPending || bulkMovePending)
        return;
    if (bulkAssignSelectionMode) {
        clearBulkAssignSelection();
    }
    else {
        clearBulkMoveSelection();
        selectedBulkAssignIssueIds.clear();
        bulkAssignTargetValue = '';
        bulkAssignSelectionMode = true;
    }
    renderProjectIssueBoard();
    if (bulkAssignSelectionMode)
        issueList.querySelector('.issue-bulk-assign-checkbox')?.focus();
});
issueBulkAssignSelectVisible.addEventListener('click', () => {
    if (bulkSelectionActionPending || bulkMovePending)
        return;
    if (visibleBulkAssignIssueIds.size > 500) {
        report('Assign up to 500 issues at a time.', true);
        return;
    }
    selectedBulkAssignIssueIds = new Set(visibleBulkAssignIssueIds);
    renderProjectIssueBoard();
});
issueBulkAssignTarget.addEventListener('change', () => {
    bulkAssignTargetValue = issueBulkAssignTarget.value;
    syncIssueBulkAssignControls();
});
issueBulkAssignApply.addEventListener('click', () => void assignSelectedIssues());
issueBulkShareApply.addEventListener('click', () => void updateSelectedIssuesSharing(true));
issueBulkUnshareApply.addEventListener('click', () => void updateSelectedIssuesSharing(false));
issueBulkAssignCancel.addEventListener('click', () => {
    if (bulkSelectionActionPending)
        return;
    clearBulkAssignSelection();
    renderProjectIssueBoard();
    issueBulkAssignToggle.focus();
});
toggleProjectFormButton.addEventListener('click', () => {
    if (!projectFormPanel.hidden) {
        closeProjectForm();
        return;
    }
    projectFormPanel.hidden = false;
    projectForm.querySelector('input[name="name"]')?.focus();
});
editProjectButton.addEventListener('click', openProjectEditDialog);
connectGithubCreateButton.addEventListener('click', () => void connectGithub());
connectGithubEditButton.addEventListener('click', () => void connectGithub());
projectEditStatus.addEventListener('change', updateProjectStatusHint);
cancelProjectFormButton.addEventListener('click', closeProjectForm);
linkPullRequestButton.addEventListener('click', () => {
    if (selectedIssue === null || activeProject === null || activeProject.github_repository === null
        || projectStatusIsReadOnly(activeProject.status))
        return;
    issuePullRequestForm.reset();
    issuePullRequestMessage.textContent = '';
    issuePullRequestMessage.classList.remove('is-error');
    issuePullRequestDialog.showModal();
    issuePullRequestUrl.focus();
});
issuePullRequestClose.addEventListener('click', () => issuePullRequestDialog.close());
issuePullRequestCancel.addEventListener('click', () => issuePullRequestDialog.close());
issuePullRequestDialog.addEventListener('close', () => {
    issuePullRequestForm.reset();
    issuePullRequestMessage.textContent = '';
    issuePullRequestMessage.classList.remove('is-error');
    if (selectedIssue !== null && !issueDetailView.hidden)
        linkPullRequestButton.focus();
});
issuePullRequestForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const issueId = selectedIssue?.id;
    if (issueId === undefined || activeProject === null || activeProject.github_repository === null)
        return;
    issuePullRequestSubmit.disabled = true;
    issuePullRequestMessage.textContent = '';
    issuePullRequestMessage.classList.remove('is-error');
    void api(`/issues/${issueId}/pull-requests`, {
        method: 'POST',
        body: JSON.stringify({ url: issuePullRequestUrl.value }),
    }).then(async () => {
        if (selectedIssue?.id !== issueId)
            return;
        await loadIssuePullRequests(issueId);
        issuePullRequestDialog.close();
        report('Pull request linked.');
    }).catch((error) => {
        issuePullRequestMessage.textContent = error instanceof Error ? error.message : 'Could not link pull request.';
        issuePullRequestMessage.classList.add('is-error');
        issuePullRequestUrl.focus();
    }).finally(() => {
        issuePullRequestSubmit.disabled = false;
    });
});
issueForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (activeProject === null)
        return;
    const projectId = activeProject.id;
    const values = new FormData(issueForm);
    const parsedIssue = parseQuickIssueInput(String(values.get('title') ?? ''), activeProjectMembers, projectMilestones);
    if (parsedIssue.title === '') {
        issueQuickAddTitle.setCustomValidity('Enter an issue title before the optional fields.');
        issueQuickAddTitle.reportValidity();
        return;
    }
    issueQuickAddTitle.setCustomValidity('');
    const assigneeValue = values.get('assignee_id');
    const milestoneValue = values.get('milestone_id');
    const dueDateValue = values.get('due_date');
    const issueInput = {
        title: parsedIssue.title,
        description: values.get('description'),
        type: parsedIssue.type ?? values.get('type'),
        priority: parsedIssue.priority ?? values.get('priority'),
        due_date: parsedIssue.dueDate ?? (typeof dueDateValue === 'string' && dueDateValue !== '' ? dueDateValue : null),
        assignee_id: parsedIssue.assigneeId
            ?? (typeof assigneeValue === 'string' && assigneeValue !== '' ? Number(assigneeValue) : null),
    };
    if (issueQuickAddOngoing.checked) {
        issueInput.is_ongoing = true;
        issueInput.milestone_id = null;
    }
    else if (parsedIssue.milestoneId !== undefined)
        issueInput.milestone_id = parsedIssue.milestoneId;
    else if (typeof milestoneValue === 'string' && milestoneValue !== '')
        issueInput.milestone_id = Number(milestoneValue);
    if (issueQuickAddShared.checked)
        issueInput.is_shared = true;
    if (issueQuickAddApproval.checked)
        issueInput.approval_requested = true;
    if (issueQuickAddSourceMessageId !== null)
        issueInput.source_message_id = issueQuickAddSourceMessageId;
    try {
        await api(`/projects/${projectId}/issues`, {
            method: 'POST',
            body: JSON.stringify(issueInput),
        });
        issueForm.reset();
        updateOngoingMilestoneControl(issueQuickAddOngoing, issueQuickAddMilestone);
        issueQuickAddTitle.setCustomValidity('');
        issueQuickAddSourceMessageId = null;
        issueQuickAddSourceProjectId = null;
        issueQuickAddReturnFocus = issuesTabButton;
        issueDescriptionDetails.open = false;
        issueQuickAddEscapePending = false;
        updateIssueQuickAddApproval();
        report('Issue created.');
        await loadProjectIssues(projectId);
        if (activeProject?.id === projectId && !projectView.hidden)
            issueQuickAddTitle.focus();
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
function projectStatusLabel(status) {
    return PROJECT_STATUS_LABELS[status];
}
function updateProjectEmptyStates(projects) {
    const isEmpty = projects.length === 0;
    const isAdmin = activeUser?.role === 'admin';
    emptyProjects.hidden = !isEmpty;
    projectSidebarEmpty.hidden = !isEmpty;
    if (!isEmpty)
        return;
    emptyProjects.textContent = isAdmin
        ? 'No projects yet.'
        : "You're not a member of any projects yet. Ask a workspace admin to add you.";
    projectSidebarEmpty.textContent = isAdmin ? 'No projects yet.' : 'No project access yet.';
}
function createScrollMoreIndicator() {
    const indicator = document.createElement('span');
    indicator.className = 'sidebar-scroll-more';
    indicator.setAttribute('aria-hidden', 'true');
    indicator.hidden = true;
    return indicator;
}
function updateProjectSidebarMoreCue() {
    const isHorizontal = window.matchMedia('(max-width: 760px)').matches;
    const scrollSize = isHorizontal ? projectSidebarList.scrollWidth : projectSidebarList.scrollHeight;
    const visibleSize = isHorizontal ? projectSidebarList.clientWidth : projectSidebarList.clientHeight;
    const scrollOffset = isHorizontal ? projectSidebarList.scrollLeft : projectSidebarList.scrollTop;
    const hasProjectOverflow = visibleSize > 0 && scrollSize > visibleSize + 1;
    const hasMoreProjects = hasProjectOverflow && scrollOffset + visibleSize < scrollSize - 1;
    projectSidebarMore.classList.toggle('is-horizontal', isHorizontal);
    projectSidebarMore.textContent = isHorizontal ? '▶' : '▼';
    projectSidebarMore.hidden = !hasMoreProjects;
    projectSidebarSection.classList.toggle('is-horizontal', isHorizontal);
    projectSidebarSection.classList.toggle('has-project-overflow', hasProjectOverflow);
    projectSidebarSection.classList.toggle('has-more-projects', hasMoreProjects);
    accountBar.classList.toggle('has-project-overflow', hasProjectOverflow);
}
async function loadProjects() {
    const result = await api('/projects');
    const projects = [...result.projects].sort((left, right) => (PROJECT_STATUS_ORDER[left.status] - PROJECT_STATUS_ORDER[right.status]
        || left.name.localeCompare(right.name)));
    projectList.replaceChildren();
    updateProjectEmptyStates(projects);
    projectSidebarList.replaceChildren();
    for (const project of projects) {
        const item = document.createElement('li');
        item.className = 'project-card';
        item.dataset.projectId = String(project.id);
        const details = document.createElement('div');
        details.className = 'project-card-details';
        const name = document.createElement('p');
        name.className = 'project-name';
        name.textContent = project.name;
        const description = document.createElement('p');
        description.className = 'project-description';
        description.textContent = project.description || project.slug;
        details.append(name, description);
        const actions = document.createElement('div');
        actions.className = 'project-card-actions';
        const state = document.createElement('span');
        state.className = 'project-status';
        state.textContent = projectStatusLabel(project.status);
        state.classList.toggle('is-paused', project.status === 'paused');
        state.classList.toggle('is-read-only', project.status === 'completed' || project.status === 'archived');
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
        sidebarButton.setAttribute('aria-label', `${project.name}, ${projectStatusLabel(project.status)}`);
        sidebarButton.addEventListener('click', () => void loadProjectDetail(project.id));
        sidebarItem.append(sidebarButton);
        projectSidebarList.append(sidebarItem);
    }
    window.requestAnimationFrame(updateProjectSidebarMoreCue);
}
async function loadRoadmap() {
    try {
        const result = await api('/roadmap');
        renderRoadmap(result.milestones);
    }
    catch (error) {
        report(error instanceof Error ? error.message : 'Could not load the roadmap.', true);
    }
}
function renderRoadmap(milestones) {
    const today = new Date();
    const statuses = milestones.map((milestone) => milestoneStatus(milestone, today));
    const completed = statuses.filter((status) => status.key === 'complete').length;
    const needsAttention = statuses.filter((status) => status.key === 'needs-attention').length;
    const missedDeadline = statuses.filter((status) => status.key === 'missed-deadline').length;
    const summary = [
        ['Left', milestones.length - completed],
        ['Complete', completed],
        ['Needs attention', needsAttention],
        ['Missed deadline', missedDeadline],
    ];
    roadmapSummary.replaceChildren(...summary.map(([label, value]) => {
        const item = document.createElement('li');
        item.className = 'roadmap-summary-item';
        const count = document.createElement('strong');
        count.className = 'roadmap-summary-count';
        count.textContent = String(value);
        const name = document.createElement('span');
        name.textContent = label;
        item.append(count, name);
        return item;
    }));
    roadmapMilestoneList.replaceChildren();
    roadmapEmptyState.hidden = milestones.length > 0;
    milestones.forEach((milestone, index) => {
        const status = statuses[index];
        const item = document.createElement('li');
        item.className = 'roadmap-milestone';
        item.dataset.status = status.key;
        const top = document.createElement('div');
        top.className = 'roadmap-milestone-top';
        const titleBlock = document.createElement('div');
        titleBlock.className = 'roadmap-milestone-title';
        const projectButton = document.createElement('button');
        projectButton.type = 'button';
        projectButton.className = 'roadmap-project-link';
        projectButton.textContent = milestone.project_name;
        projectButton.setAttribute('aria-label', `Open ${milestone.project_name} issues`);
        projectButton.addEventListener('click', () => void loadProjectDetail(milestone.project_id, 'issues'));
        const title = document.createElement('h2');
        title.textContent = milestone.name;
        titleBlock.append(projectButton, title);
        const badge = document.createElement('span');
        badge.className = `roadmap-status is-${status.key}`;
        badge.textContent = status.label;
        top.append(titleBlock, badge);
        const details = document.createElement('div');
        details.className = 'roadmap-milestone-details';
        const date = document.createElement('span');
        date.className = 'roadmap-milestone-date';
        date.textContent = milestone.due_date === null ? 'No due date' : `Due ${formatRoadmapDate(milestone.due_date)}`;
        const workload = document.createElement('span');
        workload.className = 'roadmap-milestone-workload';
        const teamMemberLabel = milestone.assigned_team_members === 1 ? 'team member assigned' : 'team members assigned';
        const unassignedLabel = milestone.tasks_without_team_assignee === 1 ? 'task without team assignment' : 'tasks without team assignment';
        workload.textContent = `${milestone.remaining_tasks} remaining · ${milestone.assigned_team_members} ${teamMemberLabel} · ${milestone.tasks_without_team_assignee} ${unassignedLabel}`;
        details.append(date, workload);
        const progress = document.createElement('progress');
        progress.className = `roadmap-progress${status.key === 'complete' ? ' is-complete' : ''}`;
        progress.max = Math.max(1, milestone.total_tasks);
        progress.value = milestone.completed_tasks;
        progress.setAttribute('aria-label', `${milestone.completed_tasks} of ${milestone.total_tasks} tasks complete for ${milestone.name}`);
        const progressLabel = document.createElement('span');
        progressLabel.className = 'roadmap-progress-label';
        progressLabel.textContent = `${milestone.completed_tasks} of ${milestone.total_tasks} tasks done`;
        item.append(top, details, progress, progressLabel);
        roadmapMilestoneList.append(item);
    });
}
function formatRoadmapDate(value) {
    return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
    }).format(new Date(`${value}T00:00:00Z`));
}
async function openInboxEvent(event) {
    await loadProjectDetail(event.project_id);
    if (activeProject?.id !== event.project_id || projectView.hidden)
        return;
    if (event.issue_id !== null) {
        await loadProjectIssues(event.project_id);
        const issue = projectIssues.find((candidate) => candidate.id === event.issue_id);
        if (issue === undefined)
            report('This issue is no longer available.', true);
        else
            openIssue(issue);
        return;
    }
    if (event.message_id === null)
        return;
    try {
        const result = await api(`/projects/${event.project_id}/messages/${event.message_id}`);
        if (activeProject?.id !== event.project_id || projectChatUi.activeProjectId() !== event.project_id)
            return;
        projectChatUi.appendMessage(result.message);
        selectChatMessage(result.message.id);
        projectChatUi.setFollowLatest(false);
    }
    catch (error) {
        if (error instanceof ApiFailure && error.status === 404) {
            report('The source message is no longer available.', true);
            return;
        }
        report(error instanceof Error ? error.message : 'Could not open the source message.', true);
    }
}
async function openInboxIssue(issue) {
    await loadProjectDetail(issue.project_id);
    if (activeProject?.id !== issue.project_id || projectView.hidden)
        return;
    await loadProjectIssues(issue.project_id);
    const currentIssue = projectIssues.find((candidate) => candidate.id === issue.id);
    if (currentIssue === undefined) {
        report('This issue is no longer open and assigned to you.', true);
        return;
    }
    openIssue(currentIssue);
}
async function loadProjectDetail(projectId, tab = 'issues', recordHistory = true) {
    const navigationTicket = projectNavigation.begin();
    clearBulkMoveSelection();
    clearBulkAssignSelection();
    const previousLocation = currentWorkspaceLocation();
    if (milestoneUi.managerDialog.open)
        milestoneUi.close();
    projectChatUi.stop();
    stopIssuePolling();
    if (issueQuickAddSourceProjectId !== null && issueQuickAddSourceProjectId !== projectId) {
        issueForm.reset();
        updateOngoingMilestoneControl(issueQuickAddOngoing, issueQuickAddMilestone);
        issueQuickAddSourceMessageId = null;
        issueQuickAddSourceProjectId = null;
        issueQuickAddReturnFocus = null;
        issueQuickAddEscapePending = false;
        issueDescriptionDetails.open = false;
        setIssueQuickAddActive(false);
        updateIssueQuickAddApproval();
    }
    selectedIssue = null;
    projectNotesUi.reset();
    issueDetailEditForm.hidden = true;
    issueDetailDisplay.hidden = false;
    await runOwnedRequest(projectNavigation, navigationTicket, async (signal) => {
        const [result, milestoneResult] = await Promise.all([
            api(`/projects/${projectId}`, { signal }),
            api(`/projects/${projectId}/milestones`, { signal }),
        ]);
        return { result, milestoneResult };
    }, ({ result, milestoneResult }) => {
        const nextLocation = { view: 'project', projectId, tab };
        if (recordHistory && !sameWorkspaceLocation(previousLocation, nextLocation)) {
            workspaceViewHistory.push(previousLocation);
        }
        activeProject = result.project;
        activeProjectMembers = result.members;
        projectHeading.textContent = result.project.name;
        projectMilestones = milestoneResult.milestones;
        populateIssueAssigneeSelect(issueQuickAddAssignee, null);
        populateIssueMilestoneSelect(issueQuickAddMilestone, null);
        populateIssueAssigneeSelect(issueDetailAssigneeInput, null);
        projectSidebarList.querySelectorAll('.project-sidebar-link').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.projectId === String(result.project.id));
        });
        projectDescription.textContent = result.project.description;
        projectDescription.hidden = result.project.description.trim() === '';
        projectState.textContent = projectStatusLabel(result.project.status);
        projectState.classList.toggle('is-paused', result.project.status === 'paused');
        projectState.classList.toggle('is-read-only', result.project.status === 'completed' || result.project.status === 'archived');
        updateProjectReadOnlyNotice(result.project.status);
        projectIssues = [];
        deletedProjectIssues = [];
        deletedIssuesDetails.open = false;
        issueFilter.value = '';
        issueScope.value = 'active';
        issueOrder.value = 'updated';
        synchronizeIssueGroupingForOrder();
        issueDescriptionDetails.open = false;
        renderProjectIssueBoard();
        showWorkspaceView('project');
        chatView.replaceChildren(projectChatUi.create(projectId));
        switchProjectTab(tab);
        (tab === 'issues' ? issuesTabButton : tab === 'members' ? membersTabButton : notesTabButton).focus();
    }, (error) => {
        workspaceViewHistory.length = 0;
        report(error instanceof Error ? error.message : 'Could not load the project.', true);
        showWorkspaceView('projects');
    });
}
function switchProjectTab(tab, returnFocusIssueId, loadIssues = true) {
    if (activeProject === null)
        return;
    const showingIssueDetail = tab === 'issues' && selectedIssue !== null;
    issuesView.hidden = tab !== 'issues' || showingIssueDetail;
    issueDetailView.hidden = !showingIssueDetail;
    membersView.hidden = tab !== 'members';
    projectNotesUi.view.hidden = tab !== 'notes';
    issuesTabButton.classList.toggle('is-active', tab === 'issues');
    membersTabButton.classList.toggle('is-active', tab === 'members');
    notesTabButton.classList.toggle('is-active', tab === 'notes');
    issuesTabButton.setAttribute('aria-selected', String(tab === 'issues'));
    membersTabButton.setAttribute('aria-selected', String(tab === 'members'));
    notesTabButton.setAttribute('aria-selected', String(tab === 'notes'));
    issuesTabButton.tabIndex = tab === 'issues' ? 0 : -1;
    membersTabButton.tabIndex = tab === 'members' ? 0 : -1;
    notesTabButton.tabIndex = tab === 'notes' ? 0 : -1;
    if (tab !== 'issues')
        pauseIssuePolling();
    if (tab === 'issues') {
        if (showingIssueDetail && selectedIssue !== null)
            scheduleIssueDiscussionPoll(selectedIssue.id);
        if (!showingIssueDetail && loadIssues) {
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
    if (tab === 'members') {
        void loadProjectMembers(activeProject.id);
        return;
    }
    if (!projectNotesUi.isLoadedFor(activeProject.id))
        void projectNotesUi.load(activeProject.id);
}
async function loadProjectIssues(projectId) {
    pauseIssuePolling();
    try {
        const collections = await loadIssueCollections(() => fetchConditionalIssueList(projectId, false, null), () => fetchConditionalIssueList(projectId, true, null), deletedIssuesDetails.open);
        const result = collections.active;
        const deletedResult = collections.deleted;
        if (activeProject?.id !== projectId || issuesView.hidden)
            return;
        projectIssues = result.issues ?? [];
        activeIssuesEtag = result.etag;
        if (deletedResult !== null) {
            deletedProjectIssues = deletedResult.issues ?? [];
            deletedIssuesEtag = deletedResult.etag;
        }
        issuePollHasDeferredChanges = false;
        issuePollDelay = 1000;
        renderProjectIssueBoard();
        scheduleIssuePoll();
    }
    catch (error) {
        if (error instanceof ApiFailure && error.status === 401) {
            showSignedOut();
            return;
        }
        report(error instanceof Error ? error.message : 'Could not load project issues.', true);
    }
}
function loadDeletedProjectIssues(projectId) {
    if (deletedIssuesLoadProjectId === projectId && deletedIssuesLoadPromise !== null) {
        return deletedIssuesLoadPromise;
    }
    const request = (async () => {
        try {
            const result = await fetchConditionalIssueList(projectId, true, null);
            if (activeProject?.id !== projectId || projectView.hidden)
                return;
            deletedProjectIssues = result.issues ?? [];
            deletedIssuesEtag = result.etag;
            renderProjectIssueBoard();
        }
        catch (error) {
            if (error instanceof ApiFailure && error.status === 401) {
                showSignedOut();
                return;
            }
            if (activeProject?.id === projectId) {
                report(error instanceof Error ? error.message : 'Could not load deleted issues.', true);
            }
        }
    })();
    deletedIssuesLoadProjectId = projectId;
    deletedIssuesLoadPromise = request;
    void request.finally(() => {
        if (deletedIssuesLoadPromise === request) {
            deletedIssuesLoadProjectId = null;
            deletedIssuesLoadPromise = null;
        }
    });
    return request;
}
function synchronizeIssueGroupingForOrder() {
    const nextUpMode = issueOrder.value === 'next_up';
    if (nextUpMode && !issueGroupingForcedByNextUp) {
        issueGroupingBeforeNextUp = issueGrouping.value;
        issueGrouping.value = 'milestone';
        issueGrouping.disabled = true;
    }
    else if (!nextUpMode && issueGroupingForcedByNextUp) {
        issueGrouping.value = issueGroupingBeforeNextUp;
        issueGrouping.disabled = false;
    }
    issueGroupingForcedByNextUp = nextUpMode;
}
function handleIssueOrderChange() {
    synchronizeIssueGroupingForOrder();
    if (issueOrder.value === 'next_up')
        clearBulkMoveSelection();
    renderProjectIssueBoard();
}
function clearBulkMoveSelection() {
    bulkMoveSelectionMode = false;
    selectedBulkMoveIssueIds.clear();
    bulkMoveMilestoneId = null;
}
function clearBulkAssignSelection() {
    bulkAssignSelectionMode = false;
    selectedBulkAssignIssueIds.clear();
    visibleBulkAssignIssueIds.clear();
    bulkAssignTargetValue = '';
}
function syncIssueBulkAssignControls() {
    const readOnly = activeProject !== null && projectStatusIsReadOnly(activeProject.status);
    const activeMembers = activeProjectMembers.filter((member) => member.is_active !== false && member.is_active !== 0);
    const optionsSignature = JSON.stringify(activeMembers.map((member) => [member.id, member.name]));
    if (issueBulkAssignTarget.dataset.optionsSignature !== optionsSignature) {
        const choose = new Option('Choose assignee', '');
        const unassigned = new Option('Unassigned', 'unassigned');
        issueBulkAssignTarget.replaceChildren(choose, unassigned);
        for (const member of activeMembers)
            issueBulkAssignTarget.add(new Option(member.name, String(member.id)));
        issueBulkAssignTarget.dataset.optionsSignature = optionsSignature;
    }
    if (bulkAssignTargetValue !== 'unassigned'
        && bulkAssignTargetValue !== ''
        && !activeMembers.some((member) => String(member.id) === bulkAssignTargetValue)) {
        bulkAssignTargetValue = '';
    }
    issueBulkAssignTarget.value = bulkAssignTargetValue;
    issueBulkAssignToolbar.hidden = !bulkAssignSelectionMode;
    issueBulkAssignToggle.textContent = bulkAssignSelectionMode ? 'Cancel selection' : 'Select issues';
    issueBulkAssignToggle.setAttribute('aria-pressed', String(bulkAssignSelectionMode));
    issueBulkAssignToggle.disabled = bulkSelectionActionPending || bulkMovePending || readOnly
        || (!bulkAssignSelectionMode && visibleBulkAssignIssueIds.size === 0);
    setTextContentIfChanged(issueBulkAssignCount, `${selectedBulkAssignIssueIds.size} selected`);
    issueBulkAssignSelectVisible.disabled = bulkSelectionActionPending || readOnly || visibleBulkAssignIssueIds.size === 0
        || visibleBulkAssignIssueIds.size > 500 || bulkMovePending;
    issueBulkAssignSelectVisible.title = visibleBulkAssignIssueIds.size > 500 ? 'Select up to 500 issues at a time.' : '';
    issueBulkAssignTarget.disabled = bulkSelectionActionPending || bulkMovePending || readOnly;
    issueBulkAssignApply.disabled = bulkSelectionActionPending || bulkMovePending || readOnly || selectedBulkAssignIssueIds.size === 0
        || bulkAssignTargetValue === '';
    issueBulkShareApply.disabled = bulkSelectionActionPending || bulkMovePending || readOnly || selectedBulkAssignIssueIds.size === 0;
    issueBulkUnshareApply.disabled = bulkSelectionActionPending || bulkMovePending || readOnly || selectedBulkAssignIssueIds.size === 0;
    issueBulkAssignCancel.disabled = bulkSelectionActionPending || bulkMovePending;
    for (const checkbox of issueList.querySelectorAll('.issue-bulk-assign-checkbox')) {
        checkbox.checked = selectedBulkAssignIssueIds.has(Number(checkbox.dataset.issueId));
        checkbox.disabled = bulkSelectionActionPending || readOnly
            || (!checkbox.checked && selectedBulkAssignIssueIds.size >= 500);
    }
}
function renderProjectIssueBoard() {
    const projectIssueProgress = projectProgress(projectIssues);
    issueProgress.max = Math.max(projectIssueProgress.total, 1);
    issueProgress.value = projectIssueProgress.done;
    issueProgress.classList.toggle('is-complete', projectIssueProgress.complete);
    const progressUnit = projectIssueProgress.ongoing > 0
        ? 'planned issues'
        : projectIssueProgress.cancelled > 0 ? 'non-cancelled issues' : 'issues';
    const progressExtras = [
        projectIssueProgress.ongoing > 0 ? `${projectIssueProgress.ongoing} ongoing` : '',
        projectIssueProgress.cancelled > 0 ? `${projectIssueProgress.cancelled} cancelled` : '',
    ].filter(Boolean);
    setTextContentIfChanged(issueProgressLabel, `${projectIssueProgress.done} of ${projectIssueProgress.total} ${progressUnit} done${progressExtras.length > 0 ? ` · ${progressExtras.join(' · ')}` : ''}`);
    const boardIssues = filterIssuesByMilestoneArchive(projectIssues, projectMilestones, issueScope.value);
    const total = boardIssues.length;
    const completed = boardIssues.filter((issue) => issue.status === 'done').length;
    const cancelled = boardIssues.filter((issue) => issue.status === 'cancelled').length;
    const ongoing = boardIssues.filter((issue) => issue.is_ongoing && issue.status !== 'cancelled').length;
    const open = total - completed - cancelled - ongoing;
    setTextContentIfChanged(issueCountSummary, issueScope.value === 'history'
        ? `${total} ${total === 1 ? 'issue' : 'issues'} in History`
        : [
            `${open} open`,
            `${completed} done`,
            ongoing > 0 ? `${ongoing} ongoing` : '',
            cancelled > 0 ? `${cancelled} cancelled` : '',
        ].filter(Boolean).join(' · '));
    const searchableIssues = boardIssues.map((issue) => ({
        ...issue,
        assignee_name: issueAssigneeLabel(issue.assignee_id),
        milestone_name: projectMilestones.find((milestone) => milestone.id === issue.milestone_id)?.name ?? null,
        milestone_due_date: projectMilestones.find((milestone) => milestone.id === issue.milestone_id)?.due_date ?? null,
    }));
    const ordered = sortIssues(searchableIssues, issueOrder.value);
    const nextUpMode = issueScope.value === 'active' && issueOrder.value === 'next_up';
    const workQueue = nextUpMode ? ordered.filter((issue) => ['backlog', 'todo', 'doing', 'testing'].includes(issue.status)) : ordered;
    const visible = filterIssues(workQueue, issueFilter.value);
    visibleBulkAssignIssueIds = new Set(visible.map((issue) => issue.id));
    for (const issueId of selectedBulkAssignIssueIds) {
        if (!visibleBulkAssignIssueIds.has(issueId))
            selectedBulkAssignIssueIds.delete(issueId);
    }
    syncIssueBulkAssignControls();
    emptyIssues.hidden = visible.length > 0;
    setTextContentIfChanged(emptyIssues, nextUpMode && workQueue.length === 0
        ? 'No open issues to work on next.'
        : total === 0
            ? issueScope.value === 'history'
                ? 'No archived milestone issues. Archive a milestone to move its issues into History.'
                : projectIssues.length > 0
                    ? 'No issues in Current work. View History or create a new issue.'
                    : deletedProjectIssues.length > 0
                        ? 'No active issues. Restore one from Deleted issues or create a new issue.'
                        : 'No issues yet. Create the first one.'
            : 'No issues match that filter.');
    setTextContentIfChanged(deletedIssueCount, String(deletedProjectIssues.length));
    deletedIssuesDetails.hidden = false;
    reconcileDeletedIssueRows();
    if (nextUpMode) {
        renderNextUpIssueBoard(visible, workQueue);
        return;
    }
    if (issueGrouping.value === 'milestone') {
        renderMilestoneIssueBoard(visible);
        return;
    }
    reconcileIssueBoardGroups(groupIssues(visible).map((group) => ({
        key: `status:${group.status}`,
        name: group.status,
        className: 'issue-group',
        issues: group.issues,
    })));
}
function renderMilestoneIssueBoard(visibleIssues) {
    const hasActiveMilestones = projectMilestones.some((milestone) => milestone.archived_at === null);
    if (!hasActiveMilestones)
        clearBulkMoveSelection();
    const visibleUnassignedIssueIds = new Set(visibleIssues
        .filter((issue) => issue.milestone_id === null && !issue.is_ongoing)
        .map((issue) => issue.id));
    for (const issueId of selectedBulkMoveIssueIds) {
        if (!visibleUnassignedIssueIds.has(issueId))
            selectedBulkMoveIssueIds.delete(issueId);
    }
    reconcileIssueBoardGroups(groupIssuesByMilestone(visibleIssues, projectMilestones).map((group) => ({
        key: group.isOngoing ? 'milestone:ongoing' : `milestone:${group.milestoneId ?? 'none'}`,
        name: group.dueDate === null ? group.name : `${group.name} · due ${group.dueDate}`,
        className: 'issue-group milestone-issue-group',
        issues: group.issues,
        isOngoing: group.isOngoing,
        allowBulkMove: group.milestoneId === null && group.isOngoing !== true && hasActiveMilestones,
        openByDefault: issueScope.value !== 'history',
    })));
}
function renderNextUpIssueBoard(visibleIssues, allOpenIssues) {
    const groups = groupIssuesByMilestone(visibleIssues, projectMilestones).map((group) => {
        const allGroupIssues = allOpenIssues.filter((issue) => group.isOngoing
            ? issue.is_ongoing
            : !issue.is_ongoing && issue.milestone_id === group.milestoneId);
        const reorderByIssueId = new Map();
        for (const issue of group.isOngoing ? [] : group.issues) {
            const index = allGroupIssues.findIndex((candidate) => candidate.id === issue.id);
            reorderByIssueId.set(issue.id, {
                canMoveEarlier: index > 0,
                canMoveLater: index >= 0 && index < allGroupIssues.length - 1,
                showMilestoneTag: false,
            });
        }
        return {
            key: group.isOngoing ? 'milestone:ongoing' : `milestone:${group.milestoneId ?? 'none'}`,
            name: group.dueDate === null ? group.name : `${group.name} · due ${group.dueDate}`,
            className: 'issue-group milestone-issue-group',
            issues: group.issues,
            reorderByIssueId,
            isOngoing: group.isOngoing,
        };
    });
    reconcileIssueBoardGroups(groups);
}
function reconcileIssueBoardGroups(groups) {
    const existingGroups = new Map(Array.from(issueList.querySelectorAll(':scope > .issue-group'))
        .map((group) => [group.dataset.groupKey ?? '', group]));
    const existingRows = new Map(Array.from(issueList.querySelectorAll('.issue-card'))
        .map((row) => [Number(row.dataset.issueId), row]));
    const expectedRowsByGroup = new Map();
    const retainedGroupKeys = new Set();
    for (const [groupIndex, group] of groups.entries()) {
        retainedGroupKeys.add(group.key);
        let details = existingGroups.get(group.key);
        if (details === undefined) {
            details = document.createElement('details');
            details.open = group.openByDefault ?? true;
            details.dataset.groupKey = group.key;
        }
        if (details.className !== group.className)
            details.className = group.className;
        const summary = details.querySelector(':scope > summary') ?? createIssueGroupSummary(group.name, group.issues.length);
        const groupName = summary.querySelector('.issue-group-name');
        const groupCount = summary.querySelector('.issue-group-count');
        if (groupName !== null)
            setTextContentIfChanged(groupName, group.name);
        if (groupCount !== null)
            setTextContentIfChanged(groupCount, String(group.issues.length));
        let bulkSelectToggle = summary.querySelector(':scope > .issue-bulk-select-toggle');
        if (group.allowBulkMove === true) {
            if (bulkSelectToggle === null) {
                bulkSelectToggle = document.createElement('button');
                bulkSelectToggle.type = 'button';
                bulkSelectToggle.className = 'button button-secondary issue-bulk-select-toggle';
                bulkSelectToggle.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (bulkMovePending)
                        return;
                    if (bulkAssignSelectionMode)
                        clearBulkAssignSelection();
                    if (bulkMoveSelectionMode)
                        clearBulkMoveSelection();
                    else
                        bulkMoveSelectionMode = true;
                    details.open = true;
                    renderProjectIssueBoard();
                });
                summary.append(bulkSelectToggle);
            }
            bulkSelectToggle.textContent = bulkMoveSelectionMode ? 'Cancel selection' : 'Select issues';
            bulkSelectToggle.disabled = bulkMovePending || (activeProject !== null && projectStatusIsReadOnly(activeProject.status));
        }
        else {
            bulkSelectToggle?.remove();
        }
        const isBulkMoveGroup = group.key === 'milestone:none' && group.allowBulkMove === true;
        let bulkToolbar = details.querySelector(':scope > .issue-bulk-move-toolbar');
        if (isBulkMoveGroup && bulkMoveSelectionMode) {
            if (bulkToolbar === null)
                bulkToolbar = createIssueBulkMoveToolbar(group.issues);
            syncIssueBulkMoveToolbar(bulkToolbar, group.issues);
        }
        else {
            bulkToolbar?.remove();
            bulkToolbar = null;
        }
        const rows = details.querySelector(':scope > .issue-group-items') ?? document.createElement('ul');
        rows.className = 'issue-group-items';
        const expectedIds = new Set();
        for (const [rowIndex, issue] of group.issues.entries()) {
            expectedIds.add(issue.id);
            const reorder = group.reorderByIssueId?.get(issue.id);
            const allowBulkMoveSelection = isBulkMoveGroup && bulkMoveSelectionMode;
            const bulkMoveSelected = selectedBulkMoveIssueIds.has(issue.id);
            const allowBulkAssignSelection = bulkAssignSelectionMode;
            const bulkAssignSelected = selectedBulkAssignIssueIds.has(issue.id);
            const signature = issueRowSignature(issue, reorder, allowBulkMoveSelection, bulkMoveSelected, allowBulkAssignSelection, bulkAssignSelected);
            const existing = existingRows.get(issue.id);
            let row;
            if (existing !== undefined && issueRowRenderSignatures.get(existing) === signature) {
                row = existing;
            }
            else {
                row = createIssueRow(issue, reorder, allowBulkMoveSelection, allowBulkAssignSelection);
                row.classList.toggle('is-keyboard-selected', selectedIssue?.id === issue.id);
                issueRowRenderSignatures.set(row, signature);
                if (existing !== undefined)
                    replaceIssueRowPreservingFocus(existing, row);
            }
            placeNodeAtPosition(rows, row, rowIndex);
        }
        if (bulkToolbar !== null)
            syncIssueBulkMoveToolbar(bulkToolbar, group.issues);
        expectedRowsByGroup.set(group.key, expectedIds);
        placeNodeAtPosition(details, summary, 0);
        if (bulkToolbar !== null)
            placeNodeAtPosition(details, bulkToolbar, 1);
        placeNodeAtPosition(details, rows, bulkToolbar === null ? 1 : 2);
        placeNodeAtPosition(issueList, details, groupIndex);
    }
    for (const group of Array.from(issueList.querySelectorAll(':scope > .issue-group'))) {
        const key = group.dataset.groupKey ?? '';
        if (!retainedGroupKeys.has(key)) {
            group.remove();
            continue;
        }
        const expected = expectedRowsByGroup.get(key) ?? new Set();
        group.querySelectorAll(':scope > .issue-group-items > .issue-card').forEach((row) => {
            if (!expected.has(Number(row.dataset.issueId)))
                row.remove();
        });
    }
}
function createIssueBulkMoveToolbar(issues) {
    const toolbar = document.createElement('div');
    toolbar.className = 'issue-bulk-move-toolbar';
    toolbar.setAttribute('role', 'group');
    toolbar.setAttribute('aria-label', 'Move unassigned issues to a milestone');
    const selectionActions = document.createElement('div');
    selectionActions.className = 'issue-bulk-move-selection-actions';
    selectionActions.setAttribute('role', 'group');
    selectionActions.setAttribute('aria-label', 'Selection');
    const selectionLabel = document.createElement('span');
    selectionLabel.className = 'issue-bulk-action-label';
    selectionLabel.textContent = 'Selection';
    const count = document.createElement('span');
    count.className = 'issue-bulk-move-count';
    count.setAttribute('aria-live', 'polite');
    const selectAll = document.createElement('button');
    selectAll.type = 'button';
    selectAll.className = 'button button-secondary issue-bulk-select-all';
    selectAll.textContent = 'Select all';
    selectAll.addEventListener('click', () => {
        if (bulkMovePending)
            return;
        const details = toolbar.parentElement;
        if (!(details instanceof HTMLDetailsElement))
            return;
        const issueIds = Array.from(details.querySelectorAll('.issue-bulk-select-checkbox'))
            .map((checkbox) => Number(checkbox.dataset.issueId))
            .filter((issueId) => Number.isInteger(issueId) && issueId > 0);
        if (issueIds.length > 500)
            return;
        selectedBulkMoveIssueIds = new Set(issueIds);
        renderProjectIssueBoard();
    });
    selectionActions.append(selectionLabel, count, selectAll);
    const actionGroup = document.createElement('div');
    actionGroup.className = 'issue-bulk-move-action-group';
    actionGroup.setAttribute('role', 'group');
    actionGroup.setAttribute('aria-label', 'Milestone');
    const milestoneLabel = document.createElement('span');
    milestoneLabel.className = 'issue-bulk-action-label';
    milestoneLabel.textContent = 'Milestone';
    const milestoneSelect = document.createElement('select');
    milestoneSelect.className = 'issue-bulk-move-milestone';
    milestoneSelect.setAttribute('aria-label', 'Move selected issues to milestone');
    milestoneSelect.addEventListener('change', () => {
        bulkMoveMilestoneId = milestoneSelect.value === '' ? null : Number(milestoneSelect.value);
        const moveButton = toolbar.querySelector('.issue-bulk-move-button');
        if (moveButton !== null)
            moveButton.disabled = bulkMovePending
                || selectedBulkMoveIssueIds.size === 0
                || bulkMoveMilestoneId === null
                || (activeProject !== null && projectStatusIsReadOnly(activeProject.status));
    });
    const moveButton = document.createElement('button');
    moveButton.type = 'button';
    moveButton.className = 'button button-primary issue-bulk-move-button';
    moveButton.textContent = 'Move';
    moveButton.setAttribute('aria-label', 'Move selected issues');
    moveButton.addEventListener('click', () => void moveSelectedIssuesToMilestone());
    actionGroup.append(milestoneLabel, milestoneSelect, moveButton);
    toolbar.append(selectionActions, actionGroup);
    syncIssueBulkMoveToolbar(toolbar, issues);
    return toolbar;
}
function syncIssueBulkMoveToolbar(toolbar, issues) {
    const count = toolbar.querySelector('.issue-bulk-move-count');
    const selectAll = toolbar.querySelector('.issue-bulk-select-all');
    const milestoneSelect = toolbar.querySelector('.issue-bulk-move-milestone');
    const moveButton = toolbar.querySelector('.issue-bulk-move-button');
    const disabled = bulkMovePending || bulkSelectionActionPending
        || (activeProject !== null && projectStatusIsReadOnly(activeProject.status));
    if (count !== null)
        setTextContentIfChanged(count, `${selectedBulkMoveIssueIds.size} selected`);
    if (selectAll !== null) {
        selectAll.disabled = disabled || issues.length > 500;
        selectAll.title = issues.length > 500 ? 'Select up to 500 issues at a time.' : '';
    }
    if (milestoneSelect !== null) {
        const optionsSignature = projectMilestones
            .filter((milestone) => milestone.archived_at === null)
            .map((milestone) => `${milestone.id}:${milestone.name}`)
            .join('|');
        if (milestoneSelect.dataset.optionsSignature !== optionsSignature) {
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = 'Choose milestone';
            milestoneSelect.replaceChildren(placeholder);
            for (const milestone of projectMilestones) {
                if (milestone.archived_at !== null)
                    continue;
                const option = document.createElement('option');
                option.value = String(milestone.id);
                option.textContent = milestone.name;
                milestoneSelect.append(option);
            }
            milestoneSelect.dataset.optionsSignature = optionsSignature;
        }
        if (bulkMoveMilestoneId !== null && !projectMilestones.some((milestone) => milestone.id === bulkMoveMilestoneId && milestone.archived_at === null)) {
            bulkMoveMilestoneId = null;
        }
        milestoneSelect.value = bulkMoveMilestoneId === null ? '' : String(bulkMoveMilestoneId);
        milestoneSelect.disabled = disabled;
    }
    if (moveButton !== null)
        moveButton.disabled = disabled
            || selectedBulkMoveIssueIds.size === 0
            || bulkMoveMilestoneId === null;
    const details = toolbar.parentElement;
    if (details instanceof HTMLDetailsElement) {
        for (const checkbox of details.querySelectorAll('.issue-bulk-select-checkbox')) {
            checkbox.checked = selectedBulkMoveIssueIds.has(Number(checkbox.dataset.issueId));
            checkbox.disabled = disabled
                || (!checkbox.checked && selectedBulkMoveIssueIds.size >= 500);
        }
    }
}
async function assignSelectedIssues() {
    const projectId = activeProject?.id;
    const issueIds = Array.from(selectedBulkAssignIssueIds);
    const assigneeId = bulkAssignTargetValue === 'unassigned' ? null : Number(bulkAssignTargetValue);
    if (projectId === undefined || issueIds.length === 0 || issueIds.length > 500
        || bulkAssignTargetValue === '' || (assigneeId !== null && (!Number.isInteger(assigneeId) || assigneeId < 1))
        || bulkSelectionActionPending || bulkMovePending)
        return;
    bulkSelectionActionPending = true;
    syncIssueBulkAssignControls();
    try {
        const result = await api(`/projects/${projectId}/issues/assign`, {
            method: 'POST',
            body: JSON.stringify({ issue_ids: issueIds, assignee_id: assigneeId }),
        });
        if (activeProject?.id !== projectId) {
            bulkSelectionActionPending = false;
            if (activeProject !== null && !issuesView.hidden)
                renderProjectIssueBoard();
            return;
        }
        projectIssues = projectIssues.map((issue) => issueIds.includes(issue.id)
            ? { ...issue, assignee_id: assigneeId }
            : issue);
        if (selectedIssue !== null && issueIds.includes(selectedIssue.id)) {
            selectedIssue = { ...selectedIssue, assignee_id: assigneeId };
            renderIssueDetail();
        }
        clearBulkAssignSelection();
        bulkSelectionActionPending = false;
        renderProjectIssueBoard();
        issueBulkAssignToggle.focus();
        const description = assigneeId === null
            ? `Unassigned ${result.assigned_count} ${result.assigned_count === 1 ? 'issue' : 'issues'}.`
            : `Assigned ${result.assigned_count} ${result.assigned_count === 1 ? 'issue' : 'issues'} to ${issueAssigneeLabel(assigneeId)}.`;
        report(description);
        void loadProjectIssues(projectId);
    }
    catch (error) {
        bulkSelectionActionPending = false;
        if (activeProject?.id !== projectId) {
            if (activeProject !== null && !issuesView.hidden)
                renderProjectIssueBoard();
            return;
        }
        syncIssueBulkAssignControls();
        if (error instanceof ApiFailure && error.status === 401) {
            showSignedOut();
            return;
        }
        report(error instanceof Error ? error.message : 'Could not assign the selected issues.', true);
    }
}
async function updateSelectedIssuesSharing(isShared) {
    const projectId = activeProject?.id;
    const issueIds = Array.from(selectedBulkAssignIssueIds);
    if (projectId === undefined || issueIds.length === 0 || issueIds.length > 500
        || bulkSelectionActionPending || bulkMovePending)
        return;
    bulkSelectionActionPending = true;
    syncIssueBulkAssignControls();
    try {
        const result = await api(`/projects/${projectId}/issues/share`, {
            method: 'POST',
            body: JSON.stringify({ issue_ids: issueIds, is_shared: isShared }),
        });
        if (activeProject?.id !== projectId) {
            bulkSelectionActionPending = false;
            if (activeProject !== null && !issuesView.hidden)
                renderProjectIssueBoard();
            return;
        }
        projectIssues = projectIssues.map((issue) => issueIds.includes(issue.id)
            ? { ...issue, is_shared: isShared }
            : issue);
        if (selectedIssue !== null && issueIds.includes(selectedIssue.id)) {
            selectedIssue = { ...selectedIssue, is_shared: isShared };
            renderIssueDetail();
        }
        clearBulkAssignSelection();
        bulkSelectionActionPending = false;
        renderProjectIssueBoard();
        issueBulkAssignToggle.focus();
        const count = result.updated_count;
        const description = count === 0
            ? `Selected issues were already ${isShared ? 'shared with guests' : 'internal'}.`
            : isShared
                ? `Shared ${count} selected ${count === 1 ? 'issue' : 'issues'} with project guests.`
                : `Made ${count} selected ${count === 1 ? 'issue' : 'issues'} internal.`;
        report(description);
        void loadProjectIssues(projectId);
    }
    catch (error) {
        bulkSelectionActionPending = false;
        if (activeProject?.id !== projectId) {
            if (activeProject !== null && !issuesView.hidden)
                renderProjectIssueBoard();
            return;
        }
        syncIssueBulkAssignControls();
        if (error instanceof ApiFailure && error.status === 401) {
            showSignedOut();
            return;
        }
        report(error instanceof Error ? error.message : 'Could not update sharing for selected issues.', true);
    }
}
async function moveSelectedIssuesToMilestone() {
    const projectId = activeProject?.id;
    const milestoneId = bulkMoveMilestoneId;
    const issueIds = Array.from(selectedBulkMoveIssueIds);
    if (projectId === undefined || milestoneId === null || issueIds.length === 0 || issueIds.length > 500 || bulkMovePending)
        return;
    bulkMovePending = true;
    renderProjectIssueBoard();
    try {
        await api(`/projects/${projectId}/issues/move-to-milestone`, {
            method: 'POST',
            body: JSON.stringify({ issue_ids: issueIds, milestone_id: milestoneId }),
        });
        if (activeProject?.id !== projectId) {
            bulkMovePending = false;
            return;
        }
        const milestone = projectMilestones.find((candidate) => candidate.id === milestoneId);
        const nextSortOrder = Math.max(0, ...projectIssues
            .filter((issue) => issue.milestone_id === milestoneId)
            .map((issue) => issue.sort_order)) + 1;
        let sortOrder = nextSortOrder;
        projectIssues = projectIssues.map((issue) => issueIds.includes(issue.id)
            ? {
                ...issue,
                milestone_id: milestoneId,
                milestone_name: milestone?.name ?? null,
                milestone_due_date: milestone?.due_date ?? null,
                sort_order: sortOrder++,
            }
            : issue);
        clearBulkMoveSelection();
        bulkMovePending = false;
        renderProjectIssueBoard();
        issueList.querySelector(`:scope > .issue-group[data-group-key="milestone:${milestoneId}"]`)
            ?.querySelector(':scope > summary')?.focus();
        report(`Moved ${issueIds.length} ${issueIds.length === 1 ? 'issue' : 'issues'} to ${milestone?.name ?? 'the milestone'}.`);
        void loadProjectIssues(projectId);
    }
    catch (error) {
        bulkMovePending = false;
        if (activeProject?.id !== projectId)
            return;
        renderProjectIssueBoard();
        if (error instanceof ApiFailure && error.status === 401) {
            showSignedOut();
            return;
        }
        report(error instanceof Error ? error.message : 'Could not move the selected issues.', true);
    }
}
function setTextContentIfChanged(element, value) {
    if (element.textContent !== value)
        element.textContent = value;
}
function placeNodeAtPosition(parent, node, index) {
    if (parent.children.item(index) === node)
        return;
    parent.insertBefore(node, parent.children.item(index));
}
function issueRowSignature(issue, reorder, allowBulkMoveSelection = false, bulkMoveSelected = false, allowBulkAssignSelection = false, bulkAssignSelected = false) {
    return JSON.stringify([
        issue.title,
        issue.description,
        issue.status,
        issue.type,
        issueAssigneeLabel(issue.assignee_id),
        issue.is_shared,
        reorder?.showMilestoneTag === false ? null : issue.milestone_name ?? null,
        issue.source_message_id !== null,
        issue.discussion_count ?? 0,
        reorder?.canMoveEarlier,
        reorder?.canMoveLater,
        issue.is_ongoing,
        allowBulkMoveSelection,
        bulkMoveSelected,
        allowBulkAssignSelection,
        bulkAssignSelected,
    ]);
}
function replaceIssueRowPreservingFocus(previous, next) {
    const focused = document.activeElement;
    let focusTarget = null;
    if (focused instanceof HTMLElement && previous.contains(focused)) {
        if (focused.matches('.issue-title-button'))
            focusTarget = '.issue-title-button';
        else if (focused.matches('.issue-status-button'))
            focusTarget = '.issue-status-button';
        else if (focused.matches('.issue-bulk-select-checkbox'))
            focusTarget = '.issue-bulk-select-checkbox';
        else if (focused.matches('.issue-bulk-assign-checkbox'))
            focusTarget = '.issue-bulk-assign-checkbox';
        else if (focused.matches('[data-move-direction]')) {
            focusTarget = `[data-move-direction="${focused.getAttribute('data-move-direction')}"]`;
        }
    }
    previous.replaceWith(next);
    if (focusTarget !== null)
        next.querySelector(focusTarget)?.focus();
}
function reconcileDeletedIssueRows() {
    const existingRows = new Map(Array.from(deletedIssueList.querySelectorAll(':scope > .deleted-issue-item'))
        .map((row) => [Number(row.dataset.issueId), row]));
    const expectedIds = new Set();
    for (const [index, issue] of deletedProjectIssues.entries()) {
        expectedIds.add(issue.id);
        const signature = JSON.stringify([issue.title, issue.status]);
        const existing = existingRows.get(issue.id);
        const row = existing !== undefined && deletedIssueRowRenderSignatures.get(existing) === signature
            ? existing
            : createDeletedIssueRow(issue);
        if (row !== existing) {
            deletedIssueRowRenderSignatures.set(row, signature);
            if (existing !== undefined)
                replaceIssueRowPreservingFocus(existing, row);
        }
        placeNodeAtPosition(deletedIssueList, row, index);
    }
    deletedIssueList.querySelectorAll(':scope > .deleted-issue-item').forEach((row) => {
        if (!expectedIds.has(Number(row.dataset.issueId)))
            row.remove();
    });
}
function createIssueGroupSummary(name, count) {
    const summary = document.createElement('summary');
    summary.className = 'issue-group-summary';
    const chevron = document.createElement('span');
    chevron.className = 'issue-group-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '›';
    const groupName = document.createElement('span');
    groupName.className = 'issue-group-name';
    groupName.textContent = name;
    const groupCount = document.createElement('span');
    groupCount.className = 'issue-group-count';
    groupCount.textContent = String(count);
    summary.append(chevron, groupName, groupCount);
    return summary;
}
function createDeletedIssueRow(issue) {
    const item = document.createElement('li');
    item.className = 'deleted-issue-item';
    item.dataset.issueId = String(issue.id);
    const content = document.createElement('div');
    content.className = 'deleted-issue-content';
    const title = document.createElement('strong');
    title.textContent = issue.title;
    const status = document.createElement('span');
    status.className = 'deleted-issue-status';
    status.textContent = `Was ${issueStatusLabel(issue.status)}`;
    content.append(title, status);
    const restoreButton = document.createElement('button');
    restoreButton.type = 'button';
    restoreButton.className = 'button button-secondary';
    restoreButton.textContent = 'Restore';
    restoreButton.disabled = activeProject !== null && projectStatusIsReadOnly(activeProject.status);
    restoreButton.dataset.issueId = String(issue.id);
    restoreButton.setAttribute('aria-label', `Restore ${issue.title}`);
    restoreButton.addEventListener('click', () => void restoreIssue(issue, restoreButton));
    item.append(content, restoreButton);
    return item;
}
function renderIssueDetail() {
    if (selectedIssue === null)
        return;
    issueDetailTitle.textContent = selectedIssue.title;
    issueDetailType.textContent = issueTypeLabel(selectedIssue.type);
    issueDetailPriority.textContent = issuePriorityLabel(selectedIssue.priority);
    const overdue = isIssueOverdue(selectedIssue);
    issueDetailDueDate.textContent = selectedIssue.due_date === null
        ? 'None'
        : `${overdue ? 'Overdue · ' : ''}${formatIssueDueDate(selectedIssue.due_date)}`;
    issueDetailDueDate.classList.toggle('is-overdue', overdue);
    issueDetailAssignee.textContent = issueAssigneeLabel(selectedIssue.assignee_id);
    issueDetailMilestone.textContent = projectMilestones.find((milestone) => milestone.id === selectedIssue?.milestone_id)?.name ?? 'None';
    issueDetailOngoingRow.hidden = !selectedIssue.is_ongoing;
    issueDetailSharing.textContent = selectedIssue.is_shared ? 'Shared' : 'Internal only';
    issueDetailApproval.textContent = selectedIssue.approved_at !== null
        ? 'Approved'
        : selectedIssue.approval_requested_at !== null
            ? 'Requested'
            : 'Not requested';
    issueDetailDescription.textContent = selectedIssue.description || 'No description yet.';
    issueDetailDescription.classList.toggle('is-empty', selectedIssue.description === '');
    issueDetailContext.textContent = selectedIssue.context;
    issueDetailExpectedOutcome.textContent = selectedIssue.expected_outcome;
    issueDetailAcceptanceCriteria.textContent = selectedIssue.acceptance_criteria;
    issueDetailContextSection.hidden = selectedIssue.context === '';
    issueDetailExpectedOutcomeSection.hidden = selectedIssue.expected_outcome === '';
    issueDetailAcceptanceCriteriaSection.hidden = selectedIssue.acceptance_criteria === '';
    issueDetailBrief.hidden = selectedIssue.context === ''
        && selectedIssue.expected_outcome === ''
        && selectedIssue.acceptance_criteria === '';
    issueDetailStatusLabel.textContent = issueStatusLabel(selectedIssue.status);
    issueDetailStatus.setAttribute('aria-label', `Change status for ${selectedIssue.title}. Current status: ${issueStatusLabel(selectedIssue.status)}.`);
    issueSourceLink.hidden = selectedIssue.source_message_id === null;
    if (selectedIssue.source_message_id !== null) {
        issueSourceLink.dataset.messageId = String(selectedIssue.source_message_id);
    }
    else {
        delete issueSourceLink.dataset.messageId;
    }
    renderIssuePullRequests();
}
function renderIssuePullRequests(message = '') {
    const hasIssue = selectedIssue !== null;
    const canManage = hasIssue
        && activeProject !== null
        && !projectStatusIsReadOnly(activeProject.status)
        && activeUser?.role !== 'guest';
    const canLink = canManage && activeProject !== null && activeProject.github_repository !== null;
    issuePullRequestsList.replaceChildren(...linkedPullRequests.map((pullRequest) => {
        const item = document.createElement('li');
        item.className = 'issue-pull-request-row';
        const main = document.createElement('div');
        main.className = 'issue-pull-request-main';
        const link = document.createElement('a');
        link.className = 'issue-pull-request-link';
        link.href = pullRequest.html_url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = `${pullRequest.repository_full_name} #${pullRequest.pull_number} · ${pullRequest.title}`;
        const metadata = document.createElement('div');
        metadata.className = 'issue-pull-request-meta';
        const state = document.createElement('span');
        state.className = `issue-pull-request-state${pullRequest.state !== 'open' ? ' is-closed' : ''}`;
        state.textContent = `${pullRequest.is_draft ? 'Draft · ' : ''}${pullRequest.state}`;
        const author = document.createElement('span');
        author.textContent = pullRequest.author_login === '' ? 'Author unknown' : `@${pullRequest.author_login}`;
        const updated = document.createElement('time');
        updated.dateTime = pullRequest.github_updated_at;
        updated.textContent = `Updated ${new Date(`${pullRequest.github_updated_at}Z`).toLocaleDateString()}`;
        metadata.append(state, author, updated);
        main.append(link, metadata);
        item.append(main);
        if (canManage && selectedIssue !== null) {
            const issueId = selectedIssue.id;
            const unlink = document.createElement('button');
            unlink.type = 'button';
            unlink.className = 'button button-quiet';
            unlink.textContent = 'Unlink';
            unlink.setAttribute('aria-label', `Unlink pull request ${pullRequest.repository_full_name} #${pullRequest.pull_number}`);
            unlink.addEventListener('click', () => void unlinkIssuePullRequest(issueId, pullRequest.id, unlink));
            item.append(unlink);
        }
        return item;
    }));
    issuePullRequests.hidden = !hasIssue
        || ((activeProject === null || activeProject.github_repository === null) && linkedPullRequests.length === 0);
    linkPullRequestButton.hidden = !canLink;
    issuePullRequestsEmpty.hidden = linkedPullRequests.length > 0;
    issuePullRequestsEmpty.textContent = message || 'No pull requests linked yet.';
}
async function loadIssuePullRequests(issueId) {
    const requestVersion = ++issuePullRequestsRequestVersion;
    renderIssuePullRequests('Loading pull requests…');
    try {
        const result = await api(`/issues/${issueId}/pull-requests`);
        if (requestVersion !== issuePullRequestsRequestVersion || selectedIssue?.id !== issueId)
            return;
        linkedPullRequests = result.pull_requests;
        renderIssuePullRequests();
    }
    catch (error) {
        if (requestVersion !== issuePullRequestsRequestVersion || selectedIssue?.id !== issueId)
            return;
        linkedPullRequests = [];
        renderIssuePullRequests(error instanceof Error ? error.message : 'Could not load linked pull requests.');
    }
}
async function unlinkIssuePullRequest(issueId, pullRequestId, button) {
    button.disabled = true;
    try {
        await api(`/issues/${issueId}/pull-requests/${pullRequestId}`, { method: 'DELETE' });
        await loadIssuePullRequests(issueId);
    }
    catch (error) {
        button.disabled = false;
        report(error instanceof Error ? error.message : 'Could not unlink pull request.', true);
    }
}
async function loadIssueStatusHistory(issueId) {
    const requestVersion = ++issueStatusHistoryRequestVersion;
    issueStatusHistory.hidden = false;
    issueStatusHistoryCount.textContent = '…';
    issueStatusHistoryList.replaceChildren();
    issueStatusHistoryEmpty.hidden = false;
    issueStatusHistoryEmpty.textContent = 'Loading status history…';
    try {
        const result = await api(`/issues/${issueId}/history`);
        if (requestVersion !== issueStatusHistoryRequestVersion || selectedIssue?.id !== issueId)
            return;
        issueStatusHistoryCount.textContent = String(result.transitions.length);
        issueStatusHistoryEmpty.hidden = result.transitions.length > 0;
        issueStatusHistoryEmpty.textContent = 'No status changes yet.';
        issueStatusHistoryList.replaceChildren(...result.transitions.map(createIssueStatusHistoryRow));
    }
    catch (error) {
        if (requestVersion !== issueStatusHistoryRequestVersion || selectedIssue?.id !== issueId)
            return;
        if (error instanceof ApiFailure && error.status === 401) {
            showSignedOut();
            return;
        }
        issueStatusHistoryCount.textContent = '—';
        issueStatusHistoryEmpty.hidden = false;
        issueStatusHistoryEmpty.textContent = 'Could not load status history.';
        report(error instanceof Error ? error.message : 'Could not load status history.', true);
    }
}
function stopIssueDiscussionPolling() {
    if (issueDiscussionPollTimer !== null)
        window.clearTimeout(issueDiscussionPollTimer);
    issueDiscussionPollTimer = null;
    issueDiscussionRequestVersion += 1;
}
function clearIssueDiscussion() {
    stopIssueDiscussionPolling();
    issueDiscussionMessages = [];
    selectedIssueDiscussionMessageId = null;
    editingIssueDiscussionMessageId = null;
    confirmingIssueDiscussionDeleteId = null;
    issueDiscussionList.replaceChildren();
    issueDiscussionInput.value = '';
    issueDiscussionStatus.textContent = '';
    clearIssueDiscussionReply();
    renderIssueDiscussion();
}
function scheduleIssueDiscussionPoll(issueId) {
    if (issueDiscussionPollTimer !== null)
        window.clearTimeout(issueDiscussionPollTimer);
    issueDiscussionPollTimer = null;
    if (selectedIssue?.id !== issueId || issueDetailView.hidden)
        return;
    issueDiscussionPollTimer = window.setTimeout(() => {
        issueDiscussionPollTimer = null;
        void loadIssueDiscussion(issueId, false);
    }, 5_000);
}
async function loadIssueDiscussion(issueId, showLoading = true) {
    const requestVersion = ++issueDiscussionRequestVersion;
    if (showLoading)
        issueDiscussionStatus.textContent = 'Loading discussion…';
    try {
        const result = await api(`/issues/${issueId}/discussion`);
        if (requestVersion !== issueDiscussionRequestVersion || selectedIssue?.id !== issueId)
            return;
        const changed = result.messages.length !== issueDiscussionMessages.length
            || result.messages.some((message, index) => {
                const current = issueDiscussionMessages[index];
                return current === undefined || current.id !== message.id || current.body !== message.body
                    || current.parent_id !== message.parent_id;
            });
        issueDiscussionMessages = result.messages;
        issueDiscussionStatus.textContent = '';
        updateProjectIssueDiscussionCount(issueId, result.messages.length);
        if (changed)
            renderIssueDiscussion();
    }
    catch (error) {
        if (requestVersion !== issueDiscussionRequestVersion || selectedIssue?.id !== issueId)
            return;
        if (error instanceof ApiFailure && error.status === 401) {
            showSignedOut();
            return;
        }
        issueDiscussionStatus.textContent = error instanceof Error ? error.message : 'Could not load the discussion.';
    }
    finally {
        scheduleIssueDiscussionPoll(issueId);
    }
}
function updateProjectIssueDiscussionCount(issueId, count) {
    const current = projectIssues.find((issue) => issue.id === issueId);
    if (current !== undefined && (current.discussion_count ?? 0) !== count) {
        projectIssues = projectIssues.map((issue) => issue.id === issueId ? { ...issue, discussion_count: count } : issue);
        if (!issuesView.hidden)
            renderProjectIssueBoard();
    }
    if (selectedIssue?.id === issueId && (selectedIssue.discussion_count ?? 0) !== count) {
        selectedIssue = { ...selectedIssue, discussion_count: count };
    }
    inboxUi.updateIssueDiscussionCount(issueId, count);
}
function renderIssueDiscussion() {
    issueDiscussionCount.textContent = String(issueDiscussionMessages.length);
    issueDiscussionEmpty.hidden = issueDiscussionMessages.length > 0;
    const existing = new Map(Array.from(issueDiscussionList.querySelectorAll('.issue-discussion-message'))
        .map((item) => [Number(item.dataset.messageId), item]));
    for (const message of issueDiscussionMessages) {
        const canEdit = canEditIssueDiscussionMessage(message);
        const isEditing = canEdit && editingIssueDiscussionMessageId === message.id;
        const isConfirmingDelete = canEdit && confirmingIssueDiscussionDeleteId === message.id;
        const signature = JSON.stringify([message, canEdit, isEditing, isConfirmingDelete]);
        const current = existing.get(message.id);
        if (current?.dataset.renderSignature === signature) {
            existing.delete(message.id);
            continue;
        }
        const item = createIssueDiscussionMessage(message, canEdit, isEditing, isConfirmingDelete);
        item.dataset.renderSignature = signature;
        if (current !== undefined) {
            const oldEditInput = current.querySelector('[data-discussion-edit-input]');
            const newEditInput = item.querySelector('[data-discussion-edit-input]');
            if (oldEditInput !== null && newEditInput !== null && isEditing)
                newEditInput.value = oldEditInput.value;
            current.replaceWith(item);
            existing.delete(message.id);
        }
        else {
            issueDiscussionList.append(item);
        }
    }
    existing.forEach((item) => item.remove());
}
function canEditIssueDiscussionMessage(message) {
    return activeUser !== null
        && message.author_id === activeUser.id
        && issueDiscussionMessages.at(-1)?.id === message.id
        && activeProject !== null
        && !projectStatusIsReadOnly(activeProject.status);
}
function issueDiscussionMessageElements() {
    return Array.from(issueDiscussionList.querySelectorAll('.issue-discussion-message'));
}
function selectIssueDiscussionMessage(id, focus = true) {
    const item = issueDiscussionList.querySelector(`.issue-discussion-message[data-message-id="${id}"]`);
    if (item === null)
        return;
    selectedIssueDiscussionMessageId = id;
    issueDiscussionMessageElements().forEach((message) => {
        message.classList.toggle('is-keyboard-selected', message === item);
    });
    if (focus)
        item.focus();
}
function moveIssueDiscussionSelection(direction) {
    const messages = issueDiscussionMessageElements();
    if (messages.length === 0) {
        issueDiscussionInput.focus();
        return;
    }
    const currentIndex = messages.findIndex((message) => Number(message.dataset.messageId) === selectedIssueDiscussionMessageId);
    const nextIndex = currentIndex < 0
        ? direction > 0 ? 0 : messages.length - 1
        : Math.max(0, Math.min(messages.length - 1, currentIndex + direction));
    const next = messages[nextIndex];
    if (next !== undefined)
        selectIssueDiscussionMessage(Number(next.dataset.messageId));
}
function moveIssueDiscussionSelectionToBoundary(edge) {
    const messages = issueDiscussionMessageElements();
    const target = messages[edge === 'first' ? 0 : messages.length - 1];
    if (target !== undefined)
        selectIssueDiscussionMessage(Number(target.dataset.messageId));
}
function moveIssueDiscussionSelectionByPage(direction) {
    const messages = issueDiscussionMessageElements();
    if (messages.length === 0) {
        issueDiscussionInput.focus();
        return;
    }
    const currentIndex = messages.findIndex((message) => Number(message.dataset.messageId) === selectedIssueDiscussionMessageId);
    const pageSize = Math.max(1, visibleRowsInViewport(messages, projectMain, '.issue-discussion-message') - 1);
    const baseIndex = currentIndex < 0
        ? direction > 0 ? 0 : Math.min(pageSize, messages.length - 1)
        : currentIndex;
    const targetIndex = Math.max(0, Math.min(messages.length - 1, baseIndex + direction * pageSize));
    const target = messages[targetIndex];
    if (target !== undefined)
        selectIssueDiscussionMessage(Number(target.dataset.messageId));
}
function replyToSelectedIssueDiscussionMessage() {
    if (selectedIssueDiscussionMessageId === null)
        return;
    const message = issueDiscussionMessages.find((candidate) => candidate.id === selectedIssueDiscussionMessageId);
    if (message !== undefined)
        setIssueDiscussionReply(message);
}
function createIssueDiscussionMessage(message, canEdit, isEditing, isConfirmingDelete) {
    const item = document.createElement('li');
    item.className = `issue-discussion-message${message.parent_id === null ? '' : ' is-reply'}`;
    item.dataset.messageId = String(message.id);
    item.tabIndex = -1;
    item.setAttribute('aria-keyshortcuts', 'j k ArrowUp ArrowDown Home End PageUp PageDown Enter r');
    item.addEventListener('focusin', () => selectIssueDiscussionMessage(message.id, false));
    item.addEventListener('click', (event) => {
        if (!(event.target instanceof HTMLElement) || event.target.closest('button') === null) {
            selectIssueDiscussionMessage(message.id);
        }
    });
    const avatar = document.createElement('span');
    avatar.className = 'chat-message-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = avatarInitials(message.author_name);
    item.append(avatar);
    if (message.parent_id !== null && message.parent_body !== null) {
        const parent = document.createElement('button');
        parent.type = 'button';
        parent.className = 'button button-quiet issue-discussion-parent';
        parent.textContent = `↳ ${message.parent_author_name ?? 'Earlier message'}: ${message.parent_body.slice(0, 100)}`;
        parent.addEventListener('click', () => {
            const parentMessage = issueDiscussionList.querySelector(`[data-message-id="${message.parent_id}"]`);
            parentMessage?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            parentMessage?.focus();
        });
        item.append(parent);
    }
    const heading = document.createElement('header');
    heading.className = 'issue-discussion-message-heading';
    const author = document.createElement('span');
    author.className = 'issue-discussion-author';
    author.textContent = message.author_name;
    const time = document.createElement('time');
    time.dateTime = message.created_at.replace(' ', 'T');
    const parsedDate = new Date(message.created_at.replace(' ', 'T'));
    time.textContent = Number.isNaN(parsedDate.getTime())
        ? message.created_at
        : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(parsedDate);
    const reply = document.createElement('button');
    reply.type = 'button';
    reply.className = 'button button-quiet issue-discussion-reply-button';
    reply.textContent = 'Reply';
    reply.disabled = activeProject !== null && projectStatusIsReadOnly(activeProject.status);
    reply.setAttribute('aria-label', `Reply to ${message.author_name}`);
    reply.addEventListener('click', () => setIssueDiscussionReply(message));
    const actions = document.createElement('div');
    actions.className = 'issue-discussion-actions';
    actions.append(reply);
    if (canEdit && isEditing) {
        reply.hidden = true;
    }
    else if (canEdit && isConfirmingDelete) {
        const prompt = document.createElement('span');
        prompt.className = 'issue-discussion-delete-prompt';
        prompt.textContent = 'Delete this message?';
        const confirm = document.createElement('button');
        confirm.type = 'button';
        confirm.className = 'button button-quiet issue-discussion-delete-confirm';
        confirm.textContent = 'Delete';
        confirm.dataset.discussionDelete = '';
        confirm.addEventListener('click', () => void deleteIssueDiscussionMessage(message.id, confirm));
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'button button-quiet issue-discussion-action';
        cancel.textContent = 'Cancel';
        cancel.addEventListener('click', () => {
            confirmingIssueDiscussionDeleteId = null;
            renderIssueDiscussion();
            issueDiscussionList.querySelector(`[data-message-id="${message.id}"] [data-discussion-delete-begin]`)?.focus();
        });
        actions.append(prompt, confirm, cancel);
    }
    else if (canEdit) {
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'button button-quiet issue-discussion-action';
        edit.textContent = 'Edit';
        edit.dataset.discussionEdit = '';
        edit.setAttribute('aria-label', `Edit your message from ${message.author_name}`);
        edit.addEventListener('click', () => {
            editingIssueDiscussionMessageId = message.id;
            confirmingIssueDiscussionDeleteId = null;
            renderIssueDiscussion();
            issueDiscussionList.querySelector(`[data-message-id="${message.id}"] [data-discussion-edit-input]`)?.focus();
        });
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'button button-quiet issue-discussion-action';
        remove.textContent = 'Delete';
        remove.dataset.discussionDeleteBegin = '';
        remove.setAttribute('aria-label', `Delete your message from ${message.author_name}`);
        remove.addEventListener('click', () => {
            confirmingIssueDiscussionDeleteId = message.id;
            editingIssueDiscussionMessageId = null;
            renderIssueDiscussion();
            issueDiscussionList.querySelector(`[data-message-id="${message.id}"] [data-discussion-delete]`)?.focus();
        });
        actions.append(edit, remove);
    }
    heading.append(author, time, actions);
    if (canEdit && isEditing) {
        const form = document.createElement('form');
        form.className = 'issue-discussion-edit-form';
        const label = document.createElement('label');
        const inputId = `issue-discussion-edit-input-${message.id}`;
        label.htmlFor = inputId;
        label.textContent = 'Edit message';
        const input = document.createElement('textarea');
        input.id = inputId;
        input.rows = 3;
        input.maxLength = 10_000;
        input.required = true;
        input.value = message.body;
        input.dataset.discussionEditInput = '';
        const formActions = document.createElement('div');
        formActions.className = 'form-actions';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'button button-quiet';
        cancel.textContent = 'Cancel';
        cancel.addEventListener('click', () => {
            editingIssueDiscussionMessageId = null;
            renderIssueDiscussion();
            issueDiscussionList.querySelector(`[data-message-id="${message.id}"] [data-discussion-edit]`)?.focus();
        });
        const save = document.createElement('button');
        save.type = 'submit';
        save.className = 'button button-primary';
        save.textContent = 'Save';
        formActions.append(cancel, save);
        form.append(label, input, formActions);
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            void saveIssueDiscussionMessage(message.id, input.value, save);
        });
        item.append(heading, form);
    }
    else {
        const body = document.createElement('p');
        body.className = 'issue-discussion-body';
        body.textContent = message.body;
        item.append(heading, body);
    }
    return item;
}
async function saveIssueDiscussionMessage(messageId, body, button) {
    const issueId = selectedIssue?.id;
    if (issueId === undefined || body.trim() === '')
        return;
    button.disabled = true;
    try {
        const result = await api(`/issues/${issueId}/discussion/${messageId}`, {
            method: 'PATCH',
            body: JSON.stringify({ body }),
        });
        if (selectedIssue?.id !== issueId)
            return;
        issueDiscussionMessages = issueDiscussionMessages.map((message) => message.id === messageId ? result.message : message);
        editingIssueDiscussionMessageId = null;
        issueDiscussionStatus.textContent = 'Message updated.';
        renderIssueDiscussion();
        issueDiscussionList.querySelector(`[data-message-id="${messageId}"] [data-discussion-edit]`)?.focus();
    }
    catch (error) {
        issueDiscussionStatus.textContent = error instanceof Error ? error.message : 'Could not update the message.';
    }
    finally {
        button.disabled = false;
    }
}
async function deleteIssueDiscussionMessage(messageId, button) {
    const issueId = selectedIssue?.id;
    if (issueId === undefined)
        return;
    button.disabled = true;
    try {
        await api(`/issues/${issueId}/discussion/${messageId}`, { method: 'DELETE' });
        if (selectedIssue?.id !== issueId)
            return;
        issueDiscussionMessages = issueDiscussionMessages.filter((message) => message.id !== messageId);
        confirmingIssueDiscussionDeleteId = null;
        updateProjectIssueDiscussionCount(issueId, issueDiscussionMessages.length);
        issueDiscussionStatus.textContent = 'Message deleted.';
        renderIssueDiscussion();
        const latest = issueDiscussionMessages.at(-1);
        if (latest === undefined)
            issueDiscussionHeading.focus();
        else
            selectIssueDiscussionMessage(latest.id);
    }
    catch (error) {
        issueDiscussionStatus.textContent = error instanceof Error ? error.message : 'Could not delete the message.';
    }
    finally {
        button.disabled = false;
    }
}
function setIssueDiscussionReply(message) {
    selectIssueDiscussionMessage(message.id, false);
    issueDiscussionParent = message;
    const excerpt = message.body.length > 100 ? `${message.body.slice(0, 100)}…` : message.body;
    issueDiscussionReplyLabel.textContent = `Replying to ${message.author_name}: ${excerpt}`;
    issueDiscussionReplyContext.hidden = false;
    issueDiscussionInput.focus();
}
function clearIssueDiscussionReply() {
    issueDiscussionParent = null;
    issueDiscussionReplyLabel.textContent = '';
    issueDiscussionReplyContext.hidden = true;
}
async function postIssueDiscussionMessage(event) {
    event.preventDefault();
    const issueId = selectedIssue?.id;
    const body = issueDiscussionInput.value.trim();
    if (issueId === undefined || body === '')
        return;
    const parentId = issueDiscussionParent?.id ?? null;
    issueDiscussionSubmit.disabled = true;
    issueDiscussionStatus.textContent = '';
    try {
        const result = await api(`/issues/${issueId}/discussion`, {
            method: 'POST',
            body: JSON.stringify({ body, parent_id: parentId }),
        });
        if (selectedIssue?.id !== issueId)
            return;
        issueDiscussionMessages.push(result.message);
        editingIssueDiscussionMessageId = null;
        confirmingIssueDiscussionDeleteId = null;
        updateProjectIssueDiscussionCount(issueId, issueDiscussionMessages.length);
        renderIssueDiscussion();
        if (issueDiscussionInput.value.trim() === body)
            issueDiscussionInput.value = '';
        if (issueDiscussionParent?.id === parentId)
            clearIssueDiscussionReply();
        issueDiscussionList.querySelector(`[data-message-id="${result.message.id}"]`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        issueDiscussionInput.focus();
    }
    catch (error) {
        if (error instanceof ApiFailure && error.status === 401) {
            showSignedOut();
            return;
        }
        issueDiscussionStatus.textContent = error instanceof Error ? error.message : 'Could not send the message.';
    }
    finally {
        issueDiscussionSubmit.disabled = false;
    }
}
function createIssueStatusHistoryRow(transition) {
    const item = document.createElement('li');
    item.className = 'issue-status-history-item';
    const change = document.createElement('span');
    change.className = 'issue-status-history-change';
    change.textContent = transition.from_status === null
        ? `Set to ${issueStatusLabel(transition.to_status)}`
        : `${issueStatusLabel(transition.from_status)} → ${issueStatusLabel(transition.to_status)}`;
    const actor = document.createElement('span');
    actor.className = 'issue-status-history-actor';
    actor.textContent = transition.actor_name;
    const time = document.createElement('time');
    time.dateTime = transition.created_at.replace(' ', 'T');
    const parsedDate = new Date(transition.created_at.replace(' ', 'T'));
    time.textContent = Number.isNaN(parsedDate.getTime())
        ? transition.created_at
        : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(parsedDate);
    item.append(change, actor, time);
    return item;
}
function focusIssueTitleButton(issueId) {
    const button = issueList.querySelector(`.issue-card[data-issue-id="${issueId}"] .issue-title-button`);
    if (button === null)
        return false;
    button.focus();
    return true;
}
function closeIssueDetailEditForm() {
    resetIssueDetailEditForm();
    issueDetailEditForm.hidden = true;
    issueDetailDisplay.hidden = false;
    if (!issueDetailView.hidden)
        issueDetailEditButton.focus();
}
function resetIssueDetailEditForm() {
    issueDetailEditForm.reset();
    issueDetailOngoingInput.disabled = false;
    issueDetailOngoingInput.title = '';
    updateOngoingMilestoneControl(issueDetailOngoingInput, issueDetailMilestoneInput);
}
function openIssue(issue) {
    stopIssueDiscussionPolling();
    selectedIssue = issue;
    linkedPullRequests = [];
    issueDiscussionMessages = [];
    selectedIssueDiscussionMessageId = null;
    issueDiscussionList.replaceChildren();
    issueDiscussionInput.value = '';
    clearIssueDiscussionReply();
    renderIssueDiscussion();
    issueList.querySelectorAll('.issue-card').forEach((row) => {
        row.classList.toggle('is-keyboard-selected', row.dataset.issueId === String(issue.id));
    });
    issueDetailDisplay.hidden = false;
    issueDetailEditForm.hidden = true;
    renderIssueDetail();
    void loadIssuePullRequests(issue.id);
    void loadIssueStatusHistory(issue.id);
    void loadIssueDiscussion(issue.id);
    switchProjectTab('issues');
    issueBackButton.focus();
}
function openIssueStatusPicker(issue, returnFocus) {
    if (issueStatusPicker.open)
        issueStatusPicker.close();
    issueStatusPickerIssue = issue;
    issueStatusPickerReturnFocus = returnFocus;
    issueStatusPickerDescription.textContent = `Choose a status for “${issue.title}”. Current status: ${issueStatusLabel(issue.status)}.`;
    issueStatusPickerOptions.replaceChildren();
    const statusOptions = issueStatusOptions(issue);
    issueStatusPickerOptionIndex = statusOptions.findIndex((option) => option.value === issue.status);
    statusOptions.forEach((option, index) => {
        const button = document.createElement('button');
        button.className = 'button issue-status-option';
        button.type = 'button';
        button.setAttribute('role', 'option');
        button.dataset.status = option.value;
        button.textContent = option.label;
        if (option.value === issue.status) {
            const current = document.createElement('span');
            current.className = 'issue-status-current';
            current.textContent = 'Current';
            button.append(current);
        }
        button.addEventListener('click', () => {
            focusIssueStatusPickerOption(index);
            void applyIssueStatusPickerSelection();
        });
        issueStatusPickerOptions.append(button);
    });
    issueStatusPicker.showModal();
    focusIssueStatusPickerOption(Math.max(0, issueStatusPickerOptionIndex));
}
function focusIssueStatusPickerOption(index) {
    const options = Array.from(issueStatusPickerOptions.querySelectorAll('.issue-status-option'));
    if (options.length === 0)
        return;
    issueStatusPickerOptionIndex = Math.max(0, Math.min(options.length - 1, index));
    options.forEach((option, optionIndex) => {
        const active = optionIndex === issueStatusPickerOptionIndex;
        option.classList.toggle('is-active', active);
        option.setAttribute('aria-selected', String(active));
        option.tabIndex = active ? 0 : -1;
    });
    options[issueStatusPickerOptionIndex]?.focus();
}
function closeIssueStatusPicker() {
    if (issueStatusPicker.open)
        issueStatusPicker.close();
}
function openIssueDeleteConfirmation(issue = selectedIssue) {
    if (issue === null)
        return;
    issueDeleteTarget = issue;
    issueDeleteDescription.textContent = `“${issue.title}” is currently ${issueStatusLabel(issue.status)}. It will be moved to Deleted issues, where you can restore it later.`;
    issueDeleteError.textContent = '';
    issueDeleteError.hidden = true;
    issueDeleteConfirmation.showModal();
    issueDeleteCancel.focus();
}
function closeIssueDeleteConfirmation() {
    if (issueDeleteConfirmation.open)
        issueDeleteConfirmation.close();
    issueDeleteTarget = null;
    issueDeleteError.textContent = '';
    issueDeleteError.hidden = true;
    issueDeleteConfirm.disabled = false;
}
async function deleteSelectedIssue() {
    const issue = issueDeleteTarget;
    const projectId = activeProject?.id;
    if (issue === null || projectId !== issue.project_id)
        return;
    issueDeleteConfirm.disabled = true;
    issueDeleteError.textContent = '';
    issueDeleteError.hidden = true;
    try {
        await api(`/issues/${issue.id}`, { method: 'DELETE' });
        closeIssueDeleteConfirmation();
        if (activeProject?.id !== projectId)
            return;
        if (selectedIssue?.id === issue.id) {
            selectedIssue = null;
            resetIssueDetailEditForm();
            issueDetailEditForm.hidden = true;
            issueDetailDisplay.hidden = false;
            switchProjectTab('issues', issue.id);
            if (!deletedIssuesDetails.open)
                void loadDeletedProjectIssues(projectId);
        }
        else {
            await loadProjectIssues(projectId);
            if (!deletedIssuesDetails.open)
                await loadDeletedProjectIssues(projectId);
            if (!focusIssueTitleButton(issue.id))
                issueFilter.focus();
        }
        report('Issue moved to Deleted issues. You can restore it from the issue list.');
    }
    catch (error) {
        if (error instanceof ApiFailure && error.status === 401) {
            closeIssueDeleteConfirmation();
            showSignedOut();
            return;
        }
        issueDeleteError.textContent = error instanceof Error ? error.message : 'Could not delete the issue.';
        issueDeleteError.hidden = false;
        issueDeleteConfirm.focus();
    }
    finally {
        issueDeleteConfirm.disabled = false;
    }
}
async function restoreIssue(issue, restoreButton) {
    restoreButton.disabled = true;
    try {
        await api(`/issues/${issue.id}/restore`, { method: 'POST' });
        await loadProjectIssues(issue.project_id);
        if (!focusIssueTitleButton(issue.id))
            issuesTabButton.focus();
        report('Issue restored.');
    }
    catch (error) {
        report(error instanceof Error ? error.message : 'Could not restore the issue.', true);
    }
    finally {
        restoreButton.disabled = false;
    }
}
function showDeletedIssues(restoreIssueId) {
    const projectId = activeProject?.id;
    if (projectId === undefined || deletedProjectIssues.length === 0)
        return;
    selectedIssue = null;
    resetIssueDetailEditForm();
    issueDetailEditForm.hidden = true;
    issueDetailDisplay.hidden = false;
    switchProjectTab('issues', undefined, false);
    deletedIssuesDetails.open = true;
    void loadDeletedProjectIssues(projectId).then(() => {
        if (activeProject?.id !== projectId || issuesView.hidden || deletedProjectIssues.length === 0)
            return;
        deletedIssuesDetails.scrollIntoView({ block: 'nearest' });
        if (restoreIssueId !== undefined) {
            const restoreButton = Array.from(deletedIssueList.querySelectorAll('.deleted-issue-item button'))
                .find((button) => button.dataset.issueId === String(restoreIssueId));
            if (restoreButton !== undefined) {
                restoreButton.click();
                return;
            }
        }
        deletedIssuesDetails.querySelector('summary')?.focus();
    });
}
async function applyIssueStatusPickerSelection() {
    const issue = issueStatusPickerIssue;
    const status = issue === null ? undefined : issueStatusOptions(issue)[issueStatusPickerOptionIndex]?.value;
    if (issue === null || status === undefined)
        return;
    closeIssueStatusPicker();
    if (status !== issue.status)
        await updateIssueStatus(issue, status);
    if (activeProject?.id !== issue.project_id)
        return;
    if (issueDetailView.hidden) {
        if (!focusIssueTitleButton(issue.id))
            issuesTabButton.focus();
    }
    else {
        issueDetailStatus.focus();
    }
}
function createIssueStatusButton(issue) {
    const button = document.createElement('button');
    button.className = 'button issue-status-button';
    button.type = 'button';
    button.disabled = activeProject !== null && projectStatusIsReadOnly(activeProject.status);
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-label', `Change status for ${issue.title}. Current status: ${issueStatusLabel(issue.status)}.`);
    const label = document.createElement('span');
    label.textContent = issueStatusLabel(issue.status);
    const caret = document.createElement('span');
    caret.className = 'issue-status-caret';
    caret.setAttribute('aria-hidden', 'true');
    caret.textContent = '▾';
    button.append(label, caret);
    button.addEventListener('click', () => openIssueStatusPicker(issue, button));
    return button;
}
async function updateIssueStatus(issue, nextStatus) {
    const previousStatus = selectedIssue?.id === issue.id ? selectedIssue.status : issue.status;
    if (nextStatus === previousStatus)
        return;
    try {
        const result = await api(`/issues/${issue.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: nextStatus }),
        });
        if (selectedIssue?.id === issue.id) {
            selectedIssue = result.issue;
            projectIssues = projectIssues.map((candidate) => candidate.id === issue.id ? result.issue : candidate);
            renderIssueDetail();
            renderProjectIssueBoard();
            if (previousStatus !== result.issue.status)
                void loadIssueStatusHistory(issue.id);
        }
        report('Issue status updated.');
        if (issueDetailView.hidden)
            await loadProjectIssues(issue.project_id);
    }
    catch (error) {
        report(error instanceof Error ? error.message : 'Could not update the issue status.', true);
    }
}
function createIssueRow(issue, reorder, allowBulkMoveSelection = false, allowBulkAssignSelection = false) {
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
    let sharedIndicator = null;
    if (issue.is_shared) {
        const shared = document.createElement('span');
        shared.className = 'issue-shared-tag';
        shared.textContent = 'Shared';
        shared.setAttribute('role', 'img');
        shared.setAttribute('aria-label', 'Shared with guests');
        shared.title = 'Shared with guests';
        const shareIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        shareIcon.setAttribute('viewBox', '0 0 16 16');
        shareIcon.setAttribute('aria-hidden', 'true');
        shareIcon.setAttribute('focusable', 'false');
        const shareLines = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        shareLines.setAttribute('d', 'M5.8 7 10.2 4.9M5.8 9 10.2 11.1');
        const shareStart = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        shareStart.setAttribute('cx', '4');
        shareStart.setAttribute('cy', '8');
        shareStart.setAttribute('r', '2');
        const shareTop = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        shareTop.setAttribute('cx', '12');
        shareTop.setAttribute('cy', '4');
        shareTop.setAttribute('r', '2');
        const shareBottom = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        shareBottom.setAttribute('cx', '12');
        shareBottom.setAttribute('cy', '12');
        shareBottom.setAttribute('r', '2');
        shareIcon.append(shareLines, shareStart, shareTop, shareBottom);
        shared.append(shareIcon);
        sharedIndicator = shared;
    }
    const statusColumn = document.createElement('span');
    statusColumn.className = 'issue-status-column';
    statusColumn.append(indicator);
    if (sharedIndicator !== null)
        statusColumn.append(sharedIndicator);
    const title = document.createElement('button');
    title.className = 'issue-title issue-title-button';
    title.type = 'button';
    title.textContent = issue.title;
    title.addEventListener('click', () => openIssue(issue));
    mainline.append(statusColumn, key, title);
    const discussionIndicator = createDiscussionIndicator(issue.discussion_count ?? 0);
    const metadata = document.createElement('div');
    metadata.className = 'issue-metadata';
    if (issue.type !== 'task') {
        const type = document.createElement('span');
        type.className = 'issue-type-tag';
        type.textContent = issueTypeLabel(issue.type);
        metadata.append(type);
    }
    if (issue.priority !== 'medium') {
        const priority = document.createElement('span');
        priority.className = `issue-priority-tag is-${issue.priority}`;
        priority.textContent = `${issuePriorityLabel(issue.priority)} priority`;
        metadata.append(priority);
    }
    if (issue.due_date !== null) {
        const dueDate = document.createElement('span');
        const overdue = isIssueOverdue(issue);
        dueDate.className = `issue-due-date-tag${overdue ? ' is-overdue' : ''}`;
        dueDate.textContent = `${overdue ? 'Overdue' : 'Due'} ${formatIssueDueDate(issue.due_date)}`;
        dueDate.title = `${overdue ? 'Overdue' : 'Due'} ${issue.due_date}`;
        metadata.append(dueDate);
    }
    if (issue.is_ongoing) {
        const ongoing = document.createElement('span');
        ongoing.className = 'issue-ongoing-tag';
        ongoing.textContent = 'Ongoing';
        ongoing.title = 'Continuous work outside milestone completion.';
        metadata.append(ongoing);
    }
    if (issue.milestone_name !== null && issue.milestone_name !== undefined && reorder?.showMilestoneTag !== false) {
        const milestone = document.createElement('span');
        milestone.className = 'issue-milestone-tag';
        milestone.textContent = issue.milestone_name;
        milestone.title = `Milestone: ${issue.milestone_name}`;
        metadata.append(milestone);
    }
    if (issue.assignee_id !== null) {
        const assignee = document.createElement('span');
        assignee.className = 'issue-assignee-label';
        assignee.textContent = issueAssigneeLabel(issue.assignee_id);
        assignee.title = 'Assignee';
        metadata.append(assignee);
    }
    if (issue.source_message_id !== null) {
        const source = document.createElement('span');
        source.className = 'issue-source';
        source.textContent = 'From chat thread';
        metadata.append(source);
    }
    content.append(mainline, metadata);
    if (issue.description !== '') {
        const description = document.createElement('p');
        description.className = 'issue-description';
        description.textContent = issue.description;
        content.append(description);
    }
    const hasReorderActions = reorder?.canMoveEarlier !== undefined || reorder?.canMoveLater !== undefined;
    if (!hasReorderActions) {
        const actions = document.createElement('div');
        actions.className = 'issue-row-actions';
        if (allowBulkMoveSelection)
            actions.append(createIssueBulkSelectCheckbox(issue));
        if (allowBulkAssignSelection)
            actions.append(createIssueBulkAssignCheckbox(issue));
        if (discussionIndicator !== null)
            actions.append(discussionIndicator);
        actions.append(createIssueStatusButton(issue));
        item.append(content, actions);
    }
    else {
        const actions = document.createElement('div');
        actions.className = 'issue-row-actions';
        if (allowBulkMoveSelection)
            actions.append(createIssueBulkSelectCheckbox(issue));
        if (allowBulkAssignSelection)
            actions.append(createIssueBulkAssignCheckbox(issue));
        if (discussionIndicator !== null)
            actions.append(discussionIndicator);
        for (const direction of ['up', 'down']) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'button button-quiet issue-order-button';
            button.dataset.moveDirection = direction;
            button.disabled = (direction === 'up'
                ? reorder?.canMoveEarlier !== true
                : reorder?.canMoveLater !== true)
                || (activeProject !== null && projectStatusIsReadOnly(activeProject.status));
            button.textContent = direction === 'up' ? '↑' : '↓';
            button.setAttribute('aria-label', `Move ${issue.title} ${direction === 'up' ? 'earlier' : 'later'}`);
            button.addEventListener('click', () => void moveIssue(issue, direction, button));
            actions.append(button);
        }
        actions.append(createIssueStatusButton(issue));
        item.append(content, actions);
    }
    return item;
}
function createIssueBulkSelectCheckbox(issue) {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'issue-bulk-select-checkbox';
    checkbox.dataset.issueId = String(issue.id);
    checkbox.checked = selectedBulkMoveIssueIds.has(issue.id);
    checkbox.disabled = bulkMovePending || bulkSelectionActionPending
        || (!checkbox.checked && selectedBulkMoveIssueIds.size >= 500)
        || (activeProject !== null && projectStatusIsReadOnly(activeProject.status));
    checkbox.setAttribute('aria-label', `Select ${issue.title}`);
    checkbox.addEventListener('change', () => {
        if (bulkMovePending || bulkSelectionActionPending)
            return;
        if (checkbox.checked) {
            if (selectedBulkMoveIssueIds.size >= 500) {
                checkbox.checked = false;
                report('Move up to 500 issues at a time.', true);
                return;
            }
            selectedBulkMoveIssueIds.add(issue.id);
        }
        else {
            selectedBulkMoveIssueIds.delete(issue.id);
        }
        renderProjectIssueBoard();
    });
    return checkbox;
}
function createIssueBulkAssignCheckbox(issue) {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'issue-bulk-assign-checkbox';
    checkbox.dataset.issueId = String(issue.id);
    checkbox.checked = selectedBulkAssignIssueIds.has(issue.id);
    checkbox.disabled = bulkSelectionActionPending || bulkMovePending
        || (!checkbox.checked && selectedBulkAssignIssueIds.size >= 500)
        || (activeProject !== null && projectStatusIsReadOnly(activeProject.status));
    checkbox.setAttribute('aria-label', `Select ${issue.title} for assignment`);
    checkbox.addEventListener('change', () => {
        if (bulkSelectionActionPending)
            return;
        if (checkbox.checked) {
            if (selectedBulkAssignIssueIds.size >= 500) {
                checkbox.checked = false;
                report('Assign up to 500 issues at a time.', true);
                return;
            }
            selectedBulkAssignIssueIds.add(issue.id);
        }
        else {
            selectedBulkAssignIssueIds.delete(issue.id);
        }
        renderProjectIssueBoard();
    });
    return checkbox;
}
function createDiscussionIndicator(count) {
    const label = discussionIndicatorLabel(count);
    if (label === null)
        return null;
    const indicator = document.createElement('span');
    indicator.className = 'issue-discussion-indicator';
    indicator.setAttribute('role', 'img');
    indicator.setAttribute('aria-label', label);
    indicator.title = label;
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 11 10');
    icon.setAttribute('aria-hidden', 'true');
    const bubble = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    // A pixel-grid speech bubble, drawn on 1px cells so it stays crisp.
    bubble.setAttribute('d', 'M1 0h9v1H1zM0 1h1v6H0zM10 1h1v6h-1zM1 7h9v1H1zM3 8h2v1H3zM3 9h1v1H3z');
    icon.append(bubble);
    const value = document.createElement('span');
    value.setAttribute('aria-hidden', 'true');
    value.textContent = String(count);
    indicator.append(icon, value);
    return indicator;
}
async function moveIssue(issue, direction, button) {
    const projectId = activeProject?.id;
    if (projectId === undefined || projectId !== issue.project_id)
        return;
    button.disabled = true;
    try {
        const result = await api(`/issues/${issue.id}/move`, {
            method: 'POST',
            body: JSON.stringify({ direction }),
        });
        if (activeProject?.id !== projectId || issuesView.hidden)
            return;
        projectIssues = projectIssues.map((candidate) => candidate.id === issue.id ? result.issue : candidate);
        renderProjectIssueBoard();
        const movedIssueRow = issueList.querySelector(`.issue-card[data-issue-id="${issue.id}"]`);
        const focusTarget = movedIssueRow?.querySelector(`[data-move-direction="${direction}"]:not(:disabled)`) ?? movedIssueRow?.querySelector('.issue-title-button');
        focusTarget?.focus();
    }
    catch (error) {
        if (error instanceof ApiFailure && error.status === 401) {
            showSignedOut();
            return;
        }
        report(error instanceof Error ? error.message : 'Could not reorder the issue.', true);
    }
    finally {
        button.disabled = false;
    }
}
function issueAiPromptDraft(issue) {
    return {
        ...issue,
        context: issueAiPromptContext.value.trim(),
        expected_outcome: issueAiPromptOutcome.value.trim(),
        acceptance_criteria: issueAiPromptCriteria.value.trim(),
    };
}
function issueAiPromptHasChanges(issue) {
    return issueAiPromptContext.value.trim() !== issue.context
        || issueAiPromptOutcome.value.trim() !== issue.expected_outcome
        || issueAiPromptCriteria.value.trim() !== issue.acceptance_criteria;
}
function renderIssueAiPromptStep() {
    issueAiPromptSteps.forEach((step, index) => { step.hidden = index !== issueAiPromptStepIndex; });
    const isPreview = issueAiPromptStepIndex === issueAiPromptSteps.length - 1;
    issueAiPromptStepCount.textContent = `Step ${issueAiPromptStepIndex + 1} of ${issueAiPromptSteps.length}`;
    issueAiPromptBackButton.hidden = issueAiPromptStepIndex === 0;
    issueAiPromptSkipButton.hidden = isPreview;
    issueAiPromptNextButton.hidden = isPreview;
    issueAiPromptActions.hidden = !isPreview;
    if (isPreview && selectedIssue !== null) {
        issueAiPromptPreview.value = formatIssuePrompt(issueAiPromptDraft(selectedIssue));
        issueAiPromptSaveButton.disabled = !issueAiPromptHasChanges(selectedIssue);
    }
}
function updateIssueAiPromptDraft() {
    if (selectedIssue === null)
        return;
    issueAiPromptStatus.textContent = issueAiPromptHasChanges(selectedIssue) ? 'Unsaved context changes.' : '';
    issueAiPromptStatus.classList.remove('is-error');
    issueAiPromptSaveButton.disabled = !issueAiPromptHasChanges(selectedIssue);
    if (issueAiPromptStepIndex === issueAiPromptSteps.length - 1)
        renderIssueAiPromptStep();
}
function openIssueAiPrompt() {
    if (selectedIssue === null)
        return;
    issueAiPromptReturnFocus = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : issueAiPromptButton;
    issueAiPromptContext.value = selectedIssue.context;
    issueAiPromptOutcome.value = selectedIssue.expected_outcome;
    issueAiPromptCriteria.value = selectedIssue.acceptance_criteria;
    issueAiPromptStepIndex = 0;
    issueAiPromptStatus.textContent = '';
    issueAiPromptStatus.classList.remove('is-error');
    renderIssueAiPromptStep();
    issueAiPromptDialog.showModal();
    issueAiPromptContext.focus();
}
async function saveIssueAiPromptContext() {
    const issue = selectedIssue;
    if (issue === null || !issueAiPromptHasChanges(issue))
        return;
    const draft = issueAiPromptDraft(issue);
    issueAiPromptSaveButton.disabled = true;
    issueAiPromptStatus.classList.remove('is-error');
    issueAiPromptStatus.textContent = 'Saving prompt context…';
    try {
        const result = await api(`/issues/${issue.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                context: draft.context,
                expected_outcome: draft.expected_outcome,
                acceptance_criteria: draft.acceptance_criteria,
            }),
        });
        if (selectedIssue?.id !== issue.id || activeProject?.id !== issue.project_id)
            return;
        selectedIssue = result.issue;
        projectIssues = projectIssues.map((candidate) => candidate.id === issue.id ? result.issue : candidate);
        renderIssueDetail();
        renderProjectIssueBoard();
        issueAiPromptSaveButton.disabled = true;
        issueAiPromptStatus.textContent = 'Prompt context saved to this issue.';
    }
    catch (error) {
        if (error instanceof ApiFailure && error.status === 401) {
            issueAiPromptDialog.close();
            showSignedOut();
            return;
        }
        issueAiPromptStatus.classList.add('is-error');
        issueAiPromptStatus.textContent = error instanceof Error ? error.message : 'Could not save prompt context.';
        issueAiPromptSaveButton.disabled = false;
    }
}
async function copyIssueAiPrompt(text, message) {
    try {
        await navigator.clipboard.writeText(text);
        issueAiPromptStatus.classList.remove('is-error');
        issueAiPromptStatus.textContent = message;
    }
    catch {
        issueAiPromptPreview.value = text;
        issueAiPromptPreview.focus();
        issueAiPromptPreview.select();
        issueAiPromptStatus.classList.remove('is-error');
        issueAiPromptStatus.textContent = 'Clipboard unavailable. Export text selected for copying.';
    }
}
function downloadIssueMarkdown(issue) {
    const markdown = formatIssueMarkdown(issue);
    const blobUrl = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    const titleSlug = issue.title.toLocaleLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60) || 'issue';
    const download = document.createElement('a');
    download.href = blobUrl;
    download.download = `issue-${issue.id}-${titleSlug}.md`;
    document.body.append(download);
    download.click();
    download.remove();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
}
issueAiPromptButton.addEventListener('click', openIssueAiPrompt);
issueAiPromptCloseButton.addEventListener('click', () => issueAiPromptDialog.close());
issueAiPromptDialog.addEventListener('close', () => {
    const target = issueAiPromptReturnFocus;
    issueAiPromptReturnFocus = null;
    if (target !== null && target.isConnected && target.closest('[hidden]') === null
        && document.querySelector('dialog[open]') === null) {
        target.focus();
    }
});
issueAiPromptNextButton.addEventListener('click', () => {
    issueAiPromptStepIndex = Math.min(issueAiPromptStepIndex + 1, issueAiPromptSteps.length - 1);
    renderIssueAiPromptStep();
    const nextField = [issueAiPromptOutcome, issueAiPromptCriteria, issueAiPromptPreview][issueAiPromptStepIndex - 1];
    nextField?.focus();
});
issueAiPromptBackButton.addEventListener('click', () => {
    issueAiPromptStepIndex = Math.max(issueAiPromptStepIndex - 1, 0);
    renderIssueAiPromptStep();
    [issueAiPromptContext, issueAiPromptOutcome, issueAiPromptCriteria][issueAiPromptStepIndex]?.focus();
});
issueAiPromptSkipButton.addEventListener('click', () => {
    issueAiPromptStepIndex = issueAiPromptSteps.length - 1;
    renderIssueAiPromptStep();
    issueAiPromptPreview.focus();
});
for (const field of [issueAiPromptContext, issueAiPromptOutcome, issueAiPromptCriteria]) {
    field.addEventListener('input', updateIssueAiPromptDraft);
}
issueAiPromptSaveButton.addEventListener('click', () => void saveIssueAiPromptContext());
issueAiPromptCopyButton.addEventListener('click', () => {
    if (selectedIssue === null)
        return;
    const prompt = formatIssuePrompt(issueAiPromptDraft(selectedIssue));
    issueAiPromptPreview.value = prompt;
    void copyIssueAiPrompt(prompt, 'Prompt copied.');
});
issueAiPromptCopyMarkdownButton.addEventListener('click', () => {
    if (selectedIssue === null)
        return;
    void copyIssueAiPrompt(formatIssueMarkdown(issueAiPromptDraft(selectedIssue)), 'Markdown copied.');
});
issueAiPromptDownloadButton.addEventListener('click', () => {
    if (selectedIssue === null)
        return;
    downloadIssueMarkdown(issueAiPromptDraft(selectedIssue));
    issueAiPromptStatus.classList.remove('is-error');
    issueAiPromptStatus.textContent = 'Markdown downloaded.';
});
issueDetailEditButton.addEventListener('click', () => {
    if (selectedIssue === null)
        return;
    issueDetailTitleInput.value = selectedIssue.title;
    issueDetailDescriptionInput.value = selectedIssue.description;
    issueDetailPriorityInput.value = selectedIssue.priority;
    issueDetailDueDateInput.value = selectedIssue.due_date ?? '';
    issueDetailTypeInput.value = selectedIssue.type;
    populateIssueAssigneeSelect(issueDetailAssigneeInput, selectedIssue.assignee_id);
    populateIssueMilestoneSelect(issueDetailMilestoneInput, selectedIssue.milestone_id);
    issueDetailOngoingInput.checked = selectedIssue.is_ongoing;
    issueDetailOngoingInput.disabled = selectedIssue.status === 'done' && !selectedIssue.is_ongoing;
    issueDetailOngoingInput.title = issueDetailOngoingInput.disabled ? 'Move this issue out of Done before marking it as ongoing.' : '';
    updateOngoingMilestoneControl(issueDetailOngoingInput, issueDetailMilestoneInput);
    issueDetailSharedInput.checked = selectedIssue.is_shared;
    issueDetailApprovalInput.checked = selectedIssue.approval_requested_at !== null;
    issueDetailApprovalInput.disabled = !selectedIssue.is_shared;
    issueDetailDisplay.hidden = true;
    issueDetailEditForm.hidden = false;
    issueDetailTitleInput.focus();
});
issueDetailDeleteButton.addEventListener('click', () => openIssueDeleteConfirmation());
issueDeleteCancel.addEventListener('click', closeIssueDeleteConfirmation);
issueDeleteConfirm.addEventListener('click', () => void deleteSelectedIssue());
issueDetailCancelButton.addEventListener('click', () => {
    closeIssueDetailEditForm();
});
issueBackButton.addEventListener('click', () => {
    const issueId = selectedIssue?.id;
    selectedIssue = null;
    resetIssueDetailEditForm();
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
                priority: issueDetailPriorityInput.value,
                due_date: issueDetailDueDateInput.value === '' ? null : issueDetailDueDateInput.value,
                type: issueDetailTypeInput.value,
                assignee_id: issueDetailAssigneeInput.value === '' ? null : Number(issueDetailAssigneeInput.value),
                milestone_id: issueDetailOngoingInput.checked || issueDetailMilestoneInput.value === ''
                    ? null
                    : Number(issueDetailMilestoneInput.value),
                is_ongoing: issueDetailOngoingInput.checked,
                is_shared: issueDetailSharedInput.checked,
                approval_requested: issueDetailApprovalInput.checked,
            }),
        });
        if (selectedIssue?.id !== issue.id || activeProject?.id !== issue.project_id)
            return;
        selectedIssue = result.issue;
        projectIssues = projectIssues.map((candidate) => candidate.id === issue.id ? result.issue : candidate);
        renderIssueDetail();
        renderProjectIssueBoard();
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
issueDetailSharedInput.addEventListener('change', () => {
    if (!issueDetailSharedInput.checked)
        issueDetailApprovalInput.checked = false;
    issueDetailApprovalInput.disabled = !issueDetailSharedInput.checked;
});
issueDetailStatus.addEventListener('click', () => {
    if (selectedIssue !== null)
        openIssueStatusPicker(selectedIssue, issueDetailStatus);
});
issueSourceLink.addEventListener('click', async (event) => {
    event.preventDefault();
    const issue = selectedIssue;
    const projectId = activeProject?.id;
    const messageId = Number(issueSourceLink.dataset.messageId);
    if (issue === null || projectId === undefined || !Number.isSafeInteger(messageId) || messageId < 1)
        return;
    let sourceMessage = projectChatUi.messageList()?.querySelector(`[data-message-id="${messageId}"]`) ?? null;
    if (sourceMessage === null) {
        try {
            const result = await api(`/projects/${projectId}/messages?since=${messageId - 1}`);
            if (activeProject?.id !== projectId || selectedIssue?.id !== issue.id)
                return;
            for (const message of result.messages)
                projectChatUi.appendMessage(message);
            sourceMessage = projectChatUi.messageList()?.querySelector(`[data-message-id="${messageId}"]`) ?? null;
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
    projectChatUi.messageList()?.querySelector('.is-chat-source')?.classList.remove('is-chat-source');
    sourceMessage.classList.add('is-chat-source');
    sourceMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
async function loadProjectMembers(projectId) {
    memberList.replaceChildren();
    for (const member of activeProjectMembers) {
        const item = document.createElement('li');
        const label = document.createElement('span');
        label.textContent = `${member.name} · ${member.role}`;
        item.append(label);
        if (activeUser?.role === 'admin') {
            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'button button-quiet button-danger';
            removeButton.textContent = 'Remove';
            removeButton.dataset.userId = String(member.id);
            removeButton.setAttribute('aria-label', `Remove ${member.name} from this project`);
            removeButton.addEventListener('click', () => openMemberRemovalConfirmation(member, removeButton));
            item.append(removeButton);
        }
        memberList.append(item);
    }
    memberForm.hidden = activeUser?.role !== 'admin' || (activeProject !== null && projectStatusIsReadOnly(activeProject.status));
    updateMembersPanelTabIndex();
    if (memberForm.hidden) {
        memberAddControls.hidden = true;
        memberAddStatus.hidden = true;
        return;
    }
    memberAddControls.hidden = true;
    memberAddStatus.textContent = 'Loading available members…';
    memberAddStatus.hidden = false;
    memberSelect.replaceChildren();
    memberSelect.disabled = true;
    addMemberButton.disabled = true;
    try {
        const result = await api('/users');
        if (activeProject?.id !== projectId || membersView.hidden)
            return;
        memberSelect.replaceChildren();
        const availableMembers = result.users.filter((user) => !activeProjectMembers.some((member) => member.id === user.id));
        if (availableMembers.length === 0) {
            memberAddStatus.textContent = 'There are no other workspace members available to add.';
            memberAddStatus.hidden = false;
            updateMembersPanelTabIndex();
            return;
        }
        for (const candidate of availableMembers) {
            const option = document.createElement('option');
            option.value = String(candidate.id);
            option.textContent = `${candidate.name} · ${candidate.email}`;
            memberSelect.append(option);
        }
        memberSelect.disabled = false;
        addMemberButton.disabled = false;
        memberAddStatus.hidden = true;
        memberAddControls.hidden = false;
        updateMembersPanelTabIndex();
    }
    catch (error) {
        if (activeProject?.id === projectId && !membersView.hidden) {
            memberAddStatus.textContent = 'Could not load available members.';
            memberAddStatus.hidden = false;
        }
        report(error instanceof Error ? error.message : 'Could not load workspace users.', true);
    }
}
function openMemberRemovalConfirmation(member, button) {
    memberRemovalTarget = { member, button };
    memberRemovalDescription.textContent = `“${member.name}” will be removed from the project.`;
    memberRemovalConfirmation.showModal();
    memberRemovalCancel.focus();
}
function closeMemberRemovalConfirmation() {
    if (memberRemovalConfirmation.open)
        memberRemovalConfirmation.close();
    memberRemovalTarget = null;
    memberRemovalConfirm.disabled = false;
}
async function confirmMemberRemoval() {
    const target = memberRemovalTarget;
    if (target === null)
        return;
    closeMemberRemovalConfirmation();
    await removeProjectMember(target.member, target.button);
}
async function removeProjectMember(member, removeButton) {
    const projectId = activeProject?.id;
    if (projectId === undefined)
        return;
    const memberIndex = activeProjectMembers.findIndex((candidate) => candidate.id === member.id);
    removeButton.disabled = true;
    try {
        await api(`/projects/${projectId}/members/${member.id}`, { method: 'DELETE' });
        if (activeProject?.id === projectId) {
            await loadProjectDetail(projectId, 'members');
            if (activeProject?.id === projectId && !membersView.hidden) {
                const nextIndex = Math.min(memberIndex, activeProjectMembers.length - 1);
                const nextMember = activeProjectMembers[nextIndex];
                const nextRemoveButton = nextMember === undefined
                    ? null
                    : memberList.querySelector(`button[data-user-id="${nextMember.id}"]`);
                (nextRemoveButton ?? memberSelect).focus();
            }
        }
        report(`${member.name} removed from the project.`);
    }
    catch (error) {
        report(error instanceof Error ? error.message : 'Could not remove the project member.', true);
    }
    finally {
        removeButton.disabled = false;
    }
}
memberRemovalCancel.addEventListener('click', closeMemberRemovalConfirmation);
memberRemovalConfirm.addEventListener('click', () => void confirmMemberRemoval());
function updateMembersPanelTabIndex() {
    const hasFocusableContent = Array.from(membersView.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')).some((element) => element.tabIndex >= 0 && !element.matches(':disabled') && element.closest('[hidden]') === null);
    membersView.tabIndex = hasFocusableContent ? -1 : 0;
}
workspaceSwitcher.addEventListener('click', () => openWorkspacePicker());
guestWorkspaceSwitcher.addEventListener('click', () => openWorkspacePicker());
workspacePickerCancel.addEventListener('click', () => resetPendingWorkspaceSwitch());
workspacePickerConfirm.addEventListener('click', commitPendingWorkspaceSwitch);
workspacePicker.addEventListener('close', () => {
    pendingWorkspaceId = null;
    if (commandPalette.open || shortcutHelp.open || issueStatusPicker.open)
        return;
    if (guestUi.isShellVisible() && !guestWorkspaceSwitcher.hidden && !guestWorkspaceSwitcher.disabled) {
        guestWorkspaceSwitcher.focus();
    }
    else if (!workspacePanel.hidden && !workspaceSwitcher.disabled) {
        workspaceSwitcher.focus();
    }
});
workspacePicker.addEventListener('keydown', (event) => {
    if (!(event.target instanceof HTMLElement) || !event.target.matches('.workspace-picker-option'))
        return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        const offset = event.key === 'ArrowDown' ? 1 : -1;
        const index = Math.max(0, Math.min(activeWorkspaces.length - 1, workspacePickerOptionIndex + offset));
        updateWorkspacePickerSelection(index);
    }
    else if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        commitPendingWorkspaceSwitch();
    }
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
        await switchWorkspace(result.workspace.id, true);
    }
    catch (error) {
        report(error instanceof Error ? error.message : 'Could not create the workspace.', true);
    }
});
projectForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = new FormData(projectForm);
    try {
        const githubRepositorySelection = parseGitHubRepositorySelection(projectGithubRepository.value);
        await api('/projects', {
            method: 'POST',
            body: JSON.stringify({
                name: values.get('name'),
                description: values.get('description'),
                github_installation_id: githubRepositorySelection?.installation_id ?? null,
                github_repository_id: githubRepositorySelection?.repository_id ?? null,
                github_repository_owner: githubRepositorySelection?.owner ?? null,
                github_repository_name: githubRepositorySelection?.name ?? null,
            }),
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
guestLogoutButton.addEventListener('click', () => { void signOut(); });
window.addEventListener('storage', (event) => {
    if (event.key === 'tangent-github-connected' && activeUser?.role === 'admin')
        void loadGithubRepositories();
});
const signOut = createLogoutController({
    logout: () => api('/auth/logout', { method: 'POST' }),
    onSignedOut: showSignedOut,
    onFailure: () => report('Could not sign out. Check your connection and try again.', true),
    onPending: (pending) => {
        logoutButton.disabled = pending;
        guestLogoutButton.disabled = pending;
    },
    isExpiredSession: (error) => error instanceof ApiFailure && error.status === 401,
});
logoutButton.addEventListener('click', () => { void signOut(); });
async function start() {
    const url = new URL(window.location.href);
    if (url.searchParams.has('password')) {
        url.searchParams.delete('password');
        url.searchParams.delete('email');
        history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    }
    const githubConnected = url.searchParams.get('github') === 'connected';
    if (githubConnected) {
        url.searchParams.delete('github');
        history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
        try {
            localStorage.setItem('tangent-github-connected', String(Date.now()));
        }
        catch {
            // GitHub connection still completes when local storage is unavailable.
        }
    }
    const credentialState = authUi.consumeCredentialFragment();
    if (credentialState !== null) {
        showSignedOut();
        await authUi.openCredentialFlow(credentialState);
        return;
    }
    try {
        const result = await api('/auth/me');
        showSignedIn(result.user);
        await loadWorkspaces();
        if (result.user.role === 'guest')
            return;
        await loadProjects();
        if (githubConnected)
            report('GitHub connected. Choose a repository in project settings.');
    }
    catch (error) {
        showSignedOut();
        if (error instanceof ApiFailure && error.status !== 401) {
            report(error.message, true);
        }
    }
}
void start();
