import { api, apiBaseUrl, ApiFailure } from './api.js';
import { ISSUE_STATUS_OPTIONS, ISSUE_TYPE_OPTIONS, PROJECT_STATUS_LABELS, } from './types.js';
import { initGuestUi } from './guest-ui.js';
import { initInboxUi } from './inbox-ui.js';
import { createLogoutController } from './logout.js';
import { ProjectNavigationOwner, runOwnedRequest } from './project-navigation.js';
import { createWorkspaceHistory } from './workspace-history.js';
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
import { initCommandPaletteUi } from './command-palette-ui.js';
import { buildPaletteCommands } from './command-palette-commands.js';
import { initWorkspacePickerUi } from './workspace-picker-ui.js';
import { initIssueBoardUi } from './issue-board-ui.js';
import { initIssueBoardView } from './issue-board-view.js';
import { initIssueBulkUi } from './issue-bulk-ui.js';
import { initIssueBulkActions } from './issue-bulk-actions.js';
import { moveFocusByPage, moveFocusToBoundary, moveFocusWithin, visibleRowsInViewport } from './list-keyboard-ui.js';
import { initGoPrefixUi } from './go-prefix-ui.js';
import { initChatMessageNavigationUi } from './chat-message-navigation-ui.js';
import { initStatusMessageUi } from './status-message-ui.js';
import { initKeyboardHintsUi, KEYBOARD_HINTS_STORAGE_KEY } from './keyboard-hints-ui.js';
import { initIssuePollingController } from './issue-polling-controller.js';
import { initIssueActions } from './issue-actions.js';
import { initIssueDetailView } from './issue-detail-view.js';
import { createIssueRowUi } from './issue-row-ui.js';
import { initIssueAiPromptUi } from './issue-ai-prompt-ui.js';
import { initIssueDiscussionUi } from './issue-discussion-ui.js';
import { initIssueRelatedUi } from './issue-related-ui.js';
import { initIssueStatusPickerUi } from './issue-status-picker-ui.js';
import { initIssueDeleteUi } from './issue-delete-ui.js';
import { initIssueDetailEditUi } from './issue-detail-edit-ui.js';
import { initProjectMembersUi } from './project-members-ui.js';
import { initProjectEditUi } from './project-edit-ui.js';
import { initProjectListUi } from './project-list-ui.js';
import { initGithubProjectUi } from './github-project-ui.js';
import { parseQuickIssueInput } from './quick-issue.js';
import { initRoadmapUi } from './roadmap-ui.js';
import { loadIssueCollections, refreshDeletedIssuesOnOpen, shouldDeferIssueUpdates, } from './issue-polling.js';
import { dom } from './dom.js';
const { project: { projectHeading, projectEditDialog, projectReadOnlyNotice, editProjectButton, projectsNavButton, projectsView, projectView, projectForm, projectList, projectFormPanel, projectDescription, projectState, projectChatColumn, projectSidebarList, projectMain, projectTabs, projectKeyboardHints, }, auth: { loginPanel, loginShell, accountBar, currentUserLabel, loginStatusMessage, logoutButton, }, workspace: { workspacePanel, workspaceNav, adminNavButton, adminView, adminHeading, membersView, adminGoPrefixOption, membersTabButton, }, shell: { createWorkspaceForm, breadcrumbProjectsButton, breadcrumbDivider, breadcrumbCurrent, notesTabButton, emptyIssues, statusMessage, }, roadmap: { roadmapNavButton, roadmapView, roadmapHeading, roadmapSummary, roadmapMilestoneList, roadmapEmptyState, roadmapGoPrefixOption, }, inbox: { inboxNavButton, inboxView, inboxHeading, }, lounge: { loungeNavButton, loungeView, loungeHeading, loungeMessageList, }, shortcuts: { toggleProjectFormButton, keyboardHints, goPrefixHint, goPrefixWorkspaceOption, goPrefixProjectOptions, }, chat: { chatView, }, issues: { issuesView, issueDetailView, issueDetailDisplay, issueDetailTitle, issueDetailPriority, issueDetailDueDate, issueDetailDescription, issueDetailBrief, issueDetailContextSection, issueDetailContext, issueDetailExpectedOutcomeSection, issueDetailExpectedOutcome, issueDetailAcceptanceCriteriaSection, issueDetailAcceptanceCriteria, issueDetailStatus, issueDetailStatusLabel, issueSourceLink, issueDetailEditForm, issueDetailEditButton, issueDetailDeleteButton, issuesTabButton, issueBackButton, issueForm, issueQuickAddTitle, issueQuickAddPriority, issueQuickAddDueDate, issueQuickAddAssignee, issueQuickAddMilestone, issueQuickAddOngoing, issueQuickAddShared, issueQuickAddApproval, issueQuickAddCancelButton, issueDetailType, issueDetailAssignee, issueDetailMilestone, issueDetailOngoingRow, issueDetailSharing, issueDetailApproval, issueDescriptionDetails, issueProgress, issueProgressLabel, issueFilter, issueGrouping, issueOrder, issueScope, issueCountSummary, issueBulkAssignToggle, issueBulkAssignToolbar, issueList, deletedIssuesDetails, deletedIssueCount, deletedIssueList, }, guest: { guestLogoutButton, }, } = dom;
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
const commandPaletteUi = initCommandPaletteUi();
const roadmapUi = initRoadmapUi({
    doc: document,
    summary: roadmapSummary,
    milestoneList: roadmapMilestoneList,
    emptyState: roadmapEmptyState,
    openProject: (projectId) => { void loadProjectDetail(projectId, 'issues'); },
});
const projectSidebarSection = projectSidebarList.closest('.sidebar-projects');
const projectSidebarMore = createScrollMoreIndicator();
projectSidebarList.after(projectSidebarMore);
const issueBulkAssignCount = issueBulkAssignToolbar.querySelector('.issue-bulk-assign-count');
const issueBulkAssignSelectVisible = issueBulkAssignToolbar.querySelector('.issue-bulk-assign-select-visible');
const issueBulkAssignTarget = issueBulkAssignToolbar.querySelector('.issue-bulk-assign-target');
const issueBulkAssignApply = issueBulkAssignToolbar.querySelector('.issue-bulk-assign-apply');
const issueBulkShareApply = issueBulkAssignToolbar.querySelector('.issue-bulk-share-apply');
const issueBulkUnshareApply = issueBulkAssignToolbar.querySelector('.issue-bulk-unshare-apply');
const issueBulkAssignCancel = issueBulkAssignToolbar.querySelector('.issue-bulk-assign-cancel');
let activeUser = null;
const keyboardHintsUi = initKeyboardHintsUi({
    element: keyboardHints,
    getUserRole: () => activeUser?.role ?? null,
    isWorkspaceVisible: () => !workspacePanel.hidden,
    isCompactViewport: () => window.matchMedia('(min-width: 761px) and (max-height: 560px)').matches,
    getStoredPreference: () => window.localStorage.getItem(KEYBOARD_HINTS_STORAGE_KEY),
    setStoredPreference: (value) => window.localStorage.setItem(KEYBOARD_HINTS_STORAGE_KEY, value),
});
let activeWorkspaces = [];
let activeProject = null;
let projectReturnFocusId = null;
const workspaceHistory = createWorkspaceHistory();
const projectNavigation = new ProjectNavigationOwner();
const workspacePickerUi = initWorkspacePickerUi({
    getWorkspaces: () => activeWorkspaces,
    getUser: () => activeUser,
    onSwitch: (workspaceId) => { void switchWorkspace(workspaceId, true); },
    isCommandPaletteOpen: () => commandPaletteUi.isPaletteOpen(),
    isShortcutHelpOpen: () => commandPaletteUi.isShortcutHelpOpen(),
    isIssueStatusPickerOpen: () => issueStatusPickerUi.isOpen(),
    isGuestShellVisible: () => document.body.classList.contains('is-guest') && workspacePanel.hidden,
    isWorkspacePanelVisible: () => !workspacePanel.hidden,
});
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
const projectListUi = initProjectListUi({
    getRole: () => activeUser?.role,
    getActiveProjectId: () => activeProject?.id ?? null,
    openProject: (projectId) => { void loadProjectDetail(projectId); },
    onRendered: updateProjectSidebarMoreCue,
    api,
    report,
});
const githubProjectUi = initGithubProjectUi({
    getRole: () => activeUser?.role,
    getProject: () => activeProject,
    api,
    report,
});
const projectMembersUi = initProjectMembersUi({
    getProjectId: () => activeProject?.id ?? null,
    getMembers: () => activeProjectMembers,
    getRole: () => activeUser?.role,
    isReadOnly: () => activeProject !== null && projectStatusIsReadOnly(activeProject.status),
    isViewVisible: () => !membersView.hidden,
    api,
    onRefresh: loadProjectDetail,
    report,
});
const projectEditUi = initProjectEditUi({
    getRole: () => activeUser?.role,
    getProject: () => activeProject,
    isProjectViewVisible: () => !projectView.hidden,
    populateRepositorySelect: githubProjectUi.populateRepositorySelect,
    api,
    onUpdated: applyEditedProject,
    refreshProjects: () => projectListUi.load(),
    report,
});
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
        && !commandPaletteUi.isPaletteOpen() && !commandPaletteUi.isShortcutHelpOpen() && !workspacePickerUi.isOpen(),
});
let loungeActive = false;
let deletedIssuesLoadProjectId = null;
let deletedIssuesLoadPromise = null;
const issueAiPromptUi = initIssueAiPromptUi({
    getIssue: () => selectedIssue,
    isIssueCurrent: (issue) => selectedIssue?.id === issue.id && activeProject?.id === issue.project_id,
    onSaved: (issue) => {
        selectedIssue = issue;
        projectIssues = projectIssues.map((candidate) => candidate.id === issue.id ? issue : candidate);
        renderIssueDetail();
        renderProjectIssueBoard();
    },
    onUnauthorized: () => showSignedOut(),
});
const issueDiscussionUi = initIssueDiscussionUi({
    getIssue: () => selectedIssue,
    getUser: () => activeUser,
    getProject: () => activeProject,
    isProjectReadOnly: (project) => projectStatusIsReadOnly(project.status),
    isDetailVisible: () => !issueDetailView.hidden,
    getPageSize: (messages) => visibleRowsInViewport(messages, projectMain, '.issue-discussion-message'),
    onDiscussionCountChanged: updateProjectIssueDiscussionCount,
    onUnauthorized: () => showSignedOut(),
    avatarInitials,
});
const issueRelatedUi = initIssueRelatedUi({
    getIssue: () => selectedIssue,
    getProject: () => activeProject,
    getUser: () => activeUser,
    isProjectReadOnly: (project) => projectStatusIsReadOnly(project.status),
    isDetailVisible: () => !issueDetailView.hidden,
    issueStatusLabel,
    onUnauthorized: () => showSignedOut(),
    report,
});
const issueStatusPickerUi = initIssueStatusPickerUi({
    getProjectId: () => activeProject?.id ?? null,
    isReadOnly: () => activeProject !== null && projectStatusIsReadOnly(activeProject.status),
    isIssueDetailVisible: () => !issueDetailView.hidden,
    getOptions: issueStatusOptions,
    statusLabel: issueStatusLabel,
    onSelect: updateIssueStatus,
    focusIssueTitle: focusIssueTitleButton,
    focusIssuesTab: () => issuesTabButton.focus(),
    focusIssueDetailStatus: () => issueDetailStatus.focus(),
    shouldRestoreFocus: () => !commandPaletteUi.isPaletteOpen()
        && !commandPaletteUi.isShortcutHelpOpen() && !workspacePickerUi.isOpen(),
});
const issueBulkActions = initIssueBulkActions({
    getProjectId: () => activeProject?.id ?? null,
    getActiveProjectId: () => activeProject?.id ?? null,
    isIssueViewVisible: () => !issuesView.hidden,
    getIssues: () => projectIssues,
    setIssues: (issues) => { projectIssues = issues; },
    getSelectedIssue: () => selectedIssue,
    setSelectedIssue: (issue) => { selectedIssue = issue; },
    getSelectedAssignIssueIds: () => selectedBulkAssignIssueIds,
    getSelectedMoveIssueIds: () => selectedBulkMoveIssueIds,
    getAssignTargetValue: () => bulkAssignTargetValue,
    getMoveMilestoneId: () => bulkMoveMilestoneId,
    getMilestones: () => projectMilestones,
    isActionPending: () => bulkSelectionActionPending,
    setActionPending: (pending) => { bulkSelectionActionPending = pending; },
    isMovePending: () => bulkMovePending,
    setMovePending: (pending) => { bulkMovePending = pending; },
    clearAssignSelection: clearBulkAssignSelection,
    clearMoveSelection: clearBulkMoveSelection,
    focusMilestoneGroup: (milestoneId) => {
        issueList.querySelector(`:scope > .issue-group[data-group-key="milestone:${milestoneId}"]`)
            ?.querySelector(':scope > summary')?.focus();
    },
    syncAssignControls: syncIssueBulkAssignControls,
    renderBoard: renderProjectIssueBoard,
    renderDetail: renderIssueDetail,
    focusAssignToggle: () => issueBulkAssignToggle.focus(),
    issueAssigneeLabel,
    report,
    loadProjectIssues,
    onUnauthorized: () => showSignedOut(),
    api,
});
const issueBulkUi = initIssueBulkUi({
    doc: document,
    getState: () => ({
        bulkMovePending,
        bulkSelectionActionPending,
        bulkAssignSelectionMode,
        selectedBulkMoveIssueIds,
        selectedBulkAssignIssueIds,
        visibleBulkAssignIssueIds,
        bulkMoveMilestoneId,
        bulkAssignTargetValue,
        activeMembers: activeProjectMembers,
        milestones: projectMilestones,
        readOnly: activeProject !== null && projectStatusIsReadOnly(activeProject.status),
    }),
    issueList,
    assignTarget: issueBulkAssignTarget,
    assignToolbar: issueBulkAssignToolbar,
    assignToggle: issueBulkAssignToggle,
    assignCount: issueBulkAssignCount,
    selectVisible: issueBulkAssignSelectVisible,
    assignApply: issueBulkAssignApply,
    shareApply: issueBulkShareApply,
    unshareApply: issueBulkUnshareApply,
    assignCancel: issueBulkAssignCancel,
    setBulkMoveMilestoneId: (milestoneId) => { bulkMoveMilestoneId = milestoneId; },
    setBulkAssignTargetValue: (value) => { bulkAssignTargetValue = value; },
    setSelectedBulkMoveIssueIds: (issueIds) => { selectedBulkMoveIssueIds = issueIds; },
    renderBoard: renderProjectIssueBoard,
    moveSelectedIssuesToMilestone: issueBulkActions.moveSelectedIssuesToMilestone,
    report,
    setTextContentIfChanged,
});
const issueRowUi = createIssueRowUi({
    doc: document,
    issueTypeLabel,
    issuePriorityLabel,
    formatIssueDueDate,
    isIssueOverdue,
    issueAssigneeLabel,
    isReadOnly: () => activeProject !== null && projectStatusIsReadOnly(activeProject.status),
    createStatusButton: (issue) => issueStatusPickerUi.createButton(issue),
    createBulkMoveCheckbox: createIssueBulkSelectCheckbox,
    createBulkAssignCheckbox: createIssueBulkAssignCheckbox,
    openIssue,
    moveIssue,
});
const issueBoardUi = initIssueBoardUi({
    issueList,
    getState: () => ({
        bulkMoveSelectionMode,
        bulkMovePending,
        bulkAssignSelectionMode,
        selectedBulkMoveIssueIds,
        selectedBulkAssignIssueIds,
        selectedIssueId: selectedIssue?.id ?? null,
        readOnly: activeProject !== null && projectStatusIsReadOnly(activeProject.status),
    }),
    onToggleBulkMoveSelection: () => {
        if (bulkAssignSelectionMode)
            clearBulkAssignSelection();
        if (bulkMoveSelectionMode)
            clearBulkMoveSelection();
        else
            bulkMoveSelectionMode = true;
    },
    renderBoard: renderProjectIssueBoard,
    issueAssigneeLabel,
    createIssueRow: (issue, reorder, allowBulkMoveSelection, allowBulkAssignSelection) => issueRowUi.create(issue, reorder, allowBulkMoveSelection, allowBulkAssignSelection),
    createBulkMoveToolbar: createIssueBulkMoveToolbar,
    syncBulkMoveToolbar: syncIssueBulkMoveToolbar,
    setTextContentIfChanged,
    placeNodeAtPosition,
    replaceIssueRowPreservingFocus,
});
const issueBoardView = initIssueBoardView({
    issues: () => projectIssues,
    milestones: () => projectMilestones,
    deletedIssues: () => deletedProjectIssues,
    scope: () => issueScope.value,
    order: () => issueOrder.value,
    grouping: () => issueGrouping.value,
    filter: () => issueFilter.value,
    issueAssigneeLabel,
    issueProgress,
    issueProgressLabel,
    issueCountSummary,
    emptyIssues,
    deletedIssueCount,
    deletedIssuesDetails,
    getSelectedBulkMoveIssueIds: () => selectedBulkMoveIssueIds,
    getSelectedBulkAssignIssueIds: () => selectedBulkAssignIssueIds,
    setVisibleBulkAssignIssueIds: (ids) => { visibleBulkAssignIssueIds = ids; },
    clearBulkMoveSelection,
    syncBulkAssignControls: syncIssueBulkAssignControls,
    reconcileDeletedIssueRows,
    issueBoardUi,
    setTextContentIfChanged,
});
const issueDeleteUi = initIssueDeleteUi({
    getProjectId: () => activeProject?.id ?? null,
    statusLabel: issueStatusLabel,
    onDeleted: async (issue, projectId) => {
        if (activeProject?.id !== projectId)
            return false;
        if (selectedIssue?.id === issue.id) {
            selectedIssue = null;
            issueDetailEditUi.reset();
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
        return true;
    },
    onRestored: async (issue) => {
        await loadProjectIssues(issue.project_id);
        if (!focusIssueTitleButton(issue.id))
            issuesTabButton.focus();
    },
    onUnauthorized: () => showSignedOut(),
    report,
});
const issueDetailEditUi = initIssueDetailEditUi({
    getIssue: () => selectedIssue,
    getProjectId: () => activeProject?.id ?? null,
    isDetailVisible: () => !issueDetailView.hidden,
    populateAssigneeSelect: populateIssueAssigneeSelect,
    populateMilestoneSelect: populateIssueMilestoneSelect,
    updateOngoingMilestoneControl,
    submitFormOnEnter,
    api,
    onUpdated: (issue) => {
        selectedIssue = issue;
        projectIssues = projectIssues.map((candidate) => candidate.id === issue.id ? issue : candidate);
    },
    renderDetail: renderIssueDetail,
    renderBoard: renderProjectIssueBoard,
    report,
});
const issueDetailViewUi = initIssueDetailView({
    doc: document,
    elements: dom.issues,
    deletedIssueList,
    getSelectedIssue: () => selectedIssue,
    getDeletedIssues: () => deletedProjectIssues,
    getProject: () => activeProject,
    getMilestones: () => projectMilestones,
    issueStatusLabel,
    issueTypeLabel,
    issuePriorityLabel,
    isIssueOverdue,
    formatIssueDueDate,
    issueAssigneeLabel,
    isProjectReadOnly: projectStatusIsReadOnly,
    restoreIssue: (issue, button) => issueDeleteUi.restore(issue, button),
    renderPullRequests: () => issueRelatedUi.renderPullRequests(),
    placeNodeAtPosition,
    replaceRowPreservingFocus: replaceIssueRowPreservingFocus,
});
const issuePollingController = initIssuePollingController({
    getProjectId: () => activeProject?.id ?? null,
    isPollingActive: (projectId) => activeProject?.id === projectId && !projectView.hidden
        && (!issuesView.hidden || !issueDetailView.hidden),
    isDocumentHidden: () => document.hidden,
    issueUpdatesAreDeferred,
    isDeletedIssuesOpen: () => deletedIssuesDetails.open,
    getIssues: () => projectIssues,
    setIssues: (issues) => { projectIssues = issues; },
    getDeletedIssues: () => deletedProjectIssues,
    setDeletedIssues: (issues) => { deletedProjectIssues = issues; },
    getSelectedIssue: () => selectedIssue,
    setSelectedIssue: (issue) => { selectedIssue = issue; },
    isIssueDetailVisible: () => !issueDetailView.hidden,
    onIssueRemovedFromDetail: () => {
        issueDetailView.hidden = true;
        issuesView.hidden = false;
        issueFilter.focus();
    },
    fetchConditionalIssueList,
    renderIssueDetail,
    loadStatusHistory: (issueId) => issueRelatedUi.loadStatusHistory(issueId),
    renderBoard: renderProjectIssueBoard,
    onError: (error) => {
        if (error instanceof ApiFailure && error.status === 401) {
            showSignedOut();
            return true;
        }
        report(error instanceof Error ? error.message : 'Could not refresh project issues.', true);
        return false;
    },
    setTimeout: (callback, delay) => window.setTimeout(callback, delay),
    clearTimeout: (timer) => window.clearTimeout(timer),
});
const issueActions = initIssueActions({
    api,
    getProjectId: () => activeProject?.id ?? null,
    isIssueListVisible: () => !issuesView.hidden,
    isIssueDetailVisible: () => !issueDetailView.hidden,
    getSelectedIssue: () => selectedIssue,
    setSelectedIssue: (issue) => { selectedIssue = issue; },
    getIssues: () => projectIssues,
    setIssues: (issues) => { projectIssues = issues; },
    issueList,
    renderDetail: renderIssueDetail,
    renderBoard: renderProjectIssueBoard,
    loadStatusHistory: (issueId) => issueRelatedUi.loadStatusHistory(issueId),
    reloadIssues: loadProjectIssues,
    isUnauthorized: (error) => error instanceof ApiFailure && error.status === 401,
    onUnauthorized: () => showSignedOut(),
    report,
});
let selectedChatMessageId = null;
let issueQuickAddEscapePending = false;
let issueQuickAddReturnFocus = null;
let issueQuickAddSourceMessageId = null;
let issueQuickAddSourceProjectId = null;
const goPrefixUi = initGoPrefixUi({
    hint: goPrefixHint,
    workspaceOption: goPrefixWorkspaceOption,
    projectOptions: goPrefixProjectOptions,
    adminOption: adminGoPrefixOption,
    roadmapOption: roadmapGoPrefixOption,
    getContext: () => ({
        workspaceCount: activeWorkspaces.length,
        hasProject: activeProject !== null,
        projectVisible: !projectView.hidden,
        isAdmin: activeUser?.role === 'admin',
        canUseRoadmap: activeUser !== null && activeUser.role !== 'guest',
    }),
    setTimeout: (callback, delay) => window.setTimeout(callback, delay),
    clearTimeout: (timer) => window.clearTimeout(timer),
});
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
const chatMessageNavigationUi = initChatMessageNavigationUi({
    getMessageList: activeChatMessageList,
    getSelectedMessageId: () => selectedChatMessageId,
    setSelectedMessageId: (id) => { selectedChatMessageId = id; },
    setFollowLatest: (followLatest) => {
        if (loungeView.hidden)
            projectChatUi.setFollowLatest(followLatest);
        else
            loungeChatUi.setFollowLatest(followLatest);
    },
    focusComposer: focusActiveChatComposer,
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
    createDiscussionIndicator: issueRowUi.createDiscussionIndicator,
});
const workspaceAdminUi = initWorkspaceAdminUi({
    getUser: () => activeUser,
    isVisible: () => !adminView.hidden,
    report,
});
const authUi = initAuthUi({
    onSignedIn: showSignedIn,
    loadWorkspaces,
    loadProjects: () => projectListUi.load(),
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
        workspacePickerUi.setGuestVisible(true);
        guestLogoutButton.hidden = false;
        guestLogoutButton.textContent = 'Sign out';
        updateKeyboardHintsVisibility();
        document.body.classList.add('is-guest');
    },
    onPreviewOpened: () => {
        workspacePanel.hidden = true;
        accountBar.hidden = true;
        workspacePickerUi.setGuestVisible(false);
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
        workspacePickerUi.setGuestVisible(false);
        guestLogoutButton.hidden = false;
        updateKeyboardHintsVisibility();
        showWorkspaceView('project');
    },
    onUnauthorized: () => showSignedOut(),
    report,
});
const statusMessageUi = initStatusMessageUi({
    doc: document,
    loginStatusMessage,
    statusMessage,
    workspacePanel,
    isGuestShellVisible: () => guestUi.isShellVisible(),
    setGuestStatus: (message, isError) => guestUi.setStatus(message, isError),
    moveWorkspaceStatusToCurrentHeading,
    setTimeout: (callback, delay) => window.setTimeout(callback, delay),
    clearTimeout: (timer) => window.clearTimeout(timer),
});
function report(message, isError = false) {
    statusMessageUi.report(message, isError);
}
function updateKeyboardHintsVisibility() {
    keyboardHintsUi.updateVisibility();
}
function toggleKeyboardHints() {
    keyboardHintsUi.toggle();
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
    workspaceHistory.clear();
    projectReturnFocusId = null;
    issueQuickAddSourceMessageId = null;
    issueQuickAddSourceProjectId = null;
    issueQuickAddReturnFocus = null;
    stopIssuePolling();
    issueDiscussionUi.clear();
    inboxUi.reset();
    workspacePickerUi.resetPendingSwitch();
    projectChatUi.stop();
    loungeChatUi.stop();
    loungePresenceUi.reset();
    if (clientSummaryUi.dialog.open)
        clientSummaryUi.close();
    activeUser = null;
    githubProjectUi.reset();
    editProjectButton.hidden = true;
    if (projectEditDialog.open)
        projectEditDialog.close();
    activeProject = null;
    activeProjectMembers = [];
    selectedIssue = null;
    activeWorkspaces = [];
    workspacePickerUi.resetSwitcher();
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
    workspaceHistory.clear();
    projectReturnFocusId = null;
    activeProject = null;
    loungeChatUi.stop();
    loungePresenceUi.reset();
    activeUser = user;
    workspacePickerUi.setGuestVisible(user.role === 'guest');
    editProjectButton.hidden = user.role !== 'admin';
    roadmapNavButton.hidden = user.role === 'guest';
    workspacePickerUi.resetPendingSwitch();
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
        void githubProjectUi.load();
    report('');
}
async function loadWorkspaces() {
    workspacePickerUi.resetPendingSwitch();
    const result = await api('/workspaces');
    activeWorkspaces = result.workspaces;
    workspacePickerUi.renderSwitcher();
}
async function switchWorkspace(workspaceId, restoreSwitcherFocus = false) {
    workspacePickerUi.resetPendingSwitch();
    if (activeUser === null || workspaceId === activeUser.workspace_id)
        return;
    workspacePickerUi.setSwitching(true);
    try {
        const result = await switchWorkspaceMembership(activeUser, workspaceId, (targetWorkspaceId) => api(`/workspaces/${targetWorkspaceId}/switch`, {
            method: 'POST',
            body: JSON.stringify({}),
        }), showSignedIn, loadWorkspaces, () => projectListUi.load());
        if (result === null)
            return;
        report(`Switched to ${result.workspace.name}.`);
    }
    catch (error) {
        report(error instanceof Error ? error.message : 'Could not switch workspace.', true);
    }
    finally {
        workspacePickerUi.setSwitching(false, restoreSwitcherFocus);
    }
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
        issueDiscussionUi.clear();
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
    workspaceHistory.record(currentLocation, { view: 'admin' });
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
function goToProjects() {
    workspaceHistory.clear();
    showWorkspaceView('projects');
}
function goToRoadmap() {
    if (activeUser === null || activeUser.role === 'guest')
        return;
    const currentLocation = currentWorkspaceLocation();
    workspaceHistory.record(currentLocation, { view: 'roadmap' });
    showWorkspaceView('roadmap');
    roadmapHeading.focus();
    void loadRoadmap();
}
function goToInbox() {
    const currentLocation = currentWorkspaceLocation();
    workspaceHistory.record(currentLocation, { view: 'inbox' });
    showWorkspaceView('inbox');
    inboxHeading.focus();
    inboxUi.load();
}
function goToLounge() {
    const currentLocation = currentWorkspaceLocation();
    workspaceHistory.record(currentLocation, { view: 'lounge' });
    showWorkspaceView('lounge');
    loungeHeading.focus();
    loungeChatUi.load();
}
function goBackWorkspaceView() {
    const currentLocation = currentWorkspaceLocation();
    if (currentLocation.view === 'projects')
        return;
    const previousLocation = workspaceHistory.pop();
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
    issuePollingController.pause();
}
function stopIssuePolling(resetState = true) {
    issuePollingController.stop(resetState);
}
function resumeDeferredIssuePolling() {
    issuePollingController.resumeDeferred();
}
function issuePollingIsActive(projectId) {
    return issuePollingController.isActive(projectId);
}
function issueUpdatesAreDeferred() {
    const dialogOpen = issueStatusPickerUi.isOpen() || issueDeleteUi.isOpen()
        || projectMembersUi.hasOpenDialog() || workspaceAdminUi.hasOpenDialog()
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
function scheduleIssuePoll(delay) {
    issuePollingController.schedule(delay);
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
    return chatMessageNavigationUi.messages();
}
function selectChatMessage(id, focus = true) {
    chatMessageNavigationUi.select(id, focus);
}
function moveChatMessageSelection(direction) {
    chatMessageNavigationUi.move(direction);
}
function moveChatMessageSelectionToBoundary(edge) {
    chatMessageNavigationUi.moveToBoundary(edge);
}
function moveChatMessageSelectionByPage(direction) {
    chatMessageNavigationUi.moveByPage(direction);
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
    issueDiscussionUi.clear();
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
        goPrefixPending: goPrefixUi.isPending(),
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
        issueDiscussionMessagesFocused: issueDiscussionUi.isMessageTarget(target),
        hasSelectedIssueDiscussionMessage: issueDiscussionUi.hasSelectedMessage(),
        issueGroupFocused: target instanceof HTMLElement && target.closest('.issue-group > summary') !== null,
        statusHistoryFocused: issueRelatedUi.isStatusHistoryFocused(document.activeElement),
        textInputFocused: shouldBlurOnEscape(target),
        modalOpen: commandPaletteUi.isPaletteOpen() || clientSummaryUi.dialog.open || commandPaletteUi.isShortcutHelpOpen() || issueAiPromptUi.isOpen() || issueStatusPickerUi.isOpen() || issueDeleteUi.isOpen() || themeUi.aboutDialog.open || projectEditDialog.open
            || projectMembersUi.hasOpenDialog() || workspaceAdminUi.hasOpenDialog() || milestoneUi.deleteConfirmation.open || milestoneUi.managerDialog.open
            || workspacePickerUi.isOpen(),
        canDismiss: commandPaletteUi.isPaletteOpen() || commandPaletteUi.isShortcutHelpOpen() || (!workspacePanel.hidden && (workspacePickerUi.hasPendingSwitch()
            || (!projectView.hidden && (!issueDetailView.hidden || !issueDetailEditForm.hidden
                || issueQuickAddEscapePending || projectChatUi.hasReplyParent()))
            || (!loungeView.hidden && loungeChatUi.hasReplyParent())
            || (!projectsView.hidden && !projectFormPanel.hidden)
            || !projectView.hidden || !roadmapView.hidden || !inboxView.hidden || !loungeView.hidden || !adminView.hidden)),
    };
}
function clearGoPrefix() {
    goPrefixUi.clear();
}
function startGoPrefix() {
    goPrefixUi.start();
}
function moveIssueSelection(direction) {
    if (!inboxView.hidden) {
        moveFocusWithin(document, inboxUi.visibleIssueTitleButtons(), '.inbox-issue-card', direction);
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
    moveFocusWithin(document, buttons, '.issue-card', direction);
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
    moveFocusWithin(document, Array.from(projectList.querySelectorAll('.project-card button')), '.project-card', direction);
}
function moveProjectSelectionToBoundary(edge) {
    moveFocusToBoundary(Array.from(projectList.querySelectorAll('.project-card button')), '.project-card', edge);
}
function moveSelectionByPage(direction) {
    if (document.activeElement instanceof HTMLElement && document.activeElement.closest('.chat-message') !== null) {
        moveChatMessageSelectionByPage(direction);
    }
    else if (issueDiscussionUi.isMessageTarget(document.activeElement)) {
        issueDiscussionUi.moveSelectionByPage(direction);
    }
    else if (!projectsView.hidden) {
        moveFocusByPage(document, Array.from(projectList.querySelectorAll('.project-card button')), '.project-card', projectsView, direction);
    }
    else if (!inboxView.hidden) {
        moveFocusByPage(document, inboxUi.visibleIssueTitleButtons(), '.inbox-issue-card', inboxView, direction);
    }
    else if (!issuesView.hidden) {
        moveFocusByPage(document, visibleIssueTitleButtons(), '.issue-card', projectMain, direction);
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
    issueDiscussionUi.clear();
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
        issueStatusPickerUi.open(selectedIssue, issueDetailStatus);
        return;
    }
    const titleButton = selectedIssueButton();
    const row = titleButton?.closest('.issue-card');
    const issueId = Number(row?.dataset.issueId);
    const issue = projectIssues.find((candidate) => candidate.id === issueId);
    if (issue !== undefined && titleButton !== null && titleButton !== undefined) {
        issueStatusPickerUi.open(issue, titleButton);
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
    issueDiscussionUi.clear();
    selectedIssue = null;
    issueDetailEditForm.hidden = true;
    issueDetailDisplay.hidden = false;
    switchProjectTab('issues');
    setIssueQuickAddActive(true);
    issueQuickAddTitle.focus();
    issueQuickAddTitle.setSelectionRange(issueQuickAddTitle.value.length, issueQuickAddTitle.value.length);
}
function getPaletteCommands() {
    const hasSelectedIssue = hasSelectedIssueInVisibleView();
    return buildPaletteCommands({
        user: activeUser,
        keyboardHintsVisible: keyboardHintsUi.isPreferenceEnabled(),
        workspaceVisible: !workspacePanel.hidden,
        activeWorkspaces,
        projectsViewVisible: !projectsView.hidden,
        projectViewVisible: !projectView.hidden,
        activeProject,
        hasSelectedIssueInVisibleView: hasSelectedIssue,
        selectedIssueInVisibleView: hasSelectedIssue ? issueSelectedInVisibleView() : null,
        hasLatestChatIssue: latestChatIssueButton() !== null,
        deletedProjectIssues,
        currentThemeLabel: themeLabel(themeUi.getActiveTheme()),
        nextThemeLabel: themeLabel(nextTheme(themeUi.getActiveTheme())),
        issueStatusLabel,
        actions: {
            goToProjects,
            goToInbox,
            goToLounge,
            showShortcutHelp,
            toggleKeyboardHints,
            goToRoadmap,
            switchWorkspace: (workspaceId) => workspacePickerUi.open(workspaceId),
            openWorkspaceAdmin,
            newProject: () => {
                if (projectFormPanel.hidden)
                    toggleProjectFormButton.click();
                else
                    projectForm.querySelector('input[name="name"]')?.focus();
            },
            createWorkspace: () => {
                openWorkspaceAdmin();
                switchWorkspaceAdminTab('workspaces');
                createWorkspaceForm.querySelector('input[name="name"]')?.focus();
            },
            generateSummary: () => clientSummaryUi.open(),
            previewGuestView: () => { void guestUi.openPreview(); },
            goToProjectIssues,
            focusProjectChat,
            goToProjectMembers,
            goToProjectNotes,
            beginCreateIssue,
            editSelectedIssue,
            focusSelectedIssueStatus,
            deleteIssue: (issue) => issueDeleteUi.open(issue),
            createIssueFromSelectedChatMessage,
            showDeletedIssues,
            switchTheme: () => themeUi.setTheme(nextTheme(themeUi.getActiveTheme())),
            signOut: () => { void signOut(); },
        },
    });
}
function openCommandPalette() {
    if (activeUser === null || milestoneUi.deleteConfirmButton.disabled)
        return;
    if (themeUi.aboutDialog.open)
        themeUi.aboutDialog.close();
    if (projectEditDialog.open)
        projectEditDialog.close();
    if (workspacePickerUi.isOpen())
        workspacePickerUi.resetPendingSwitch();
    if (clientSummaryUi.dialog.open)
        clientSummaryUi.close();
    if (issueAiPromptUi.isOpen())
        issueAiPromptUi.close();
    if (milestoneUi.deleteConfirmation.open)
        milestoneUi.closeDeleteConfirmation();
    if (milestoneUi.managerDialog.open)
        milestoneUi.close();
    if (issueStatusPickerUi.isOpen())
        issueStatusPickerUi.close();
    if (issueDeleteUi.isOpen())
        issueDeleteUi.close();
    if (projectMembersUi.hasOpenDialog())
        projectMembersUi.closeRemovalConfirmation();
    workspaceAdminUi.closeOpenDialogs();
    commandPaletteUi.togglePalette(getPaletteCommands);
}
function showShortcutHelp() {
    if (activeUser === null || milestoneUi.deleteConfirmButton.disabled)
        return;
    if (workspacePickerUi.isOpen())
        workspacePickerUi.resetPendingSwitch();
    if (clientSummaryUi.dialog.open)
        clientSummaryUi.close();
    if (issueAiPromptUi.isOpen())
        issueAiPromptUi.close();
    if (milestoneUi.deleteConfirmation.open)
        milestoneUi.closeDeleteConfirmation();
    if (milestoneUi.managerDialog.open)
        milestoneUi.close();
    if (issueStatusPickerUi.isOpen())
        issueStatusPickerUi.close();
    if (issueDeleteUi.isOpen())
        issueDeleteUi.close();
    if (projectMembersUi.hasOpenDialog())
        projectMembersUi.closeRemovalConfirmation();
    workspaceAdminUi.closeOpenDialogs();
    commandPaletteUi.toggleShortcutHelp();
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
    else if (workspacePickerUi.isOpen()) {
        workspacePickerUi.resetPendingSwitch();
    }
    else if (clientSummaryUi.dialog.open) {
        clientSummaryUi.close();
    }
    else if (issueAiPromptUi.isOpen()) {
        issueAiPromptUi.close();
    }
    else if (milestoneUi.deleteConfirmation.open) {
        milestoneUi.closeDeleteConfirmation();
    }
    else if (milestoneUi.managerDialog.open) {
        milestoneUi.close();
    }
    else if (issueDeleteUi.isOpen()) {
        issueDeleteUi.close();
    }
    else if (projectMembersUi.hasOpenDialog()) {
        projectMembersUi.closeRemovalConfirmation();
    }
    else if (workspaceAdminUi.hasOpenDialog()) {
        workspaceAdminUi.closeCurrentDialog();
    }
    else if (issueStatusPickerUi.isOpen()) {
        issueStatusPickerUi.close();
    }
    else if (commandPaletteUi.isPaletteOpen()) {
        commandPaletteUi.closePalette();
    }
    else if (commandPaletteUi.isShortcutHelpOpen()) {
        commandPaletteUi.closeShortcutHelp();
    }
    else if (!workspacePanel.hidden && !projectView.hidden && !issueDetailEditForm.hidden) {
        issueDetailEditUi.close();
    }
    else if (!workspacePanel.hidden && !projectView.hidden && !issueDetailView.hidden) {
        issueBackButton.click();
    }
    else if (!workspacePanel.hidden && !projectsView.hidden && !projectFormPanel.hidden) {
        projectListUi.closeForm();
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
    issueDiscussionUi.setReadOnly(readOnly);
    projectNotesUi.setReadOnly(readOnly);
    projectMembersUi.setReadOnly(readOnly);
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
function applyEditedProject(project) {
    activeProject = project;
    projectHeading.textContent = project.name;
    projectDescription.textContent = project.description;
    projectDescription.hidden = project.description.trim() === '';
    projectState.textContent = projectStatusLabel(project.status);
    projectState.classList.toggle('is-paused', project.status === 'paused');
    projectState.classList.toggle('is-read-only', project.status === 'completed' || project.status === 'archived');
    updateProjectReadOnlyNotice(project.status);
    if (selectedIssue !== null) {
        renderIssueDetail();
        issueDiscussionUi.render();
    }
    breadcrumbCurrent.textContent = project.name;
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
            setIssueQuickAddActive(false);
            focusIssueQuickAddReturnTarget();
        }
        return;
    }
    if (adminView.contains(focused)) {
        workspaceAdminUi.focusSelectedTab();
        return;
    }
    if (issueDiscussionUi.isComposer(focused)) {
        issueDiscussionUi.focusSelectedMessageOrLatest();
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
            workspacePickerUi.open();
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
            issueDiscussionUi.moveSelectionToBoundary('first');
            break;
        case 'last-issue-discussion-message':
            issueDiscussionUi.moveSelectionToBoundary('last');
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
            issueDiscussionUi.moveSelection(1);
            break;
        case 'previous-issue-discussion-message':
            issueDiscussionUi.moveSelection(-1);
            break;
        case 'focus-chat-composer':
            focusActiveChatComposer();
            break;
        case 'reply-to-chat-message':
            replyToSelectedChatMessage();
            break;
        case 'focus-issue-discussion-composer':
            issueDiscussionUi.focusComposer();
            break;
        case 'reply-to-issue-discussion-message':
            issueDiscussionUi.replyToSelected();
            break;
        case 'issue-from-selected-chat-message':
            createIssueFromSelectedChatMessage();
            break;
        case 'blur-text-input':
            blurTextInput();
            break;
        case 'collapse-status-history':
            issueRelatedUi.closeStatusHistory();
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
    if ((commandPaletteUi.isPaletteOpen() || clientSummaryUi.dialog.open || commandPaletteUi.isShortcutHelpOpen() || issueAiPromptUi.isOpen() || issueStatusPickerUi.isOpen() || issueDeleteUi.isOpen() || projectMembersUi.hasOpenDialog() || workspaceAdminUi.hasOpenDialog() || milestoneUi.deleteConfirmation.open || milestoneUi.managerDialog.open || workspacePickerUi.isOpen() || themeUi.aboutDialog.open || projectEditDialog.open)
        && event.key !== 'Escape'
        && !((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k'))
        return;
    const context = shortcutContext(event.target);
    const action = resolveShortcut(event, context);
    if (action === null) {
        if (goPrefixUi.isPending() && !context.targetIsEditable)
            clearGoPrefix();
        return;
    }
    event.preventDefault();
    if (action !== 'await-projects-key' && action !== 'projects')
        clearGoPrefix();
    executeShortcut(action);
}
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
        issuePollingController.resetDelay();
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
window.addEventListener('resize', updateKeyboardHintsVisibility);
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
issueQuickAddTitle.addEventListener('input', () => issueQuickAddTitle.setCustomValidity(''));
projectForm.querySelector('textarea[name="description"]')
    ?.addEventListener('keydown', (event) => submitFormOnEnter(event, projectForm));
issueDescriptionInput?.addEventListener('keydown', (event) => submitFormOnEnter(event, issueForm));
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
function projectStatusLabel(status) {
    return PROJECT_STATUS_LABELS[status];
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
async function loadRoadmap() {
    try {
        const result = await api('/roadmap');
        roadmapUi.render(result.milestones);
    }
    catch (error) {
        report(error instanceof Error ? error.message : 'Could not load the roadmap.', true);
    }
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
        if (recordHistory)
            workspaceHistory.record(previousLocation, nextLocation);
        activeProject = result.project;
        activeProjectMembers = result.members;
        projectHeading.textContent = result.project.name;
        projectMilestones = milestoneResult.milestones;
        populateIssueAssigneeSelect(issueQuickAddAssignee, null);
        populateIssueMilestoneSelect(issueQuickAddMilestone, null);
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
        workspaceHistory.clear();
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
            issueDiscussionUi.schedulePoll(selectedIssue.id);
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
        void projectMembersUi.load(activeProject.id);
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
        issuePollingController.seedActiveEtag(result.etag);
        if (deletedResult !== null) {
            deletedProjectIssues = deletedResult.issues ?? [];
            issuePollingController.seedDeletedEtag(deletedResult.etag);
        }
        issuePollingController.clearDeferredChanges();
        issuePollingController.resetDelay();
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
            issuePollingController.seedDeletedEtag(result.etag);
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
    issueBulkUi.syncAssignControls();
}
function renderProjectIssueBoard() {
    issueBoardView.render();
}
function createIssueBulkMoveToolbar(issues) {
    return issueBulkUi.createMoveToolbar(issues);
}
function syncIssueBulkMoveToolbar(toolbar, issues) {
    issueBulkUi.syncMoveToolbar(toolbar, issues);
}
async function assignSelectedIssues() {
    await issueBulkActions.assignSelectedIssues();
}
async function updateSelectedIssuesSharing(isShared) {
    await issueBulkActions.updateSelectedIssuesSharing(isShared);
}
async function moveSelectedIssuesToMilestone() {
    await issueBulkActions.moveSelectedIssuesToMilestone();
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
    issueDetailViewUi.reconcileDeletedRows();
}
function renderIssueDetail() {
    issueDetailViewUi.renderDetail();
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
function focusIssueTitleButton(issueId) {
    const button = issueList.querySelector(`.issue-card[data-issue-id="${issueId}"] .issue-title-button`);
    if (button === null)
        return false;
    button.focus();
    return true;
}
function openIssue(issue) {
    selectedIssue = issue;
    issueRelatedUi.reset();
    issueDiscussionUi.clear();
    issueList.querySelectorAll('.issue-card').forEach((row) => {
        row.classList.toggle('is-keyboard-selected', row.dataset.issueId === String(issue.id));
    });
    issueDetailDisplay.hidden = false;
    issueDetailEditForm.hidden = true;
    renderIssueDetail();
    void issueRelatedUi.loadPullRequests(issue.id);
    void issueRelatedUi.loadStatusHistory(issue.id);
    void issueDiscussionUi.load(issue.id);
    switchProjectTab('issues');
    issueBackButton.focus();
}
function showDeletedIssues(restoreIssueId) {
    const projectId = activeProject?.id;
    if (projectId === undefined || deletedProjectIssues.length === 0)
        return;
    selectedIssue = null;
    issueDetailEditUi.reset();
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
function updateIssueStatus(issue, nextStatus) {
    return issueActions.updateStatus(issue, nextStatus);
}
function createIssueBulkSelectCheckbox(issue) {
    return issueBulkUi.createMoveCheckbox(issue);
}
function createIssueBulkAssignCheckbox(issue) {
    return issueBulkUi.createAssignCheckbox(issue);
}
function moveIssue(issue, direction, button) {
    return issueActions.move(issue, direction, button);
}
issueDetailDeleteButton.addEventListener('click', () => issueDeleteUi.open(selectedIssue));
issueBackButton.addEventListener('click', () => {
    const issueId = selectedIssue?.id;
    selectedIssue = null;
    issueDetailEditUi.reset();
    issueDetailEditForm.hidden = true;
    issueDetailDisplay.hidden = false;
    switchProjectTab('issues', issueId);
});
issueDetailStatus.addEventListener('click', () => {
    if (selectedIssue !== null)
        issueStatusPickerUi.open(selectedIssue, issueDetailStatus);
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
guestLogoutButton.addEventListener('click', () => { void signOut(); });
window.addEventListener('storage', (event) => {
    if (event.key === 'tangent-github-connected')
        void githubProjectUi.load();
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
        await projectListUi.load();
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
