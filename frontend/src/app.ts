import type { InboxEvent } from './inbox-events.js';
import { api, apiBaseUrl, ApiFailure } from './api.js';
import {
  ISSUE_STATUS_OPTIONS, ISSUE_TYPE_OPTIONS, PROJECT_STATUS_LABELS,
  type ChatMessage, type ConditionalIssueList,
  type InboxIssue, type Issue,
  type IssueGrouping, type IssuePriority, type IssueType,
  type LoginResponse, type Member,
  type Milestone, type Project, type User, type Workspace,
  type WorkspaceLocation,
} from './types.js';
import { initGuestUi } from './guest-ui.js';
import { initInboxUi } from './inbox-ui.js';
import { createLogoutController } from './logout.js';
import { ProjectNavigationOwner, runOwnedRequest } from './project-navigation.js';
import { createWorkspaceHistory } from './workspace-history.js';
import { switchWorkspaceMembership } from './workspace-switch.js';
import { initAuthUi } from './auth-ui.js';
import { initClientSummaryUi } from './client-summary-ui.js';
import { resolveShortcut, shouldSubmitOnEnter, type ShortcutAction } from './shortcuts.js';
import { nextTheme, themeLabel } from './theme.js';
import { initThemeUi } from './theme-ui.js';
import { initProjectNotesUi } from './project-notes-ui.js';
import { initMilestoneUi } from './milestone-ui.js';
import { initLoungePresence } from './lounge-presence.js';
import { initLoungeChatUi } from './lounge-chat-ui.js';
import { initWorkspaceAdminUi } from './workspace-admin-ui.js';
import { initProjectChatUi } from './project-chat-ui.js';
import { initCommandPaletteUi, type PaletteCommand } from './command-palette-ui.js';
import { initWorkspacePickerUi } from './workspace-picker-ui.js';
import { initIssueBoardUi } from './issue-board-ui.js';
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
import { milestoneStatus, type RoadmapMilestone } from './roadmap.js';
import {
  filterIssues,
  filterIssuesByMilestoneArchive,
  groupIssues,
  groupIssuesByMilestone,
  discussionIndicatorLabel,
  projectProgress,
  sortIssues,
  type IssueSortOrder,
  type IssueBoardScope,
  type IssueStatus,
} from './issue-board.js';
import {
  diffConditionalIssueCollections,
  loadIssueCollections,
  nextIssuePollDelay,
  refreshDeletedIssuesOnOpen,
  shouldDeferIssueUpdates,
} from './issue-polling.js';

import { dom } from './dom.js';

const {
  project: {
    projectHeading, projectEditDialog, projectReadOnlyNotice, editProjectButton, projectsNavButton, projectsView, projectView,
    projectForm, projectList, projectFormPanel, projectDescription, projectState,
    projectChatColumn, projectSidebarList, projectMain, projectTabs,
    projectKeyboardHints,
  },
  auth: {
    loginPanel, loginShell, accountBar, currentUserLabel, loginStatusMessage, logoutButton,
  },
  workspace: {
    workspacePanel, workspaceNav,
    adminNavButton, adminView, adminHeading, membersView, adminGoPrefixOption,
    membersTabButton,
  },
  shell: {
    createWorkspaceForm, breadcrumbProjectsButton, breadcrumbDivider, breadcrumbCurrent,
    notesTabButton, emptyIssues,
    statusMessage,
  },
  roadmap: {
    roadmapNavButton, roadmapView, roadmapHeading, roadmapSummary, roadmapMilestoneList, roadmapEmptyState,
    roadmapGoPrefixOption,
  },
  inbox: {
    inboxNavButton, inboxView, inboxHeading,
  },
  lounge: {
    loungeNavButton, loungeView, loungeHeading, loungeMessageList,
  },
  shortcuts: {
    toggleProjectFormButton, keyboardHints, goPrefixHint, goPrefixWorkspaceOption, goPrefixProjectOptions,
  },
  chat: {
    chatView,
  },
  issues: {
    issuesView, issueDetailView, issueDetailDisplay, issueDetailTitle, issueDetailPriority,
    issueDetailDueDate, issueDetailDescription, issueDetailBrief, issueDetailContextSection,
    issueDetailContext, issueDetailExpectedOutcomeSection, issueDetailExpectedOutcome,
    issueDetailAcceptanceCriteriaSection, issueDetailAcceptanceCriteria, issueDetailStatus,
    issueDetailStatusLabel, issueSourceLink,
    issueDetailEditForm, issueDetailEditButton,
    issueDetailDeleteButton, issuesTabButton, issueBackButton,
    issueForm, issueQuickAddTitle, issueQuickAddPriority, issueQuickAddDueDate,
    issueQuickAddAssignee, issueQuickAddMilestone, issueQuickAddOngoing, issueQuickAddShared,
    issueQuickAddApproval, issueQuickAddCancelButton, issueDetailType, issueDetailAssignee,
    issueDetailMilestone, issueDetailOngoingRow, issueDetailSharing, issueDetailApproval,
    issueDescriptionDetails, issueProgress, issueProgressLabel, issueFilter,
    issueGrouping, issueOrder, issueScope, issueCountSummary, issueBulkAssignToggle,
    issueBulkAssignToolbar, issueList, deletedIssuesDetails, deletedIssueCount, deletedIssueList,
  },
  guest: {
    guestLogoutButton,
  },
} = dom;

const KEYBOARD_HINTS_STORAGE_KEY = 'tangent.keyboard-hints-visible';

function loadKeyboardHintsPreference(): boolean {
  try {
    return window.localStorage.getItem(KEYBOARD_HINTS_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

function issueStatusLabel(status: IssueStatus): string {
  return ISSUE_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function issueStatusOptions(issue: Pick<Issue, 'is_ongoing'>): typeof ISSUE_STATUS_OPTIONS {
  return issue.is_ongoing
    ? ISSUE_STATUS_OPTIONS.filter((option) => option.value !== 'done')
    : ISSUE_STATUS_OPTIONS;
}

function issueTypeLabel(type: IssueType): string {
  return ISSUE_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

function issuePriorityLabel(priority: IssuePriority): string {
  return priority[0]!.toUpperCase() + priority.slice(1);
}

function formatIssueDueDate(dueDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return dueDate;
  const date = new Date(`${dueDate}T12:00:00Z`);
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(date);
}

function isIssueOverdue(issue: Pick<Issue, 'due_date' | 'status'>): boolean {
  if (issue.due_date === null || issue.status === 'done' || issue.status === 'cancelled') return false;
  const today = new Date();
  const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return issue.due_date < todayDate;
}

function issueAssigneeLabel(assigneeId: number | null): string {
  if (assigneeId === null) return 'Unassigned';
  return activeProjectMembers.find((member) => member.id === assigneeId)?.name ?? 'Former project member';
}

function populateIssueAssigneeSelect(select: HTMLSelectElement, selectedAssigneeId: number | null): void {
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

function populateIssueMilestoneSelect(select: HTMLSelectElement, selectedMilestoneId: number | null): void {
  const none = document.createElement('option');
  none.value = '';
  none.textContent = 'No milestone';
  select.replaceChildren(none);
  for (const milestone of projectMilestones) {
    if (milestone.archived_at !== null && milestone.id !== selectedMilestoneId) continue;
    const option = document.createElement('option');
    option.value = String(milestone.id);
    option.textContent = milestone.archived_at === null ? milestone.name : `${milestone.name} (archived)`;
    select.append(option);
  }
  select.value = selectedMilestoneId === null ? '' : String(selectedMilestoneId);
}

const themeUi = initThemeUi();
const commandPaletteUi = initCommandPaletteUi();





































































































































const projectSidebarSection = projectSidebarList.closest<HTMLElement>('.sidebar-projects')!;
const projectSidebarMore = createScrollMoreIndicator();
projectSidebarList.after(projectSidebarMore);

























































































































const issueBulkAssignCount = issueBulkAssignToolbar.querySelector<HTMLElement>('.issue-bulk-assign-count')!;
const issueBulkAssignSelectVisible = issueBulkAssignToolbar.querySelector<HTMLButtonElement>('.issue-bulk-assign-select-visible')!;
const issueBulkAssignTarget = issueBulkAssignToolbar.querySelector<HTMLSelectElement>('.issue-bulk-assign-target')!;
const issueBulkAssignApply = issueBulkAssignToolbar.querySelector<HTMLButtonElement>('.issue-bulk-assign-apply')!;
const issueBulkShareApply = issueBulkAssignToolbar.querySelector<HTMLButtonElement>('.issue-bulk-share-apply')!;
const issueBulkUnshareApply = issueBulkAssignToolbar.querySelector<HTMLButtonElement>('.issue-bulk-unshare-apply')!;
const issueBulkAssignCancel = issueBulkAssignToolbar.querySelector<HTMLButtonElement>('.issue-bulk-assign-cancel')!;




























let activeUser: User | null = null;
let keyboardHintsVisible = loadKeyboardHintsPreference();
let activeWorkspaces: Workspace[] = [];
let activeProject: Project | null = null;
let projectReturnFocusId: number | null = null;
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
let activeProjectMembers: Member[] = [];
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
let projectMilestones: Milestone[] = [];
let projectIssues: Issue[] = [];
let bulkMoveSelectionMode = false;
let bulkMovePending = false;
let selectedBulkMoveIssueIds = new Set<number>();
let bulkMoveMilestoneId: number | null = null;
let bulkAssignSelectionMode = false;
let bulkSelectionActionPending = false;
let selectedBulkAssignIssueIds = new Set<number>();
let visibleBulkAssignIssueIds = new Set<number>();
let bulkAssignTargetValue = '';
let issueGroupingBeforeNextUp: IssueGrouping = 'status';
let issueGroupingForcedByNextUp = false;






let deletedProjectIssues: Issue[] = [];
let selectedIssue: Issue | null = null;
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
let issuePollTimer: number | null = null;
let issuePollDelay = 1000;
let activeIssuesEtag: string | null = null;
let deletedIssuesEtag: string | null = null;
let deletedIssuesLoadProjectId: number | null = null;
let deletedIssuesLoadPromise: Promise<void> | null = null;
let issuePollHasDeferredChanges = false;
let issuePollInFlightProjectId: number | null = null;
let issuePollRequestVersion = 0;
const deletedIssueRowRenderSignatures = new WeakMap<HTMLLIElement, string>();
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
    if (bulkAssignSelectionMode) clearBulkAssignSelection();
    if (bulkMoveSelectionMode) clearBulkMoveSelection();
    else bulkMoveSelectionMode = true;
  },
  renderBoard: renderProjectIssueBoard,
  issueAssigneeLabel,
  createIssueRow: (issue, reorder, allowBulkMoveSelection, allowBulkAssignSelection) =>
    issueRowUi.create(issue, reorder, allowBulkMoveSelection, allowBulkAssignSelection),
  createBulkMoveToolbar: createIssueBulkMoveToolbar,
  syncBulkMoveToolbar: syncIssueBulkMoveToolbar,
  setTextContentIfChanged,
  placeNodeAtPosition,
  replaceIssueRowPreservingFocus,
});
const issueDeleteUi = initIssueDeleteUi({
  getProjectId: () => activeProject?.id ?? null,
  statusLabel: issueStatusLabel,
  onDeleted: async (issue, projectId) => {
    if (activeProject?.id !== projectId) return false;
    if (selectedIssue?.id === issue.id) {
      selectedIssue = null;
      issueDetailEditUi.reset();
      issueDetailEditForm.hidden = true;
      issueDetailDisplay.hidden = false;
      switchProjectTab('issues', issue.id);
      if (!deletedIssuesDetails.open) void loadDeletedProjectIssues(projectId);
    } else {
      await loadProjectIssues(projectId);
      if (!deletedIssuesDetails.open) await loadDeletedProjectIssues(projectId);
      if (!focusIssueTitleButton(issue.id)) issueFilter.focus();
    }
    return true;
  },
  onRestored: async (issue) => {
    await loadProjectIssues(issue.project_id);
    if (!focusIssueTitleButton(issue.id)) issuesTabButton.focus();
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
let selectedChatMessageId: number | null = null;
let issueQuickAddEscapePending = false;
let issueQuickAddReturnFocus: HTMLElement | null = null;
let issueQuickAddSourceMessageId: number | null = null;
let issueQuickAddSourceProjectId: number | null = null;
let goPrefixPending = false;
let goPrefixTimer: number | null = null;
let statusMessageTimer: number | null = null;

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

function renderLoginTerminal(message: string, isError = false): HTMLSpanElement | null {
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
  let text: HTMLSpanElement | null = null;
  if (message === '') {
    const cursor = document.createElement('span');
    cursor.className = 'login-terminal-cursor';
    cursor.setAttribute('aria-hidden', 'true');
    line.append(cursor);
  } else {
    text = document.createElement('span');
    text.className = 'status-message-text';
    text.textContent = message;
    line.append(text);
  }
  loginStatusMessage.append(label, line);
  return text;
}

function report(message: string, isError = false): void {
  if (guestUi.isShellVisible()) {
    guestUi.setStatus(message, isError);
    return;
  }
  if (statusMessageTimer !== null) window.clearTimeout(statusMessageTimer);
  statusMessageTimer = null;
  const target = workspacePanel.hidden ? loginStatusMessage : statusMessage;
  if (target === statusMessage) moveWorkspaceStatusToCurrentHeading();
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
  if (message === '') return;

  if (isError) {
    const dismiss = document.createElement('button');
    dismiss.className = 'status-message-dismiss';
    dismiss.type = 'button';
    dismiss.setAttribute('aria-label', 'Dismiss notification');
    dismiss.textContent = '×';
    dismiss.addEventListener('click', () => report(''));
    target.append(dismiss);
  } else {
    statusMessageTimer = window.setTimeout(() => {
      if (text !== null && target.contains(text)) {
        if (target === loginStatusMessage) renderLoginTerminal('');
        else target.replaceChildren();
        target.classList.remove('error');
      }
      statusMessageTimer = null;
    }, 4_000);
  }
}

function updateKeyboardHintsVisibility(): void {
  keyboardHints.hidden = !keyboardHintsVisible
    || activeUser === null
    || activeUser.role === 'guest'
    || workspacePanel.hidden;
}

function toggleKeyboardHints(): void {
  if (activeUser === null || activeUser.role === 'guest' || workspacePanel.hidden) return;
  keyboardHintsVisible = !keyboardHintsVisible;
  try {
    window.localStorage.setItem(KEYBOARD_HINTS_STORAGE_KEY, String(keyboardHintsVisible));
  } catch {
    /* Storage can be blocked; the choice then lasts for this page only. */
  }
  updateKeyboardHintsVisibility();
}

function invalidateProjectNavigation(sessionChanged = false): void {
  if (sessionChanged) projectNavigation.changeSession();
  else projectNavigation.invalidate();
}

function showSignedOut(): void {
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
  if (clientSummaryUi.dialog.open) clientSummaryUi.close();
  activeUser = null;
  githubProjectUi.reset();
  editProjectButton.hidden = true;
  if (projectEditDialog.open) projectEditDialog.close();
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

function showSignedIn(user: User): void {
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
  if (user.role === 'admin') void githubProjectUi.load();
  report('');
}

async function loadWorkspaces(): Promise<void> {
  workspacePickerUi.resetPendingSwitch();
  const result = await api<{ workspaces: Workspace[] }>('/workspaces');
  activeWorkspaces = result.workspaces;
  workspacePickerUi.renderSwitcher();
}

async function switchWorkspace(workspaceId: number, restoreSwitcherFocus = false): Promise<void> {
  workspacePickerUi.resetPendingSwitch();
  if (activeUser === null || workspaceId === activeUser.workspace_id) return;
  workspacePickerUi.setSwitching(true);
  try {
    const result = await switchWorkspaceMembership(
      activeUser,
      workspaceId,
      (targetWorkspaceId) => api<{ user: User; workspace: Workspace }>(`/workspaces/${targetWorkspaceId}/switch`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      showSignedIn,
      loadWorkspaces,
      () => projectListUi.load(),
    );
    if (result === null) return;
    report(`Switched to ${result.workspace.name}.`);
  } catch (error) {
    report(error instanceof Error ? error.message : 'Could not switch workspace.', true);
  } finally {
    workspacePickerUi.setSwitching(false, restoreSwitcherFocus);
  }
}

function moveWorkspaceStatusToCurrentHeading(): void {
  const currentView = Array.from(workspacePanel.querySelectorAll<HTMLElement>('.workspace-view'))
    .find((view) => !view.hidden);
  const heading = currentView?.querySelector<HTMLElement>('.page-heading');
  if (heading !== undefined && heading !== null && statusMessage.parentElement !== heading) {
    heading.append(statusMessage);
  }
}

function showWorkspaceView(view: 'projects' | 'roadmap' | 'inbox' | 'lounge' | 'admin' | 'project'): void {
  if (view !== 'project') invalidateProjectNavigation();
  const wasLoungeActive = view !== 'lounge' && loungeActive;
  if (view !== 'inbox') {
    inboxUi.clearForNavigation();
  }
  if (view !== 'lounge') loungeChatUi.stop();
  if (view !== 'project') {
    if (activeProject !== null) projectReturnFocusId = activeProject.id;
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
  projectSidebarList.querySelectorAll<HTMLButtonElement>('.project-sidebar-link').forEach((button) => {
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
    if (!focusProjectOpenButton(projectId)) projectsNavButton.focus();
  }
  if (wasLoungeActive) void loungePresenceUi.pollWorkspacePresence();
}

function openWorkspaceAdmin(): void {
  const currentLocation = currentWorkspaceLocation();
  workspaceHistory.record(currentLocation, { view: 'admin' });
  showWorkspaceView('admin');
  workspaceAdminUi.open();
  adminHeading.focus();
}

function switchWorkspaceAdminTab(tab: 'members' | 'invites' | 'workspaces'): void {
  workspaceAdminUi.switchTab(tab);
}

function currentWorkspaceLocation(): WorkspaceLocation {
  if (!projectView.hidden && activeProject !== null) {
    return {
      view: 'project',
      projectId: activeProject.id,
      tab: !projectNotesUi.view.hidden ? 'notes' : membersView.hidden ? 'issues' : 'members',
    };
  }
  if (!inboxView.hidden) return { view: 'inbox' };
  if (!roadmapView.hidden) return { view: 'roadmap' };
  if (!loungeView.hidden) return { view: 'lounge' };
  if (!adminView.hidden) return { view: 'admin' };
  const focused = document.activeElement;
  const projectCard = focused instanceof HTMLElement ? focused.closest<HTMLElement>('.project-card') : null;
  const focusedProjectId = Number(projectCard?.dataset.projectId);
  if (Number.isSafeInteger(focusedProjectId) && focusedProjectId > 0) {
    return { view: 'projects', focusedProjectId };
  }
  return { view: 'projects' };
}

function goToProjects(): void {
  workspaceHistory.clear();
  showWorkspaceView('projects');
}

function goToRoadmap(): void {
  if (activeUser === null || activeUser.role === 'guest') return;
  const currentLocation = currentWorkspaceLocation();
  workspaceHistory.record(currentLocation, { view: 'roadmap' });
  showWorkspaceView('roadmap');
  roadmapHeading.focus();
  void loadRoadmap();
}

function goToInbox(): void {
  const currentLocation = currentWorkspaceLocation();
  workspaceHistory.record(currentLocation, { view: 'inbox' });
  showWorkspaceView('inbox');
  inboxHeading.focus();
  inboxUi.load();
}

function goToLounge(): void {
  const currentLocation = currentWorkspaceLocation();
  workspaceHistory.record(currentLocation, { view: 'lounge' });
  showWorkspaceView('lounge');
  loungeHeading.focus();
  loungeChatUi.load();
}

function goBackWorkspaceView(): void {
  const currentLocation = currentWorkspaceLocation();
  if (currentLocation.view === 'projects') return;
  const previousLocation = workspaceHistory.pop();
  if (previousLocation?.view === 'project') {
    void loadProjectDetail(previousLocation.projectId, previousLocation.tab, false);
  } else if (previousLocation?.view === 'inbox') {
    showWorkspaceView('inbox');
    inboxHeading.focus();
    inboxUi.load();
  } else if (previousLocation?.view === 'roadmap') {
    showWorkspaceView('roadmap');
    roadmapHeading.focus();
    void loadRoadmap();
  } else if (previousLocation?.view === 'lounge') {
    showWorkspaceView('lounge');
    loungeHeading.focus();
    void loungeChatUi.load();
  } else if (previousLocation?.view === 'admin') {
    showWorkspaceView('admin');
    adminHeading.focus();
  } else {
    showWorkspaceView('projects');
    if (previousLocation?.view === 'projects' && previousLocation.focusedProjectId !== undefined
      && focusProjectOpenButton(previousLocation.focusedProjectId)) return;
    projectsNavButton.focus();
  }
}

function pauseIssuePolling(): void {
  if (issuePollTimer !== null) window.clearTimeout(issuePollTimer);
  issuePollTimer = null;
  issuePollRequestVersion += 1;
  issuePollInFlightProjectId = null;
}

function stopIssuePolling(resetState = true): void {
  pauseIssuePolling();
  if (!resetState) return;
  issuePollDelay = 1000;
  activeIssuesEtag = null;
  deletedIssuesEtag = null;
  issuePollHasDeferredChanges = false;
}

function resumeDeferredIssuePolling(): void {
  const projectId = activeProject?.id;
  if (issuePollHasDeferredChanges && projectId !== undefined && issuePollingIsActive(projectId)
    && !issueUpdatesAreDeferred()) {
    issuePollDelay = 1000;
    scheduleIssuePoll(0);
  }
}

function issuePollingIsActive(projectId: number): boolean {
  return activeProject?.id === projectId && !projectView.hidden
    && (!issuesView.hidden || !issueDetailView.hidden);
}

function issueUpdatesAreDeferred(): boolean {
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

async function fetchConditionalIssueList(
  projectId: number,
  deleted: boolean,
  etag: string | null,
): Promise<ConditionalIssueList> {
  const headers = new Headers();
  if (etag !== null) headers.set('If-None-Match', etag);
  const suffix = deleted ? '/deleted' : '';
  const response = await fetch(`${apiBaseUrl}/projects/${projectId}/issues${suffix}`, {
    headers,
    credentials: 'same-origin',
  });
  const responseEtag = response.headers.get('ETag') ?? etag;
  if (response.status === 304) return { issues: null, etag: responseEtag };

  const payload = await response.json() as { issues?: Issue[]; error?: { message?: string } };
  if (!response.ok) {
    throw new ApiFailure(payload.error?.message ?? 'Could not load project issues.', response.status);
  }
  return { issues: payload.issues ?? [], etag: responseEtag };
}

function scheduleIssuePoll(delay = issuePollDelay): void {
  const projectId = activeProject?.id;
  if (projectId === undefined || !issuePollingIsActive(projectId)) {
    pauseIssuePolling();
    return;
  }
  if (issuePollTimer !== null) window.clearTimeout(issuePollTimer);
  issuePollTimer = window.setTimeout(() => {
    issuePollTimer = null;
    void pollProjectIssues(projectId);
  }, delay);
}

async function pollProjectIssues(projectId: number): Promise<void> {
  if (!issuePollingIsActive(projectId)) return;
  if (issuePollInFlightProjectId === projectId) return;
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
    const collections = await loadIssueCollections(
      () => fetchConditionalIssueList(projectId, false, activeEtag),
      () => fetchConditionalIssueList(projectId, true, deletedEtag),
      deletedIssuesDetails.open,
    );
    const activeResult = collections.active;
    const deletedResult = collections.deleted ?? { issues: null, etag: deletedIssuesEtag };
    if (requestVersion !== issuePollRequestVersion || !issuePollingIsActive(projectId)) return;
    const deferUpdates = deferUpdatesAtStart || issueUpdatesAreDeferred();

    const diffs = diffConditionalIssueCollections(
      projectIssues,
      activeResult.issues,
      deletedProjectIssues,
      deletedResult.issues,
    );
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
    if (collections.deleted !== null) deletedIssuesEtag = deletedResult.etag;
    if (deferUpdates && changed) {
      issuePollHasDeferredChanges = true;
    } else if (!deferUpdates) {
      if (activeResult.issues !== null) projectIssues = activeResult.issues;
      if (deletedResult.issues !== null) deletedProjectIssues = deletedResult.issues;
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
                void issueRelatedUi.loadStatusHistory(selectedIssueId);
              }
            }
          } else if (!issueDetailView.hidden) {
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
  } catch (error) {
    if (error instanceof ApiFailure && error.status === 401) {
      showSignedOut();
      return;
    }
    report(error instanceof Error ? error.message : 'Could not refresh project issues.', true);
    issuePollDelay = nextIssuePollDelay(issuePollDelay, false, false);
  } finally {
    if (requestVersion === issuePollRequestVersion) {
      if (issuePollInFlightProjectId === projectId) issuePollInFlightProjectId = null;
      const readyToApplyDeferredChanges = issuePollHasDeferredChanges && !issueUpdatesAreDeferred();
      if (readyToApplyDeferredChanges) issuePollDelay = 1000;
      if (issuePollingIsActive(projectId)) scheduleIssuePoll(readyToApplyDeferredChanges ? 0 : issuePollDelay);
    }
  }
}

function selectedProjectButton(): HTMLButtonElement | null {
  const focused = document.activeElement;
  if (focused instanceof HTMLElement) {
    const focusedCard = focused.closest<HTMLElement>('.project-card');
    if (focusedCard !== null) return focusedCard.querySelector<HTMLButtonElement>('button');
  }
  return projectList.querySelector<HTMLButtonElement>('.project-card.is-keyboard-selected button');
}

function focusProjectOpenButton(projectId: number): boolean {
  const button = projectList.querySelector<HTMLButtonElement>(
    `.project-card[data-project-id="${projectId}"] button`,
  );
  if (button === null) return false;
  button.focus();
  return true;
}

function selectedIssueButton(): HTMLButtonElement | null {
  const focused = document.activeElement;
  if (focused instanceof HTMLElement) {
    const focusedRow = focused.closest<HTMLElement>('.issue-card');
    if (focusedRow !== null && focusedRow.closest<HTMLDetailsElement>('.issue-group')?.open !== false) {
      return focusedRow.querySelector<HTMLButtonElement>('.issue-title-button');
    }
  }
  return Array.from(issueList.querySelectorAll<HTMLButtonElement>('.issue-card.is-keyboard-selected .issue-title-button'))
    .find((button) => button.closest<HTMLDetailsElement>('.issue-group')?.open !== false) ?? null;
}

function issueSelectedInVisibleView(): Issue | null {
  if (selectedIssue !== null) return selectedIssue;
  const titleButton = selectedIssueButton();
  const issueId = Number(titleButton?.closest<HTMLElement>('.issue-card')?.dataset.issueId);
  return projectIssues.find((issue) => issue.id === issueId) ?? null;
}

function visibleIssueTitleButtons(): HTMLButtonElement[] {
  return Array.from(issueList.querySelectorAll<HTMLButtonElement>('.issue-title-button'))
    .filter((button) => button.closest<HTMLDetailsElement>('.issue-group')?.open !== false);
}

function hasSelectedIssueInVisibleView(): boolean {
  return !projectView.hidden && (!issuesView.hidden || !issueDetailView.hidden)
    && (selectedIssue !== null || selectedIssueButton() !== null);
}

function latestChatIssueButton(): HTMLButtonElement | null {
  const list = projectChatUi.messageList();
  if (list === null) return null;
  const messages = Array.from(list.querySelectorAll<HTMLElement>('.chat-message'))
    .filter((message) => Number(message.dataset.messageId) > 0);
  return messages.at(-1)?.querySelector<HTMLButtonElement>('.chat-create-issue-button:not(:disabled)') ?? null;
}

function activeChatMessageList(): HTMLElement | null {
  return loungeView.hidden ? projectChatUi.messageList() : loungeMessageList;
}

function activeChatMessagesById(): Map<number, ChatMessage> {
  return loungeView.hidden ? projectChatUi.messagesById() : loungeChatUi.messagesById();
}

function focusActiveChatComposer(): void {
  if (loungeView.hidden) projectChatUi.focusComposer();
  else loungeChatUi.focusComposer();
}

function chatMessageElements(): HTMLElement[] {
  const list = activeChatMessageList();
  if (list === null) return [];
  return Array.from(list.querySelectorAll<HTMLElement>('.chat-message'))
    .filter((message) => Number(message.dataset.messageId) > 0);
}

function selectChatMessage(id: number, focus = true): void {
  const list = activeChatMessageList();
  const item = list?.querySelector<HTMLElement>(`.chat-message[data-message-id="${id}"]`);
  if (item === null || item === undefined) return;
  selectedChatMessageId = id;
  if (loungeView.hidden) projectChatUi.setFollowLatest(chatMessageElements().at(-1) === item);
  else loungeChatUi.setFollowLatest(chatMessageElements().at(-1) === item);
  list?.querySelectorAll<HTMLElement>('.chat-message').forEach((message) => {
    message.classList.toggle('is-keyboard-selected', message === item);
  });
  if (focus) item.focus();
}

function moveChatMessageSelection(direction: -1 | 1): void {
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
  if (next !== undefined) selectChatMessage(Number(next.dataset.messageId));
}

function moveChatMessageSelectionToBoundary(edge: 'first' | 'last'): void {
  const messages = chatMessageElements();
  const target = messages[edge === 'first' ? 0 : messages.length - 1];
  if (target !== undefined) selectChatMessage(Number(target.dataset.messageId));
}

function moveChatMessageSelectionByPage(direction: -1 | 1): void {
  const messages = chatMessageElements();
  const list = activeChatMessageList();
  if (messages.length === 0 || list === null) return;
  const currentIndex = messages.findIndex((message) => Number(message.dataset.messageId) === selectedChatMessageId);
  const pageSize = Math.max(1, visibleRowsInViewport(messages, list, '.chat-message') - 1);
  const baseIndex = currentIndex < 0
    ? direction > 0 ? 0 : Math.min(pageSize, messages.length - 1)
    : currentIndex;
  const targetIndex = Math.max(0, Math.min(messages.length - 1, baseIndex + direction * pageSize));
  const target = messages[targetIndex];
  if (target !== undefined) selectChatMessage(Number(target.dataset.messageId));
}

function focusProjectChat(): void {
  const messages = chatMessageElements();
  const latest = messages.at(-1);
  if (latest !== undefined) {
    selectChatMessage(Number(latest.dataset.messageId));
  } else {
    projectChatUi.focusComposer();
  }
}

function replyToSelectedChatMessage(): void {
  if (selectedChatMessageId === null || selectedChatMessageId <= 0) return;
  const message = activeChatMessagesById().get(selectedChatMessageId);
  if (message === undefined) return;
  if (loungeView.hidden) projectChatUi.setReplyParent(message);
  else loungeChatUi.setReplyParent(message);
}

function createIssueFromSelectedChatMessage(): void {
  if (selectedChatMessageId !== null) {
    const selectedButton = projectChatUi.messageList()
      ?.querySelector<HTMLElement>(`.chat-message[data-message-id="${selectedChatMessageId}"]`)
      ?.querySelector<HTMLButtonElement>('.chat-create-issue-button:not(:disabled)');
    if (selectedButton !== null && selectedButton !== undefined) {
      selectedButton.click();
      return;
    }
  }
  createIssueFromLatestMessage();
}

function goToProjectIssues(): void {
  if (activeProject === null) return;
  issueDiscussionUi.clear();
  selectedIssue = null;
  issueDetailEditForm.hidden = true;
  issueDetailDisplay.hidden = false;
  switchProjectTab('issues');
  issuesTabButton.focus();
}

function goToProjectMembers(): void {
  if (activeProject === null) return;
  switchProjectTab('members');
  membersTabButton.focus();
}

function goToProjectNotes(): void {
  if (activeProject === null) return;
  switchProjectTab('notes');
  notesTabButton.focus();
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.closest('summary') !== null
    || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest('[contenteditable="true"]') !== null) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  return ['email', 'number', 'password', 'search', 'tel', 'text', 'url'].includes(target.type);
}

function shouldBlurOnEscape(target: EventTarget | null): boolean {
  return target instanceof HTMLSelectElement || isTextInputTarget(target);
}

function shortcutContext(target: EventTarget | null) {
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
    issueDiscussionMessagesFocused: issueDiscussionUi.isMessageTarget(target),
    hasSelectedIssueDiscussionMessage: issueDiscussionUi.hasSelectedMessage(),
    issueGroupFocused: target instanceof HTMLElement && target.closest('.issue-group > summary') !== null,
    statusHistoryFocused: issueRelatedUi.isStatusHistoryFocused(document.activeElement),
    textInputFocused: shouldBlurOnEscape(target),
    modalOpen: commandPaletteUi.isPaletteOpen() || clientSummaryUi.dialog.open || commandPaletteUi.isShortcutHelpOpen() || issueAiPromptUi.isOpen() || issueStatusPickerUi.isOpen() || issueDeleteUi.isOpen() || themeUi.aboutDialog.open || projectEditDialog.open
      || projectMembersUi.hasOpenDialog() || workspaceAdminUi.hasOpenDialog() || milestoneUi.deleteConfirmation.open || milestoneUi.managerDialog.open
      || workspacePickerUi.isOpen(),
    canDismiss: commandPaletteUi.isPaletteOpen() || commandPaletteUi.isShortcutHelpOpen() || (!workspacePanel.hidden && (
      workspacePickerUi.hasPendingSwitch()
      || (!projectView.hidden && (!issueDetailView.hidden || !issueDetailEditForm.hidden
        || issueQuickAddEscapePending || projectChatUi.hasReplyParent()))
      || (!loungeView.hidden && loungeChatUi.hasReplyParent())
      || (!projectsView.hidden && !projectFormPanel.hidden)
      || !projectView.hidden || !roadmapView.hidden || !inboxView.hidden || !loungeView.hidden || !adminView.hidden
    )),
  };
}

function clearGoPrefix(): void {
  goPrefixPending = false;
  goPrefixHint.hidden = true;
  if (goPrefixTimer !== null) window.clearTimeout(goPrefixTimer);
  goPrefixTimer = null;
}

function startGoPrefix(): void {
  clearGoPrefix();
  goPrefixPending = true;
  goPrefixWorkspaceOption.hidden = activeWorkspaces.length < 2;
  goPrefixProjectOptions.hidden = activeProject === null || projectView.hidden;
  adminGoPrefixOption.hidden = activeUser?.role !== 'admin';
  roadmapGoPrefixOption.hidden = activeUser?.role === 'guest' || activeUser === null;
  goPrefixHint.hidden = false;
  goPrefixTimer = window.setTimeout(clearGoPrefix, 1200);
}

function moveFocusWithin<T extends HTMLElement>(buttons: T[], rowSelector: string, direction: -1 | 1): void {
  if (buttons.length === 0) return;
  const focused = document.activeElement;
  const currentIndex = buttons.findIndex((button) => {
    const row = button.closest<HTMLElement>(rowSelector);
    return row?.classList.contains('is-keyboard-selected') === true || (focused instanceof HTMLElement && row?.contains(focused) === true);
  });
  const nextIndex = currentIndex < 0
    ? direction > 0 ? 0 : buttons.length - 1
    : Math.max(0, Math.min(buttons.length - 1, currentIndex + direction));
  for (const button of buttons) button.closest<HTMLElement>(rowSelector)?.classList.remove('is-keyboard-selected');
  const next = buttons[nextIndex];
  next.closest<HTMLElement>(rowSelector)?.classList.add('is-keyboard-selected');
  next.focus();
}

function visibleRowsInViewport<T extends HTMLElement>(items: T[], viewport: HTMLElement, rowSelector: string): number {
  const viewportRect = viewport.getBoundingClientRect();
  const viewportTop = viewportRect.top + viewport.clientTop;
  const viewportBottom = viewportTop + viewport.clientHeight;
  return items.filter((item) => {
    const row = item.closest<HTMLElement>(rowSelector);
    if (row === null) return false;
    const rowRect = row.getBoundingClientRect();
    return rowRect.bottom > viewportTop && rowRect.top < viewportBottom;
  }).length;
}

function moveFocusByPage<T extends HTMLElement>(
  buttons: T[],
  rowSelector: string,
  viewport: HTMLElement,
  direction: -1 | 1,
): void {
  if (buttons.length === 0) return;
  const focused = document.activeElement;
  const currentIndex = buttons.findIndex((button) => {
    const row = button.closest<HTMLElement>(rowSelector);
    return row?.classList.contains('is-keyboard-selected') === true
      || (focused instanceof HTMLElement && row?.contains(focused) === true);
  });
  const pageSize = Math.max(1, visibleRowsInViewport(buttons, viewport, rowSelector) - 1);
  const baseIndex = currentIndex < 0
    ? direction > 0 ? 0 : Math.min(pageSize, buttons.length - 1)
    : currentIndex;
  const targetIndex = Math.max(0, Math.min(buttons.length - 1, baseIndex + direction * pageSize));
  for (const button of buttons) button.closest<HTMLElement>(rowSelector)?.classList.remove('is-keyboard-selected');
  const target = buttons[targetIndex];
  if (target === undefined) return;
  target.closest<HTMLElement>(rowSelector)?.classList.add('is-keyboard-selected');
  target.focus();
}

function moveFocusToBoundary<T extends HTMLElement>(buttons: T[], rowSelector: string, edge: 'first' | 'last'): void {
  if (buttons.length === 0) return;
  for (const button of buttons) button.closest<HTMLElement>(rowSelector)?.classList.remove('is-keyboard-selected');
  const target = buttons[edge === 'first' ? 0 : buttons.length - 1];
  target.closest<HTMLElement>(rowSelector)?.classList.add('is-keyboard-selected');
  target.focus();
}

function moveIssueSelection(direction: -1 | 1): void {
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
    const currentIndex = buttons.findIndex((button) => button.closest<HTMLElement>('.issue-card')?.dataset.issueId === String(selectedIssue?.id));
    const nextIndex = currentIndex < 0
      ? direction > 0 ? 0 : buttons.length - 1
      : Math.max(0, Math.min(buttons.length - 1, currentIndex + direction));
    const next = buttons[nextIndex];
    if (next !== undefined) next.click();
    return;
  }
  moveFocusWithin(buttons, '.issue-card', direction);
}

function moveIssueSelectionFromGroup(direction: -1 | 1): void {
  const summary = document.activeElement;
  if (!(summary instanceof HTMLElement)) return;
  const buttons = visibleIssueTitleButtons();
  const target = direction > 0
    ? buttons.find((button) => (summary.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0)
    : buttons.filter((button) => (summary.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_PRECEDING) !== 0).at(-1);
  if (target === undefined) return;
  for (const button of buttons) button.closest<HTMLElement>('.issue-card')?.classList.remove('is-keyboard-selected');
  target.closest<HTMLElement>('.issue-card')?.classList.add('is-keyboard-selected');
  target.focus();
}

function moveIssueSelectionToBoundary(edge: 'first' | 'last'): void {
  if (!inboxView.hidden) {
    moveFocusToBoundary(inboxUi.visibleIssueTitleButtons(), '.inbox-issue-card', edge);
    return;
  }
  const buttons = visibleIssueTitleButtons();
  const target = buttons[edge === 'first' ? 0 : buttons.length - 1];
  if (target === undefined) return;
  if (!issueDetailView.hidden && selectedIssue !== null) {
    target.click();
    return;
  }
  moveFocusToBoundary(buttons, '.issue-card', edge);
}

function moveProjectSelection(direction: -1 | 1): void {
  moveFocusWithin(
    Array.from(projectList.querySelectorAll<HTMLButtonElement>('.project-card button')),
    '.project-card',
    direction,
  );
}

function moveProjectSelectionToBoundary(edge: 'first' | 'last'): void {
  moveFocusToBoundary(
    Array.from(projectList.querySelectorAll<HTMLButtonElement>('.project-card button')),
    '.project-card',
    edge,
  );
}

function moveSelectionByPage(direction: -1 | 1): void {
  if (document.activeElement instanceof HTMLElement && document.activeElement.closest('.chat-message') !== null) {
    moveChatMessageSelectionByPage(direction);
  } else if (issueDiscussionUi.isMessageTarget(document.activeElement)) {
    issueDiscussionUi.moveSelectionByPage(direction);
  } else if (!projectsView.hidden) {
    moveFocusByPage(
      Array.from(projectList.querySelectorAll<HTMLButtonElement>('.project-card button')),
      '.project-card',
      projectsView,
      direction,
    );
  } else if (!inboxView.hidden) {
    moveFocusByPage(inboxUi.visibleIssueTitleButtons(), '.inbox-issue-card', inboxView, direction);
  } else if (!issuesView.hidden) {
    moveFocusByPage(visibleIssueTitleButtons(), '.issue-card', projectMain, direction);
  }
}

function moveSelection(direction: -1 | 1): void {
  if (!projectsView.hidden) {
    moveProjectSelection(direction);
  } else if (!inboxView.hidden) {
    moveIssueSelection(direction);
  } else if (!issuesView.hidden || !issueDetailView.hidden) {
    moveIssueSelection(direction);
  }
}

function beginCreateIssue(): void {
  if (activeProject === null) return;
  issueDiscussionUi.clear();
  selectedIssue = null;
  switchProjectTab('issues');
  issueQuickAddTitle.focus();
}

function editSelectedIssue(): void {
  if (selectedIssue === null) {
    const button = selectedIssueButton();
    if (button === null) return;
    button.click();
  }
  issueDetailEditButton.click();
}

function focusSelectedIssueStatus(): void {
  if (selectedIssue !== null) {
    issueStatusPickerUi.open(selectedIssue, issueDetailStatus);
    return;
  }
  const titleButton = selectedIssueButton();
  const row = titleButton?.closest<HTMLElement>('.issue-card');
  const issueId = Number(row?.dataset.issueId);
  const issue = projectIssues.find((candidate) => candidate.id === issueId);
  if (issue !== undefined && titleButton !== null && titleButton !== undefined) {
    issueStatusPickerUi.open(issue, titleButton);
  }
}

function createIssueFromLatestMessage(): void {
  latestChatIssueButton()?.click();
}

function compactChatMessage(body: string): string {
  const normalized = body.replace(/\s+/g, ' ').trim();
  const characters = Array.from(normalized);
  return characters.length > 110 ? `${characters.slice(0, 109).join('').trimEnd()}…` : normalized;
}

function avatarInitials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase();
}

function beginCreateIssueFromChatMessage(message: ChatMessage, trigger: HTMLButtonElement): void {
  const projectId = activeProject?.id;
  if (projectId === undefined || projectChatUi.activeProjectId() !== projectId) return;
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

function getPaletteCommands(): PaletteCommand[] {
  if (activeUser === null) return [];
  const commands: PaletteCommand[] = [
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
      run: () => workspacePickerUi.open(),
    });
    for (const workspace of activeWorkspaces) {
      if (workspace.id === activeUser.workspace_id) continue;
      commands.splice(1, 0, {
        label: `Switch to ${workspace.name}`,
        detail: `Review and confirm switching to ${workspace.name}`,
        shortcut: '',
        run: () => workspacePickerUi.open(workspace.id),
      });
    }
  }
  if (activeUser?.role === 'admin' && !projectsView.hidden) {
    commands.unshift({
      label: 'New project',
      detail: 'Create a project in this workspace',
      shortcut: '',
      run: () => {
        if (projectFormPanel.hidden) toggleProjectFormButton.click();
        else projectForm.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
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
        createWorkspaceForm.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
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
    commands.splice(1, 0,
      {
        label: 'Project issues',
        detail: `Focus issues in ${activeProject.name}`,
        shortcut: 'g i',
        run: goToProjectIssues,
      },
      {
        label: 'Project chat',
        detail: 'Focus the latest project chat message or composer',
        shortcut: 'g c',
        run: focusProjectChat,
      },
      {
        label: 'Project members',
        detail: `Focus members in ${activeProject.name}`,
        shortcut: 'g m',
        run: goToProjectMembers,
      },
      {
        label: 'Project notes',
        detail: `Open notes for ${activeProject.name}`,
        shortcut: '',
        run: goToProjectNotes,
      },
    );
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
        run: () => issueDeleteUi.open(issue),
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

function openCommandPalette(): void {
  if (activeUser === null || milestoneUi.deleteConfirmButton.disabled) return;
  if (themeUi.aboutDialog.open) themeUi.aboutDialog.close();
  if (projectEditDialog.open) projectEditDialog.close();
  if (workspacePickerUi.isOpen()) workspacePickerUi.resetPendingSwitch();
  if (clientSummaryUi.dialog.open) clientSummaryUi.close();
  if (issueAiPromptUi.isOpen()) issueAiPromptUi.close();
  if (milestoneUi.deleteConfirmation.open) milestoneUi.closeDeleteConfirmation();
  if (milestoneUi.managerDialog.open) milestoneUi.close();
  if (issueStatusPickerUi.isOpen()) issueStatusPickerUi.close();
  if (issueDeleteUi.isOpen()) issueDeleteUi.close();
  if (projectMembersUi.hasOpenDialog()) projectMembersUi.closeRemovalConfirmation();
  workspaceAdminUi.closeOpenDialogs();
  commandPaletteUi.togglePalette(getPaletteCommands);
}

function showShortcutHelp(): void {
  if (activeUser === null || milestoneUi.deleteConfirmButton.disabled) return;
  if (workspacePickerUi.isOpen()) workspacePickerUi.resetPendingSwitch();
  if (clientSummaryUi.dialog.open) clientSummaryUi.close();
  if (issueAiPromptUi.isOpen()) issueAiPromptUi.close();
  if (milestoneUi.deleteConfirmation.open) milestoneUi.closeDeleteConfirmation();
  if (milestoneUi.managerDialog.open) milestoneUi.close();
  if (issueStatusPickerUi.isOpen()) issueStatusPickerUi.close();
  if (issueDeleteUi.isOpen()) issueDeleteUi.close();
  if (projectMembersUi.hasOpenDialog()) projectMembersUi.closeRemovalConfirmation();
  workspaceAdminUi.closeOpenDialogs();
  commandPaletteUi.toggleShortcutHelp();
}

function dismissCurrentView(): void {
  if (milestoneUi.deleteConfirmButton.disabled) return;
  if (themeUi.aboutDialog.open) {
    themeUi.aboutDialog.close();
  } else if (projectEditDialog.open) {
    projectEditDialog.close();
  } else if (workspacePickerUi.isOpen()) {
    workspacePickerUi.resetPendingSwitch();
  } else if (clientSummaryUi.dialog.open) {
    clientSummaryUi.close();
  } else if (issueAiPromptUi.isOpen()) {
    issueAiPromptUi.close();
  } else if (milestoneUi.deleteConfirmation.open) {
    milestoneUi.closeDeleteConfirmation();
  } else if (milestoneUi.managerDialog.open) {
    milestoneUi.close();
  } else if (issueDeleteUi.isOpen()) {
    issueDeleteUi.close();
  } else if (projectMembersUi.hasOpenDialog()) {
    projectMembersUi.closeRemovalConfirmation();
  } else if (workspaceAdminUi.hasOpenDialog()) {
    workspaceAdminUi.closeCurrentDialog();
  } else if (issueStatusPickerUi.isOpen()) {
    issueStatusPickerUi.close();
  } else if (commandPaletteUi.isPaletteOpen()) {
    commandPaletteUi.closePalette();
  } else if (commandPaletteUi.isShortcutHelpOpen()) {
    commandPaletteUi.closeShortcutHelp();
  } else if (!workspacePanel.hidden && !projectView.hidden && !issueDetailEditForm.hidden) {
    issueDetailEditUi.close();
  } else if (!workspacePanel.hidden && !projectView.hidden && !issueDetailView.hidden) {
    issueBackButton.click();
  } else if (!workspacePanel.hidden && !projectsView.hidden && !projectFormPanel.hidden) {
    projectListUi.closeForm();
  } else if (!workspacePanel.hidden && !projectView.hidden
    && (issueQuickAddEscapePending || issueForm.classList.contains('is-active'))) {
    cancelIssueQuickAdd();
  } else if (!workspacePanel.hidden && !loungeView.hidden && loungeChatUi.hasReplyParent()) {
    loungeChatUi.clearReplyParent();
  } else if (!workspacePanel.hidden && !projectView.hidden && projectChatUi.hasReplyParent()) {
    projectChatUi.clearReplyParent();
  } else if (!workspacePanel.hidden && (!projectView.hidden || !inboxView.hidden || !adminView.hidden)) {
    goBackWorkspaceView();
  }
}

function focusIssueQuickAddReturnTarget(): void {
  const target = issueQuickAddReturnFocus;
  const dialog = target?.closest('dialog') ?? null;
  if (target !== null && (projectView.contains(target) || projectChatColumn.contains(target))
    && target.isConnected && target.closest('[hidden]') === null
    && (dialog === null || dialog.open)) {
    target.focus();
  } else {
    issuesTabButton.focus();
  }
}

function setIssueQuickAddActive(active: boolean): void {
  issueForm.classList.toggle('is-active', active);
  issueQuickAddCancelButton.hidden = !active;
}

function updateIssueQuickAddApproval(): void {
  issueQuickAddApproval.disabled = !issueQuickAddShared.checked;
  if (issueQuickAddApproval.disabled) issueQuickAddApproval.checked = false;
}

function updateOngoingMilestoneControl(ongoing: HTMLInputElement, milestone: HTMLSelectElement): void {
  if (ongoing.checked) milestone.value = '';
  milestone.disabled = ongoing.checked;
}

function cancelIssueQuickAdd(): void {
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

function issueQuickAddHasDraft(): boolean {
  const description = issueForm.querySelector<HTMLTextAreaElement>('textarea[name="description"]');
  const type = issueForm.querySelector<HTMLSelectElement>('select[name="type"]');
  return issueQuickAddTitle.value.trim() !== ''
    || (description?.value.trim() ?? '') !== ''
    || (type?.value ?? 'task') !== 'task'
    || issueQuickAddAssignee.value !== ''
    || issueQuickAddMilestone.value !== ''
    || issueQuickAddOngoing.checked
    || issueQuickAddShared.checked
    || issueQuickAddApproval.checked;
}

function projectStatusIsReadOnly(status: Project['status']): boolean {
  return status === 'completed' || status === 'archived';
}

function updateProjectReadOnlyNotice(status: Project['status']): void {
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
  } else if (status === 'archived') {
    projectReadOnlyNotice.textContent = 'This project is archived and read-only. An admin can restore its previous work state from Edit project.';
  } else {
    projectReadOnlyNotice.textContent = '';
  }
}

function applyEditedProject(project: Project): void {
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

function submitFormOnEnter(event: KeyboardEvent, form: HTMLFormElement): void {
  if (!shouldSubmitOnEnter(event.key, event.shiftKey, event.isComposing)) return;
  event.preventDefault();
  form.requestSubmit();
}

function blurTextInput(): void {
  const focused = document.activeElement;
  if (!(focused instanceof HTMLElement)) return;
  focused.blur();
  if (issueForm.contains(focused)) {
    if (issueQuickAddHasDraft()) {
      issueQuickAddEscapePending = true;
    } else {
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
      : loungeMessageList.querySelector<HTMLElement>(`.chat-message[data-message-id="${selectedChatMessageId}"]`);
    const latest = chatMessageElements().at(-1) ?? null;
    const target = selected ?? latest;
    if (target !== null) selectChatMessage(Number(target.dataset.messageId));
    else loungeHeading.focus();
    return;
  }
  if (!projectChatUi.isComposer(focused)) return;

  const selected = selectedChatMessageId === null
    ? null
    : projectChatUi.messageList()?.querySelector<HTMLElement>(`.chat-message[data-message-id="${selectedChatMessageId}"]`) ?? null;
  const latest = chatMessageElements().at(-1) ?? null;
  const target = selected ?? latest;
  if (target !== null) {
    const messageId = Number(target.dataset.messageId);
    if (messageId > 0) selectChatMessage(messageId);
    else target.focus();
  } else {
    projectChatColumn.querySelector<HTMLElement>('.chat-heading')?.focus();
  }
}

function executeShortcut(action: ShortcutAction): void {
  switch (action) {
    case 'command-palette': openCommandPalette(); break;
    case 'shortcut-help': showShortcutHelp(); break;
    case 'toggle-keyboard-hints': toggleKeyboardHints(); break;
    case 'theme-selector': themeUi.focusSelector(); break;
    case 'await-projects-key': startGoPrefix(); break;
    case 'projects': clearGoPrefix(); goToProjects(); break;
    case 'roadmap': clearGoPrefix(); goToRoadmap(); break;
    case 'inbox': goToInbox(); break;
    case 'lounge': goToLounge(); break;
    case 'workspace-switcher': workspacePickerUi.open(); break;
    case 'issues': goToProjectIssues(); break;
    case 'chat': focusProjectChat(); break;
    case 'members': goToProjectMembers(); break;
    case 'workspace-admin': openWorkspaceAdmin(); break;
    case 'next-project': moveProjectSelection(1); break;
    case 'previous-project': moveProjectSelection(-1); break;
    case 'first-project': moveProjectSelectionToBoundary('first'); break;
    case 'last-project': moveProjectSelectionToBoundary('last'); break;
    case 'open-selected-project': selectedProjectButton()?.click(); break;
    case 'first-chat-message': moveChatMessageSelectionToBoundary('first'); break;
    case 'last-chat-message': moveChatMessageSelectionToBoundary('last'); break;
    case 'first-issue-discussion-message': issueDiscussionUi.moveSelectionToBoundary('first'); break;
    case 'last-issue-discussion-message': issueDiscussionUi.moveSelectionToBoundary('last'); break;
    case 'page-up': moveSelectionByPage(-1); break;
    case 'page-down': moveSelectionByPage(1); break;
    case 'next': moveIssueSelection(1); break;
    case 'previous': moveIssueSelection(-1); break;
    case 'first-issue': moveIssueSelectionToBoundary('first'); break;
    case 'last-issue': moveIssueSelectionToBoundary('last'); break;
    case 'focus-issue-filter': issueFilter.focus(); break;
    case 'open-selected':
      if (!inboxView.hidden) inboxUi.selectedIssueButton()?.click();
      else selectedIssueButton()?.click();
      break;
    case 'create-issue': beginCreateIssue(); break;
    case 'edit-selected': editSelectedIssue(); break;
    case 'focus-status': focusSelectedIssueStatus(); break;
    case 'issue-from-latest-message': createIssueFromLatestMessage(); break;
    case 'next-chat-message': moveChatMessageSelection(1); break;
    case 'previous-chat-message': moveChatMessageSelection(-1); break;
    case 'next-issue-discussion-message': issueDiscussionUi.moveSelection(1); break;
    case 'previous-issue-discussion-message': issueDiscussionUi.moveSelection(-1); break;
    case 'focus-chat-composer': focusActiveChatComposer(); break;
    case 'reply-to-chat-message': replyToSelectedChatMessage(); break;
    case 'focus-issue-discussion-composer': issueDiscussionUi.focusComposer(); break;
    case 'reply-to-issue-discussion-message': issueDiscussionUi.replyToSelected(); break;
    case 'issue-from-selected-chat-message': createIssueFromSelectedChatMessage(); break;
    case 'blur-text-input': blurTextInput(); break;
    case 'collapse-status-history': issueRelatedUi.closeStatusHistory(); break;
    case 'dismiss': dismissCurrentView(); break;
  }
}

function handleKeyboardShortcut(event: KeyboardEvent): void {
  if (guestUi.isPreviewActive()) {
    if (event.key === 'Escape') guestUi.closePreview();
    return;
  }
  if ((commandPaletteUi.isPaletteOpen() || clientSummaryUi.dialog.open || commandPaletteUi.isShortcutHelpOpen() || issueAiPromptUi.isOpen() || issueStatusPickerUi.isOpen() || issueDeleteUi.isOpen() || projectMembersUi.hasOpenDialog() || workspaceAdminUi.hasOpenDialog() || milestoneUi.deleteConfirmation.open || milestoneUi.managerDialog.open || workspacePickerUi.isOpen() || themeUi.aboutDialog.open || projectEditDialog.open)
    && event.key !== 'Escape'
    && !((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')) return;
  const context = shortcutContext(event.target);
  const action = resolveShortcut(event, context);
  if (action === null) {
    if (goPrefixPending && !context.targetIsEditable) clearGoPrefix();
    return;
  }
  event.preventDefault();
  if (action !== 'await-projects-key' && action !== 'projects') clearGoPrefix();
  executeShortcut(action);
}

document.addEventListener('keydown', handleKeyboardShortcut);

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && projectChatUi.activeProjectId() !== null) projectChatUi.resume();
  if (!document.hidden && loungeActive) {
    loungeChatUi.resume();
    void loungePresenceUi.pollLoungePresence();
  }
  if (!document.hidden && !loungeActive) void loungePresenceUi.pollWorkspacePresence();
  if (!document.hidden && activeProject !== null && issuePollingIsActive(activeProject.id)) {
    issuePollDelay = 1000;
    scheduleIssuePoll(0);
  }
  if (!document.hidden && inboxUi.isPollingActive()) inboxUi.resumePolling();
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
  const currentIndex = tabs.indexOf(event.target as HTMLButtonElement);
  if (currentIndex < 0 || event.altKey || event.ctrlKey || event.metaKey) return;

  let nextIndex: number;
  if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
  else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
  else if (event.key === 'Home') nextIndex = 0;
  else if (event.key === 'End') nextIndex = tabs.length - 1;
  else return;

  event.preventDefault();
  event.stopPropagation();
  const nextTab = tabs[nextIndex];
  nextTab?.focus();
  nextTab?.click();
});
const issueDescriptionInput = issueForm.querySelector<HTMLTextAreaElement>('textarea[name="description"]');
const rememberIssueQuickAddOpener = (event: FocusEvent): void => {
  const previous = event.relatedTarget;
  if (previous instanceof HTMLElement && !issueForm.contains(previous)) {
    issueQuickAddReturnFocus = previous;
  } else if (issueQuickAddReturnFocus === null) {
    issueQuickAddReturnFocus = issuesTabButton;
  }
  issueQuickAddEscapePending = false;
};
issueForm.addEventListener('focusin', (event) => {
  rememberIssueQuickAddOpener(event);
  setIssueQuickAddActive(true);
});
issueForm.addEventListener('focusout', (event) => {
  if (event.relatedTarget instanceof Node && issueForm.contains(event.relatedTarget)) return;
  setTimeout(() => {
    if (issueForm.contains(document.activeElement) || issueQuickAddHasDraft()) return;
    issueDescriptionDetails.open = false;
    issueQuickAddEscapePending = false;
    setIssueQuickAddActive(false);
  }, 0);
});
issueDescriptionDetails.addEventListener('toggle', () => {
  if (issueDescriptionDetails.open) setIssueQuickAddActive(true);
});
issueQuickAddCancelButton.addEventListener('click', cancelIssueQuickAdd);
issueQuickAddShared.addEventListener('change', updateIssueQuickAddApproval);
issueQuickAddOngoing.addEventListener('change', () =>
  updateOngoingMilestoneControl(issueQuickAddOngoing, issueQuickAddMilestone));
issueQuickAddTitle.addEventListener('input', () => issueQuickAddTitle.setCustomValidity(''));
projectForm.querySelector<HTMLTextAreaElement>('textarea[name="description"]')
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
  if (bulkSelectionActionPending || bulkMovePending) return;
  if (bulkAssignSelectionMode) {
    clearBulkAssignSelection();
  } else {
    clearBulkMoveSelection();
    selectedBulkAssignIssueIds.clear();
    bulkAssignTargetValue = '';
    bulkAssignSelectionMode = true;
  }
  renderProjectIssueBoard();
  if (bulkAssignSelectionMode) issueList.querySelector<HTMLInputElement>('.issue-bulk-assign-checkbox')?.focus();
});
issueBulkAssignSelectVisible.addEventListener('click', () => {
  if (bulkSelectionActionPending || bulkMovePending) return;
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
  if (bulkSelectionActionPending) return;
  clearBulkAssignSelection();
  renderProjectIssueBoard();
  issueBulkAssignToggle.focus();
});

issueForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (activeProject === null) return;
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
  const issueInput: Record<string, unknown> = {
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
  } else if (parsedIssue.milestoneId !== undefined) issueInput.milestone_id = parsedIssue.milestoneId;
  else if (typeof milestoneValue === 'string' && milestoneValue !== '') issueInput.milestone_id = Number(milestoneValue);
  if (issueQuickAddShared.checked) issueInput.is_shared = true;
  if (issueQuickAddApproval.checked) issueInput.approval_requested = true;
  if (issueQuickAddSourceMessageId !== null) issueInput.source_message_id = issueQuickAddSourceMessageId;
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
    if (activeProject?.id === projectId && !projectView.hidden) issueQuickAddTitle.focus();
  } catch (error) {
    if (activeProject?.id === projectId) issueQuickAddTitle.focus();
    report(error instanceof Error ? error.message : 'Could not create the issue.', true);
  }
});

function projectStatusLabel(status: Project['status']): string {
  return PROJECT_STATUS_LABELS[status];
}

function createScrollMoreIndicator(): HTMLSpanElement {
  const indicator = document.createElement('span');
  indicator.className = 'sidebar-scroll-more';
  indicator.setAttribute('aria-hidden', 'true');
  indicator.hidden = true;
  return indicator;
}

function updateProjectSidebarMoreCue(): void {
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

async function loadRoadmap(): Promise<void> {
  try {
    const result = await api<{ milestones: RoadmapMilestone[] }>('/roadmap');
    renderRoadmap(result.milestones);
  } catch (error) {
    report(error instanceof Error ? error.message : 'Could not load the roadmap.', true);
  }
}

function renderRoadmap(milestones: readonly RoadmapMilestone[]): void {
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
  ] as const;

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

function formatRoadmapDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

async function openInboxEvent(event: InboxEvent): Promise<void> {
  await loadProjectDetail(event.project_id);
  if (activeProject?.id !== event.project_id || projectView.hidden) return;
  if (event.issue_id !== null) {
    await loadProjectIssues(event.project_id);
    const issue = projectIssues.find((candidate) => candidate.id === event.issue_id);
    if (issue === undefined) report('This issue is no longer available.', true);
    else openIssue(issue);
    return;
  }
  if (event.message_id === null) return;
  try {
    const result = await api<{ message: ChatMessage }>(
      `/projects/${event.project_id}/messages/${event.message_id}`,
    );
    if (activeProject?.id !== event.project_id || projectChatUi.activeProjectId() !== event.project_id) return;
    projectChatUi.appendMessage(result.message);
    selectChatMessage(result.message.id);
    projectChatUi.setFollowLatest(false);
  } catch (error) {
    if (error instanceof ApiFailure && error.status === 404) {
      report('The source message is no longer available.', true);
      return;
    }
    report(error instanceof Error ? error.message : 'Could not open the source message.', true);
  }
}

async function openInboxIssue(issue: InboxIssue): Promise<void> {
  await loadProjectDetail(issue.project_id);
  if (activeProject?.id !== issue.project_id || projectView.hidden) return;
  await loadProjectIssues(issue.project_id);
  const currentIssue = projectIssues.find((candidate) => candidate.id === issue.id);
  if (currentIssue === undefined) {
    report('This issue is no longer open and assigned to you.', true);
    return;
  }
  openIssue(currentIssue);
}

async function loadProjectDetail(
  projectId: number,
  tab: 'issues' | 'members' | 'notes' = 'issues',
  recordHistory = true,
): Promise<void> {
  const navigationTicket = projectNavigation.begin();
  clearBulkMoveSelection();
  clearBulkAssignSelection();
  const previousLocation = currentWorkspaceLocation();
  if (milestoneUi.managerDialog.open) milestoneUi.close();
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
  await runOwnedRequest(
      projectNavigation,
      navigationTicket,
      async (signal) => {
        const [result, milestoneResult] = await Promise.all([
          api<{ project: Project; members: Member[] }>(`/projects/${projectId}`, { signal }),
          api<{ milestones: Milestone[] }>(`/projects/${projectId}/milestones`, { signal }),
        ]);
        return { result, milestoneResult };
      },
      ({ result, milestoneResult }) => {
        const nextLocation: WorkspaceLocation = { view: 'project', projectId, tab };
        if (recordHistory) workspaceHistory.record(previousLocation, nextLocation);
        activeProject = result.project;
        activeProjectMembers = result.members;
        projectHeading.textContent = result.project.name;
        projectMilestones = milestoneResult.milestones;
        populateIssueAssigneeSelect(issueQuickAddAssignee, null);
        populateIssueMilestoneSelect(issueQuickAddMilestone, null);
        projectSidebarList.querySelectorAll<HTMLButtonElement>('.project-sidebar-link').forEach((button) => {
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
      },
      (error) => {
        workspaceHistory.clear();
        report(error instanceof Error ? error.message : 'Could not load the project.', true);
        showWorkspaceView('projects');
      },
    );
}

function switchProjectTab(tab: 'issues' | 'members' | 'notes', returnFocusIssueId?: number, loadIssues = true): void {
  if (activeProject === null) return;
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
  if (tab !== 'issues') pauseIssuePolling();
  if (tab === 'issues') {
    if (showingIssueDetail && selectedIssue !== null) issueDiscussionUi.schedulePoll(selectedIssue.id);
    if (!showingIssueDetail && loadIssues) {
      const projectId = activeProject.id;
      const loadingIssues = loadProjectIssues(projectId);
      if (returnFocusIssueId !== undefined) {
        issuesTabButton.focus();
        void loadingIssues.then(() => {
          if (activeProject?.id !== projectId || issuesView.hidden) return;
          if (!focusIssueTitleButton(returnFocusIssueId)) issuesTabButton.focus();
        });
      }
    }
    return;
  }

  if (tab === 'members') {
    void projectMembersUi.load(activeProject.id);
    return;
  }
  if (!projectNotesUi.isLoadedFor(activeProject.id)) void projectNotesUi.load(activeProject.id);
}

async function loadProjectIssues(projectId: number): Promise<void> {
  pauseIssuePolling();
  try {
    const collections = await loadIssueCollections(
      () => fetchConditionalIssueList(projectId, false, null),
      () => fetchConditionalIssueList(projectId, true, null),
      deletedIssuesDetails.open,
    );
    const result = collections.active;
    const deletedResult = collections.deleted;
    if (activeProject?.id !== projectId || issuesView.hidden) return;
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
  } catch (error) {
    if (error instanceof ApiFailure && error.status === 401) {
      showSignedOut();
      return;
    }
    report(error instanceof Error ? error.message : 'Could not load project issues.', true);
  }
}

function loadDeletedProjectIssues(projectId: number): Promise<void> {
  if (deletedIssuesLoadProjectId === projectId && deletedIssuesLoadPromise !== null) {
    return deletedIssuesLoadPromise;
  }

  const request = (async () => {
    try {
      const result = await fetchConditionalIssueList(projectId, true, null);
      if (activeProject?.id !== projectId || projectView.hidden) return;
      deletedProjectIssues = result.issues ?? [];
      deletedIssuesEtag = result.etag;
      renderProjectIssueBoard();
    } catch (error) {
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

function synchronizeIssueGroupingForOrder(): void {
  const nextUpMode = issueOrder.value === 'next_up';
  if (nextUpMode && !issueGroupingForcedByNextUp) {
    issueGroupingBeforeNextUp = issueGrouping.value as IssueGrouping;
    issueGrouping.value = 'milestone';
    issueGrouping.disabled = true;
  } else if (!nextUpMode && issueGroupingForcedByNextUp) {
    issueGrouping.value = issueGroupingBeforeNextUp;
    issueGrouping.disabled = false;
  }
  issueGroupingForcedByNextUp = nextUpMode;
}

function handleIssueOrderChange(): void {
  synchronizeIssueGroupingForOrder();
  if (issueOrder.value === 'next_up') clearBulkMoveSelection();
  renderProjectIssueBoard();
}

function clearBulkMoveSelection(): void {
  bulkMoveSelectionMode = false;
  selectedBulkMoveIssueIds.clear();
  bulkMoveMilestoneId = null;
}

function clearBulkAssignSelection(): void {
  bulkAssignSelectionMode = false;
  selectedBulkAssignIssueIds.clear();
  visibleBulkAssignIssueIds.clear();
  bulkAssignTargetValue = '';
}

function syncIssueBulkAssignControls(): void {
  const readOnly = activeProject !== null && projectStatusIsReadOnly(activeProject.status);
  const activeMembers = activeProjectMembers.filter((member) => member.is_active !== false && member.is_active !== 0);
  const optionsSignature = JSON.stringify(activeMembers.map((member) => [member.id, member.name]));
  if (issueBulkAssignTarget.dataset.optionsSignature !== optionsSignature) {
    const choose = new Option('Choose assignee', '');
    const unassigned = new Option('Unassigned', 'unassigned');
    issueBulkAssignTarget.replaceChildren(choose, unassigned);
    for (const member of activeMembers) issueBulkAssignTarget.add(new Option(member.name, String(member.id)));
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
  for (const checkbox of issueList.querySelectorAll<HTMLInputElement>('.issue-bulk-assign-checkbox')) {
    checkbox.checked = selectedBulkAssignIssueIds.has(Number(checkbox.dataset.issueId));
    checkbox.disabled = bulkSelectionActionPending || readOnly
      || (!checkbox.checked && selectedBulkAssignIssueIds.size >= 500);
  }
}

function renderProjectIssueBoard(): void {
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
  setTextContentIfChanged(issueProgressLabel,
    `${projectIssueProgress.done} of ${projectIssueProgress.total} ${progressUnit} done${progressExtras.length > 0 ? ` · ${progressExtras.join(' · ')}` : ''}`);

  const boardIssues = filterIssuesByMilestoneArchive(projectIssues, projectMilestones, issueScope.value as IssueBoardScope);
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
  const ordered = sortIssues(searchableIssues, issueOrder.value as IssueSortOrder);
  const nextUpMode = issueScope.value === 'active' && issueOrder.value === 'next_up';
  const workQueue = nextUpMode ? ordered.filter((issue) => ['backlog', 'todo', 'doing', 'testing'].includes(issue.status)) : ordered;
  const visible = filterIssues(workQueue, issueFilter.value);
  visibleBulkAssignIssueIds = new Set(visible.map((issue) => issue.id));
  for (const issueId of selectedBulkAssignIssueIds) {
    if (!visibleBulkAssignIssueIds.has(issueId)) selectedBulkAssignIssueIds.delete(issueId);
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

  issueBoardUi.render(groupIssues(visible).map((group) => ({
    key: `status:${group.status}`,
    name: group.status,
    className: 'issue-group',
    issues: group.issues,
  })));
}

function renderMilestoneIssueBoard(visibleIssues: Issue[]): void {
  const hasActiveMilestones = projectMilestones.some((milestone) => milestone.archived_at === null);
  if (!hasActiveMilestones) clearBulkMoveSelection();
  const visibleUnassignedIssueIds = new Set(visibleIssues
    .filter((issue) => issue.milestone_id === null && !issue.is_ongoing)
    .map((issue) => issue.id));
  for (const issueId of selectedBulkMoveIssueIds) {
    if (!visibleUnassignedIssueIds.has(issueId)) selectedBulkMoveIssueIds.delete(issueId);
  }
  issueBoardUi.render(groupIssuesByMilestone(visibleIssues, projectMilestones).map((group) => ({
    key: group.isOngoing ? 'milestone:ongoing' : `milestone:${group.milestoneId ?? 'none'}`,
    name: group.dueDate === null ? group.name : `${group.name} · due ${group.dueDate}`,
    className: 'issue-group milestone-issue-group',
    issues: group.issues,
    isOngoing: group.isOngoing,
    allowBulkMove: group.milestoneId === null && group.isOngoing !== true && hasActiveMilestones,
    openByDefault: issueScope.value !== 'history',
  })));
}

function renderNextUpIssueBoard(visibleIssues: Issue[], allOpenIssues: Issue[]): void {
  const groups = groupIssuesByMilestone(visibleIssues, projectMilestones).map((group) => {
    const allGroupIssues = allOpenIssues.filter((issue) => group.isOngoing
      ? issue.is_ongoing
      : !issue.is_ongoing && issue.milestone_id === group.milestoneId);
    const reorderByIssueId = new Map<number, { canMoveEarlier?: boolean; canMoveLater?: boolean; showMilestoneTag?: boolean }>();
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
  issueBoardUi.render(groups);
}

function createIssueBulkMoveToolbar(issues: Issue[]): HTMLDivElement {
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
    if (bulkMovePending) return;
    const details = toolbar.parentElement;
    if (!(details instanceof HTMLDetailsElement)) return;
    const issueIds = Array.from(details.querySelectorAll<HTMLInputElement>('.issue-bulk-select-checkbox'))
      .map((checkbox) => Number(checkbox.dataset.issueId))
      .filter((issueId) => Number.isInteger(issueId) && issueId > 0);
    if (issueIds.length > 500) return;
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
    const moveButton = toolbar.querySelector<HTMLButtonElement>('.issue-bulk-move-button');
    if (moveButton !== null) moveButton.disabled = bulkMovePending
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

function syncIssueBulkMoveToolbar(toolbar: HTMLDivElement, issues: Issue[]): void {
  const count = toolbar.querySelector<HTMLElement>('.issue-bulk-move-count');
  const selectAll = toolbar.querySelector<HTMLButtonElement>('.issue-bulk-select-all');
  const milestoneSelect = toolbar.querySelector<HTMLSelectElement>('.issue-bulk-move-milestone');
  const moveButton = toolbar.querySelector<HTMLButtonElement>('.issue-bulk-move-button');
  const disabled = bulkMovePending || bulkSelectionActionPending
    || (activeProject !== null && projectStatusIsReadOnly(activeProject.status));
  if (count !== null) setTextContentIfChanged(count, `${selectedBulkMoveIssueIds.size} selected`);
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
        if (milestone.archived_at !== null) continue;
        const option = document.createElement('option');
        option.value = String(milestone.id);
        option.textContent = milestone.name;
        milestoneSelect.append(option);
      }
      milestoneSelect.dataset.optionsSignature = optionsSignature;
    }
    if (bulkMoveMilestoneId !== null && !projectMilestones.some((milestone) =>
      milestone.id === bulkMoveMilestoneId && milestone.archived_at === null)) {
      bulkMoveMilestoneId = null;
    }
    milestoneSelect.value = bulkMoveMilestoneId === null ? '' : String(bulkMoveMilestoneId);
    milestoneSelect.disabled = disabled;
  }
  if (moveButton !== null) moveButton.disabled = disabled
    || selectedBulkMoveIssueIds.size === 0
    || bulkMoveMilestoneId === null;

  const details = toolbar.parentElement;
  if (details instanceof HTMLDetailsElement) {
    for (const checkbox of details.querySelectorAll<HTMLInputElement>('.issue-bulk-select-checkbox')) {
      checkbox.checked = selectedBulkMoveIssueIds.has(Number(checkbox.dataset.issueId));
      checkbox.disabled = disabled
        || (!checkbox.checked && selectedBulkMoveIssueIds.size >= 500);
    }
  }
}

async function assignSelectedIssues(): Promise<void> {
  const projectId = activeProject?.id;
  const issueIds = Array.from(selectedBulkAssignIssueIds);
  const assigneeId = bulkAssignTargetValue === 'unassigned' ? null : Number(bulkAssignTargetValue);
  if (projectId === undefined || issueIds.length === 0 || issueIds.length > 500
    || bulkAssignTargetValue === '' || (assigneeId !== null && (!Number.isInteger(assigneeId) || assigneeId < 1))
    || bulkSelectionActionPending || bulkMovePending) return;

  bulkSelectionActionPending = true;
  syncIssueBulkAssignControls();
  try {
    const result = await api<{ assigned_count: number }>(`/projects/${projectId}/issues/assign`, {
      method: 'POST',
      body: JSON.stringify({ issue_ids: issueIds, assignee_id: assigneeId }),
    });
    if (activeProject?.id !== projectId) {
      bulkSelectionActionPending = false;
      if (activeProject !== null && !issuesView.hidden) renderProjectIssueBoard();
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
  } catch (error) {
    bulkSelectionActionPending = false;
    if (activeProject?.id !== projectId) {
      if (activeProject !== null && !issuesView.hidden) renderProjectIssueBoard();
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

async function updateSelectedIssuesSharing(isShared: boolean): Promise<void> {
  const projectId = activeProject?.id;
  const issueIds = Array.from(selectedBulkAssignIssueIds);
  if (projectId === undefined || issueIds.length === 0 || issueIds.length > 500
    || bulkSelectionActionPending || bulkMovePending) return;

  bulkSelectionActionPending = true;
  syncIssueBulkAssignControls();
  try {
    const result = await api<{ updated_count: number }>(`/projects/${projectId}/issues/share`, {
      method: 'POST',
      body: JSON.stringify({ issue_ids: issueIds, is_shared: isShared }),
    });
    if (activeProject?.id !== projectId) {
      bulkSelectionActionPending = false;
      if (activeProject !== null && !issuesView.hidden) renderProjectIssueBoard();
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
  } catch (error) {
    bulkSelectionActionPending = false;
    if (activeProject?.id !== projectId) {
      if (activeProject !== null && !issuesView.hidden) renderProjectIssueBoard();
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

async function moveSelectedIssuesToMilestone(): Promise<void> {
  const projectId = activeProject?.id;
  const milestoneId = bulkMoveMilestoneId;
  const issueIds = Array.from(selectedBulkMoveIssueIds);
  if (projectId === undefined || milestoneId === null || issueIds.length === 0 || issueIds.length > 500 || bulkMovePending) return;

  bulkMovePending = true;
  renderProjectIssueBoard();
  try {
    await api<{ moved_count: number }>(`/projects/${projectId}/issues/move-to-milestone`, {
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
    issueList.querySelector<HTMLDetailsElement>(`:scope > .issue-group[data-group-key="milestone:${milestoneId}"]`)
      ?.querySelector<HTMLElement>(':scope > summary')?.focus();
    report(`Moved ${issueIds.length} ${issueIds.length === 1 ? 'issue' : 'issues'} to ${milestone?.name ?? 'the milestone'}.`);
    void loadProjectIssues(projectId);
  } catch (error) {
    bulkMovePending = false;
    if (activeProject?.id !== projectId) return;
    renderProjectIssueBoard();
    if (error instanceof ApiFailure && error.status === 401) {
      showSignedOut();
      return;
    }
    report(error instanceof Error ? error.message : 'Could not move the selected issues.', true);
  }
}

function setTextContentIfChanged(element: HTMLElement, value: string): void {
  if (element.textContent !== value) element.textContent = value;
}

function placeNodeAtPosition(parent: Element, node: Element, index: number): void {
  if (parent.children.item(index) === node) return;
  parent.insertBefore(node, parent.children.item(index));
}

function replaceIssueRowPreservingFocus(previous: HTMLLIElement, next: HTMLLIElement): void {
  const focused = document.activeElement;
  let focusTarget: string | null = null;
  if (focused instanceof HTMLElement && previous.contains(focused)) {
    if (focused.matches('.issue-title-button')) focusTarget = '.issue-title-button';
    else if (focused.matches('.issue-status-button')) focusTarget = '.issue-status-button';
    else if (focused.matches('.issue-bulk-select-checkbox')) focusTarget = '.issue-bulk-select-checkbox';
    else if (focused.matches('.issue-bulk-assign-checkbox')) focusTarget = '.issue-bulk-assign-checkbox';
    else if (focused.matches('[data-move-direction]')) {
      focusTarget = `[data-move-direction="${focused.getAttribute('data-move-direction')}"]`;
    }
  }
  previous.replaceWith(next);
  if (focusTarget !== null) next.querySelector<HTMLElement>(focusTarget)?.focus();
}

function reconcileDeletedIssueRows(): void {
  const existingRows = new Map(
    Array.from(deletedIssueList.querySelectorAll<HTMLLIElement>(':scope > .deleted-issue-item'))
      .map((row) => [Number(row.dataset.issueId), row]),
  );
  const expectedIds = new Set<number>();
  for (const [index, issue] of deletedProjectIssues.entries()) {
    expectedIds.add(issue.id);
    const signature = JSON.stringify([issue.title, issue.status]);
    const existing = existingRows.get(issue.id);
    const row = existing !== undefined && deletedIssueRowRenderSignatures.get(existing) === signature
      ? existing
      : createDeletedIssueRow(issue);
    if (row !== existing) {
      deletedIssueRowRenderSignatures.set(row, signature);
      if (existing !== undefined) replaceIssueRowPreservingFocus(existing, row);
    }
    placeNodeAtPosition(deletedIssueList, row, index);
  }
  deletedIssueList.querySelectorAll<HTMLLIElement>(':scope > .deleted-issue-item').forEach((row) => {
    if (!expectedIds.has(Number(row.dataset.issueId))) row.remove();
  });
}

function createDeletedIssueRow(issue: Issue): HTMLLIElement {
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
  restoreButton.addEventListener('click', () => void issueDeleteUi.restore(issue, restoreButton));
  item.append(content, restoreButton);
  return item;
}

function renderIssueDetail(): void {
  if (selectedIssue === null) return;
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
  } else {
    delete issueSourceLink.dataset.messageId;
  }
  issueRelatedUi.renderPullRequests();
}

function updateProjectIssueDiscussionCount(issueId: number, count: number): void {
  const current = projectIssues.find((issue) => issue.id === issueId);
  if (current !== undefined && (current.discussion_count ?? 0) !== count) {
    projectIssues = projectIssues.map((issue) => issue.id === issueId ? { ...issue, discussion_count: count } : issue);
    if (!issuesView.hidden) renderProjectIssueBoard();
  }
  if (selectedIssue?.id === issueId && (selectedIssue.discussion_count ?? 0) !== count) {
    selectedIssue = { ...selectedIssue, discussion_count: count };
  }
  inboxUi.updateIssueDiscussionCount(issueId, count);
}


function focusIssueTitleButton(issueId: number): boolean {
  const button = issueList.querySelector<HTMLButtonElement>(
    `.issue-card[data-issue-id="${issueId}"] .issue-title-button`,
  );
  if (button === null) return false;
  button.focus();
  return true;
}

function openIssue(issue: Issue): void {
  selectedIssue = issue;
  issueRelatedUi.reset();
  issueDiscussionUi.clear();
  issueList.querySelectorAll<HTMLElement>('.issue-card').forEach((row) => {
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

function showDeletedIssues(restoreIssueId?: number): void {
  const projectId = activeProject?.id;
  if (projectId === undefined || deletedProjectIssues.length === 0) return;

  selectedIssue = null;
  issueDetailEditUi.reset();
  issueDetailEditForm.hidden = true;
  issueDetailDisplay.hidden = false;
  switchProjectTab('issues', undefined, false);
  deletedIssuesDetails.open = true;
  void loadDeletedProjectIssues(projectId).then(() => {
    if (activeProject?.id !== projectId || issuesView.hidden || deletedProjectIssues.length === 0) return;
    deletedIssuesDetails.scrollIntoView({ block: 'nearest' });
    if (restoreIssueId !== undefined) {
      const restoreButton = Array.from(deletedIssueList.querySelectorAll<HTMLButtonElement>('.deleted-issue-item button'))
        .find((button) => button.dataset.issueId === String(restoreIssueId));
      if (restoreButton !== undefined) {
        restoreButton.click();
        return;
      }
    }
    deletedIssuesDetails.querySelector<HTMLElement>('summary')?.focus();
  });
}

async function updateIssueStatus(issue: Issue, nextStatus: IssueStatus): Promise<void> {
  const previousStatus = selectedIssue?.id === issue.id ? selectedIssue.status : issue.status;
  if (nextStatus === previousStatus) return;
  try {
    const result = await api<{ issue: Issue }>(`/issues/${issue.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus }),
    });
    if (selectedIssue?.id === issue.id) {
      selectedIssue = result.issue;
      projectIssues = projectIssues.map((candidate) => candidate.id === issue.id ? result.issue : candidate);
      renderIssueDetail();
      renderProjectIssueBoard();
      if (previousStatus !== result.issue.status) void issueRelatedUi.loadStatusHistory(issue.id);
    }
    report('Issue status updated.');
    if (issueDetailView.hidden) await loadProjectIssues(issue.project_id);
  } catch (error) {
    report(error instanceof Error ? error.message : 'Could not update the issue status.', true);
  }
}

function createIssueBulkSelectCheckbox(issue: Issue): HTMLInputElement {
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
          if (bulkMovePending || bulkSelectionActionPending) return;
    if (checkbox.checked) {
      if (selectedBulkMoveIssueIds.size >= 500) {
        checkbox.checked = false;
        report('Move up to 500 issues at a time.', true);
        return;
      }
      selectedBulkMoveIssueIds.add(issue.id);
    } else {
      selectedBulkMoveIssueIds.delete(issue.id);
    }
    renderProjectIssueBoard();
  });
  return checkbox;
}

function createIssueBulkAssignCheckbox(issue: Issue): HTMLInputElement {
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
    if (bulkSelectionActionPending) return;
    if (checkbox.checked) {
      if (selectedBulkAssignIssueIds.size >= 500) {
        checkbox.checked = false;
        report('Assign up to 500 issues at a time.', true);
        return;
      }
      selectedBulkAssignIssueIds.add(issue.id);
    } else {
      selectedBulkAssignIssueIds.delete(issue.id);
    }
    renderProjectIssueBoard();
  });
  return checkbox;
}

async function moveIssue(issue: Issue, direction: 'up' | 'down', button: HTMLButtonElement): Promise<void> {
  const projectId = activeProject?.id;
  if (projectId === undefined || projectId !== issue.project_id) return;
  button.disabled = true;
  try {
    const result = await api<{ issue: Issue }>(`/issues/${issue.id}/move`, {
      method: 'POST',
      body: JSON.stringify({ direction }),
    });
    if (activeProject?.id !== projectId || issuesView.hidden) return;
    projectIssues = projectIssues.map((candidate) => candidate.id === issue.id ? result.issue : candidate);
    renderProjectIssueBoard();
    const movedIssueRow = issueList.querySelector<HTMLLIElement>(`.issue-card[data-issue-id="${issue.id}"]`);
    const focusTarget = movedIssueRow?.querySelector<HTMLElement>(
      `[data-move-direction="${direction}"]:not(:disabled)`,
    ) ?? movedIssueRow?.querySelector<HTMLElement>('.issue-title-button');
    focusTarget?.focus();
  } catch (error) {
    if (error instanceof ApiFailure && error.status === 401) {
      showSignedOut();
      return;
    }
    report(error instanceof Error ? error.message : 'Could not reorder the issue.', true);
  } finally {
    button.disabled = false;
  }
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
  if (selectedIssue !== null) issueStatusPickerUi.open(selectedIssue, issueDetailStatus);
});

issueSourceLink.addEventListener('click', async (event) => {
  event.preventDefault();
  const issue = selectedIssue;
  const projectId = activeProject?.id;
  const messageId = Number(issueSourceLink.dataset.messageId);
  if (issue === null || projectId === undefined || !Number.isSafeInteger(messageId) || messageId < 1) return;

  let sourceMessage = projectChatUi.messageList()?.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`) ?? null;
  if (sourceMessage === null) {
    try {
      const result = await api<{ messages: ChatMessage[] }>(`/projects/${projectId}/messages?since=${messageId - 1}`);
      if (activeProject?.id !== projectId || selectedIssue?.id !== issue.id) return;
      for (const message of result.messages) projectChatUi.appendMessage(message);
      sourceMessage = projectChatUi.messageList()?.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`) ?? null;
    } catch (error) {
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
    const result = await api<{ workspace: Workspace }>('/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name: values.get('name') }),
    });
    createWorkspaceForm.reset();
    await loadWorkspaces();
    await switchWorkspace(result.workspace.id, true);
  } catch (error) {
    report(error instanceof Error ? error.message : 'Could not create the workspace.', true);
  }
});

guestLogoutButton.addEventListener('click', () => { void signOut(); });
window.addEventListener('storage', (event) => {
  if (event.key === 'tangent-github-connected') void githubProjectUi.load();
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

async function start(): Promise<void> {
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
    } catch {
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
    const result = await api<{ user: User }>('/auth/me');
    showSignedIn(result.user);
    await loadWorkspaces();
    if (result.user.role === 'guest') return;
    await projectListUi.load();
    if (githubConnected) report('GitHub connected. Choose a repository in project settings.');
  } catch (error) {
    showSignedOut();
    if (error instanceof ApiFailure && error.status !== 401) {
      report(error.message, true);
    }
  }
}

void start();
