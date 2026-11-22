import {
  INBOX_TABS, createEventRow, eventsForTab, inboxEventPagePath, mergeInboxEventPage, type InboxEvent, type InboxTab,
} from './inbox-events.js';
import { api, apiBaseUrl, ApiFailure } from './api.js';
import {
  ISSUE_STATUS_OPTIONS, ISSUE_TYPE_OPTIONS, PROJECT_STATUS_HINTS, PROJECT_STATUS_LABELS, PROJECT_STATUS_ORDER,
  type ChatEvent, type ChatMessage, type ConditionalInboxCollection, type ConditionalIssueList,
  type CredentialFragment, type GitHubRepository, type GitHubRepositoryOptionSelection,
  type InboxIssue, type InviteDelivery, type InvitePreview, type Issue, type IssueBoardGroup,
  type IssueDiscussionMessage, type IssueGrouping, type IssuePriority, type IssueStatusTransition, type IssueType,
  type LinkedPullRequest, type LoginResponse, type LoungeMentionMember, type Member,
  type Milestone, type MyWorkTab, type Project, type Role, type User, type Workspace, type WorkspaceInvite,
  type WorkspaceLocation, type WorkspaceMember,
} from './types.js';
import {
  diffInboxCollections,
  nextInboxPollDelay,
  shouldDeferInboxUpdates,
} from './inbox-polling.js';
import { initGuestUi } from './guest-ui.js';
import { createLogoutController } from './logout.js';
import { ProjectNavigationOwner, runOwnedRequest } from './project-navigation.js';
import { ChatEventFeed, pollProjectChatEvents, type ChatFeedEvent } from './chat-event-feed.js';
import { githubRepositorySelectionValue, parseGitHubRepositorySelection } from './github-repository-selection.js';
import { switchWorkspaceMembership } from './workspace-switch.js';
import { credentialNeedsConfirmation, inviteCredentialPresentation } from './credential-flow.js';
import { initClientSummaryUi } from './client-summary-ui.js';
import {
  filterMentionMembers,
  findMentionQuery,
  mentionEmptyMessage,
  nextMentionSelectionIndex,
  replaceMentionQuery,
  splitMentions,
  type MentionMember,
  type MentionQuery,
} from './chat-mentions.js';
import { formatChatTimestamp } from './chat-time.js';
import { resolveShortcut, shouldSubmitOnEnter, type ShortcutAction } from './shortcuts.js';
import { nextTheme, themeLabel } from './theme.js';
import { initThemeUi } from './theme-ui.js';
import { initProjectNotesUi } from './project-notes-ui.js';
import { initMilestoneUi } from './milestone-ui.js';
import { initLoungePresence } from './lounge-presence.js';
import { parseQuickIssueInput } from './quick-issue.js';
import { milestoneStatus, type RoadmapMilestone } from './roadmap.js';
import { formatIssueMarkdown, formatIssuePrompt } from './issue-export.js';
import { groupMyWorkTasks } from './my-work.js';
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
    projectHeading, projectEditDialog, projectEditForm, projectEditClose, projectEditCancel,
    projectEditName, projectEditDescription, projectEditStatus, projectEditStatusHelp,
    projectReadOnlyNotice, projectEditMessage, projectEditSave, editProjectButton, projectGithubRepository,
    projectEditGithubRepository, githubProjectSelectionStatus, githubProjectEditStatus,
    connectGithubCreateButton, connectGithubEditButton, projectsNavButton, projectsView, projectView,
    projectForm, projectList, emptyProjects, projectFormPanel, projectDescription, projectState,
    projectChatColumn, projectSidebarList, projectSidebarEmpty, projectMain, projectTabs,
    projectKeyboardHints,
  },
  auth: {
    loginPanel, loginShell, accountBar, currentUserLabel, loginAdminHelp, loginKeyboardHints,
    credentialFlow, credentialFlowHeading, credentialFlowDescription, credentialFlowError, credentialForm,
    credentialPasswordFields, credentialPasswordLabel, credentialVerificationField,
    credentialVerificationInput, credentialConfirmationField, credentialSubmit, credentialCancel,
    loginForm, loginStatusMessage, logoutButton,
  },
  workspace: {
    workspacePanel, workspaceNav, workspaceSwitcher, workspaceSwitcherLabel, workspacePicker,
    workspacePickerCancel, workspacePickerConfirm, workspacePickerDescription, workspacePickerOptions,
    adminNavButton, adminView, adminHeading, workspaceAdminTabs, workspaceAdminMembersTab,
    workspaceAdminInvitesTab, workspaceAdminWorkspacesTab, workspaceAdminMembersPanel,
    workspaceAdminInvitesPanel, workspaceAdminWorkspacesPanel, workspaceMembersList, workspaceMembersEmpty,
    inviteForm, inviteRoleInput, inviteProjectSelection, inviteProjectOptions, workspaceInvitesList,
    workspaceInvitesEmpty, workspaceMemberDeactivationDialog, workspaceMemberDeactivationDescription,
    workspaceMemberDeactivationCancel, workspaceMemberDeactivationConfirm, workspaceMemberRoleDialog,
    workspaceMemberRoleHeading, workspaceMemberRoleDescription, workspaceMemberRoleCancel,
    workspaceMemberRoleConfirm, workspaceGuestProjectsDialog, workspaceGuestProjectsDescription,
    workspaceGuestProjectOptions, workspaceGuestProjectsEmpty, workspaceGuestProjectsStatus,
    workspaceGuestProjectsCancel, workspaceGuestProjectsSave, membersView, adminGoPrefixOption,
    workspaceSwitchHint, membersTabButton, memberList, memberForm, memberAddControls, memberAddStatus,
    memberSelect, memberRemovalConfirmation, memberRemovalDescription, memberRemovalCancel,
    memberRemovalConfirm,
  },
  shell: {
    createWorkspaceForm, breadcrumbProjectsButton, breadcrumbDivider, breadcrumbCurrent,
    cancelProjectFormButton, linkPullRequestButton, notesTabButton, emptyIssues, addMemberButton,
    statusMessage,
  },
  roadmap: {
    roadmapNavButton, roadmapView, roadmapHeading, roadmapSummary, roadmapMilestoneList, roadmapEmptyState,
    roadmapGoPrefixOption,
  },
  inbox: {
    inboxNavButton, inboxView, inboxHeading, myWorkTabsElement, myWorkInboxTab, myWorkTasksTab,
    myWorkInboxPanel, myWorkTasksPanel, myWorkTasksSummary, myWorkTaskGroups, myWorkTasksEmptyState,
    inboxSummary, inboxIssueList, inboxEmptyState, inboxTabsElement, inboxMarkAllReadButton,
    inboxLoadMoreButton,
  },
  lounge: {
    loungeNavButton, loungeView, loungeHeading, loungeMessageList,
    loungeEmptyState, loungeForm, loungeInput, loungeMentionList, loungeReplyHint, loungeCancelReply,
  },
  shortcuts: {
    toggleProjectFormButton, keyboardHints, goPrefixHint, goPrefixWorkspaceOption, goPrefixProjectOptions,
    commandPalette, commandPaletteClose, commandSearch, commandResults, shortcutHelp, shortcutHelpClose,
  },
  chat: {
    chatView,
  },
  issues: {
    issuesView, issueDetailView, issueDetailDisplay, issueDetailTitle, issueDetailPriority,
    issueDetailDueDate, issueDetailDescription, issueDetailBrief, issueDetailContextSection,
    issueDetailContext, issueDetailExpectedOutcomeSection, issueDetailExpectedOutcome,
    issueDetailAcceptanceCriteriaSection, issueDetailAcceptanceCriteria, issueDetailStatus,
    issueDetailStatusLabel, issueSourceLink, issuePullRequests, issuePullRequestsList,
    issuePullRequestsEmpty, issuePullRequestDialog, issuePullRequestForm, issuePullRequestClose,
    issuePullRequestCancel, issuePullRequestUrl, issuePullRequestMessage, issuePullRequestSubmit,
    issueDetailEditForm, issueDetailTitleInput, issueDetailDescriptionInput, issueDetailPriorityInput,
    issueDetailDueDateInput, issueDetailEditButton, issueAiPromptButton, issueAiPromptDialog,
    issueAiPromptCloseButton, issueAiPromptStepCount, issueAiPromptContext, issueAiPromptOutcome,
    issueAiPromptCriteria, issueAiPromptPreview, issueAiPromptStatus, issueAiPromptBackButton,
    issueAiPromptSkipButton, issueAiPromptNextButton, issueAiPromptActions, issueAiPromptSaveButton,
    issueAiPromptCopyButton, issueAiPromptCopyMarkdownButton, issueAiPromptDownloadButton,
    issueDetailDeleteButton, issueDetailSaveButton, issuesTabButton, issueBackButton,
    issueDetailCancelButton, issueForm, issueQuickAddTitle, issueQuickAddPriority, issueQuickAddDueDate,
    issueQuickAddAssignee, issueQuickAddMilestone, issueQuickAddOngoing, issueQuickAddShared,
    issueQuickAddApproval, issueQuickAddCancelButton, issueDetailType, issueDetailAssignee,
    issueDetailMilestone, issueDetailOngoingRow, issueDetailSharing, issueDetailApproval,
    issueDetailTypeInput, issueDetailAssigneeInput, issueDetailMilestoneInput, issueDetailOngoingInput,
    issueDetailSharedInput, issueDetailApprovalInput, issueStatusHistory, issueStatusHistoryCount,
    issueStatusHistoryEmpty, issueStatusHistoryList, issueDiscussionHeading, issueDiscussionCount,
    issueDiscussionStatus, issueDiscussionEmpty, issueDiscussionList, issueDiscussionForm,
    issueDiscussionInput, issueDiscussionSubmit, issueDiscussionReplyContext, issueDiscussionReplyLabel,
    issueDiscussionReplyCancel, issueDescriptionDetails, issueProgress, issueProgressLabel, issueFilter,
    issueGrouping, issueOrder, issueScope, issueCountSummary, issueBulkAssignToggle,
    issueBulkAssignToolbar, issueList, deletedIssuesDetails, deletedIssueCount, deletedIssueList,
    issueStatusPicker, issueStatusPickerClose, issueStatusPickerDescription, issueStatusPickerOptions,
    issueDeleteConfirmation, issueDeleteDescription, issueDeleteError, issueDeleteCancel,
    issueDeleteConfirm,
  },
  guest: {
    guestWorkspaceSwitcher, guestWorkspaceSwitcherLabel, guestLogoutButton,
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

interface PaletteCommand {
  label: string;
  detail: string;
  shortcut: string;
  run: () => void;
}

const themeUi = initThemeUi();





































































































































const projectSidebarSection = projectSidebarList.closest<HTMLElement>('.sidebar-projects')!;
const projectSidebarMore = createScrollMoreIndicator();
projectSidebarList.after(projectSidebarMore);









































const issueAiPromptSteps = [
  document.querySelector<HTMLElement>('#issue-ai-prompt-step-context')!,
  document.querySelector<HTMLElement>('#issue-ai-prompt-step-outcome')!,
  document.querySelector<HTMLElement>('#issue-ai-prompt-step-criteria')!,
  document.querySelector<HTMLElement>('#issue-ai-prompt-step-preview')!,
];

















































































const issueBulkAssignCount = issueBulkAssignToolbar.querySelector<HTMLElement>('.issue-bulk-assign-count')!;
const issueBulkAssignSelectVisible = issueBulkAssignToolbar.querySelector<HTMLButtonElement>('.issue-bulk-assign-select-visible')!;
const issueBulkAssignTarget = issueBulkAssignToolbar.querySelector<HTMLSelectElement>('.issue-bulk-assign-target')!;
const issueBulkAssignApply = issueBulkAssignToolbar.querySelector<HTMLButtonElement>('.issue-bulk-assign-apply')!;
const issueBulkShareApply = issueBulkAssignToolbar.querySelector<HTMLButtonElement>('.issue-bulk-share-apply')!;
const issueBulkUnshareApply = issueBulkAssignToolbar.querySelector<HTMLButtonElement>('.issue-bulk-unshare-apply')!;
const issueBulkAssignCancel = issueBulkAssignToolbar.querySelector<HTMLButtonElement>('.issue-bulk-assign-cancel')!;




























let activeUser: User | null = null;
let keyboardHintsVisible = loadKeyboardHintsPreference();
let credentialFragment: CredentialFragment | null = null;
let invitePreview: InvitePreview | null = null;
let adminProjects: Project[] = [];
type WorkspaceAdminTab = 'members' | 'invites' | 'workspaces';
let workspaceAdminTab: WorkspaceAdminTab = 'members';
let workspaceMemberDeactivationTarget: { member: WorkspaceMember; button: HTMLButtonElement } | null = null;
let workspaceMemberRoleChangeTarget: {
  member: WorkspaceMember;
  role: Role;
  select: HTMLSelectElement;
  button: HTMLButtonElement;
} | null = null;
let workspaceGuestProjectsTarget: { member: WorkspaceMember; button: HTMLButtonElement } | null = null;
let activeWorkspaces: Workspace[] = [];
let activeProject: Project | null = null;
let projectReturnFocusId: number | null = null;
let pendingWorkspaceId: number | null = null;
let workspacePickerOptionIndex = 0;
const workspaceViewHistory: WorkspaceLocation[] = [];
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
let activeProjectMembers: Member[] = [];
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
let inboxIssues: InboxIssue[] = [];
let inboxEvents: InboxEvent[] = [];
let inboxEventCounts = { unread: 0, mentions: 0 };
let inboxEventsHasMore = false;
let inboxEventsNextCursor: number | null = null;
let inboxMorePageLoading = false;
let myWorkTab: MyWorkTab = 'inbox';
let inboxTab: InboxTab = 'unread';
let inboxIssuesEtag: string | null = null;
let inboxEventsEtag: string | null = null;
let inboxPollTimer: number | null = null;
let inboxPollDelay = 1000;
let inboxPollInFlight = false;
let inboxPollRequestVersion = 0;
let inboxPollHasDeferredChanges = false;
let inboxMutationPending = 0;
const inboxEventRowRenderSignatures = new WeakMap<HTMLLIElement, string>();






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
    && !commandPalette.open && !shortcutHelp.open && !workspacePicker.open,
});
let linkedPullRequests: LinkedPullRequest[] = [];
let issuePullRequestsRequestVersion = 0;
let githubRepositories: GitHubRepository[] = [];
let issueAiPromptStepIndex = 0;
let issueAiPromptReturnFocus: HTMLElement | null = null;
let activeChatProjectId: number | null = null;
let loungeActive = false;
let loungePollTimer: number | null = null;
let loungeCursor = 0;
let loungeEtag: string | null = null;
let loungePollDelay = 1000;
let loungeFollowLatest = true;
let loungeMembers: LoungeMentionMember[] = [];
const loungeMessagesById = new Map<number, ChatMessage>();
let loungeReplyParent: { id: number; name: string; body: string } | null = null;
let loungeMentionQuery: MentionQuery | null = null;
let loungeMentionMatches: LoungeMentionMember[] = [];
let loungeMentionSelectedIndex = 0;
let loungeMentionDismissed = false;
let issuePollTimer: number | null = null;
let issuePollDelay = 1000;
let activeIssuesEtag: string | null = null;
let deletedIssuesEtag: string | null = null;
let deletedIssuesLoadProjectId: number | null = null;
let deletedIssuesLoadPromise: Promise<void> | null = null;
let issuePollHasDeferredChanges = false;
let issuePollInFlightProjectId: number | null = null;
let issuePollRequestVersion = 0;
let issueStatusHistoryRequestVersion = 0;
let issueDiscussionRequestVersion = 0;
let issueDiscussionPollTimer: number | null = null;
let issueDiscussionMessages: IssueDiscussionMessage[] = [];
let selectedIssueDiscussionMessageId: number | null = null;
let issueDiscussionParent: IssueDiscussionMessage | null = null;
let editingIssueDiscussionMessageId: number | null = null;
let confirmingIssueDiscussionDeleteId: number | null = null;
const issueRowRenderSignatures = new WeakMap<HTMLLIElement, string>();
const deletedIssueRowRenderSignatures = new WeakMap<HTMLLIElement, string>();
let chatPollTimer: number | null = null;
const chatEventFeed = new ChatEventFeed();
let chatEtag: string | null = null;
let chatPollDelay = 1000;
const PROJECT_PRESENCE_INTERVAL_MS = 15_000;
let projectPresenceTimer: number | null = null;
let projectPresenceRequestVersion = 0;
let chatPresenceIndicator: HTMLSpanElement | null = null;
let chatFollowLatest = true;
let chatMessageList: HTMLElement | null = null;
let chatEmptyState: HTMLElement | null = null;
let chatInput: HTMLTextAreaElement | null = null;
let chatMentionList: HTMLDivElement | null = null;
let chatMentionQuery: MentionQuery | null = null;
let chatMentionMatches: Member[] = [];
let chatMentionSelectedIndex = 0;
let chatMentionDismissed = false;
let selectedChatMessageId: number | null = null;
const chatMessagesById = new Map<number, ChatMessage>();
let chatReplyHint: HTMLElement | null = null;
let chatCancelReply: HTMLButtonElement | null = null;
let chatReplyParent: { id: number; name: string; body: string } | null = null;
let issueQuickAddEscapePending = false;
let issueQuickAddReturnFocus: HTMLElement | null = null;
let issueQuickAddSourceMessageId: number | null = null;
let issueQuickAddSourceProjectId: number | null = null;
let goPrefixPending = false;
let goPrefixTimer: number | null = null;
let statusMessageTimer: number | null = null;
let issueStatusPickerIssue: Issue | null = null;
let issueStatusPickerReturnFocus: HTMLElement | null = null;
let issueStatusPickerOptionIndex = 0;
let issueDeleteTarget: Issue | null = null;
let memberRemovalTarget: { member: Member; button: HTMLButtonElement } | null = null;
let paletteCommands: PaletteCommand[] = [];
let visiblePaletteCommands: PaletteCommand[] = [];
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
  resetAuthForms();
  workspaceViewHistory.length = 0;
  projectReturnFocusId = null;
  issueQuickAddSourceMessageId = null;
  issueQuickAddSourceProjectId = null;
  issueQuickAddReturnFocus = null;
  stopIssuePolling();
  clearIssueDiscussion();
  stopInboxPolling();
  resetPendingWorkspaceSwitch();
  stopChatPolling();
  stopLoungePolling();
  loungePresenceUi.reset();
  if (clientSummaryUi.dialog.open) clientSummaryUi.close();
  activeUser = null;
  githubRepositories = [];
  projectGithubRepository.replaceChildren(new Option('No repository connected', ''));
  projectEditGithubRepository.replaceChildren(new Option('No repository connected', ''));
  githubProjectSelectionStatus.textContent = '';
  githubProjectEditStatus.textContent = '';
  connectGithubCreateButton.hidden = true;
  connectGithubEditButton.hidden = true;
  editProjectButton.hidden = true;
  if (projectEditDialog.open) projectEditDialog.close();
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
  myWorkTab = 'inbox';
  inboxTab = 'unread';
  inboxIssues = [];
  inboxEvents = [];
  inboxEventCounts = { unread: 0, mentions: 0 };
  inboxEventsHasMore = false;
  inboxEventsNextCursor = null;
  inboxIssueList.replaceChildren();
  myWorkTaskGroups.replaceChildren();
  inboxEmptyState.hidden = false;
  inboxEmptyState.textContent = 'Nothing here.';
  myWorkTasksEmptyState.hidden = false;
  myWorkTasksEmptyState.textContent = 'You have no open issues assigned to you.';
  renderMyWorkTabs();
  projectList.replaceChildren();
  projectSidebarList.replaceChildren();
  issueList.replaceChildren();
  chatView.replaceChildren();
  report('');
}

function showSignedIn(user: User): void {
  invalidateProjectNavigation(true);
  workspaceViewHistory.length = 0;
  projectReturnFocusId = null;
  activeProject = null;
  stopLoungePolling();
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
  if (user.role === 'admin') void loadGithubRepositories();
  report('');
}

async function loadWorkspaces(): Promise<void> {
  resetPendingWorkspaceSwitch();
  const result = await api<{ workspaces: Workspace[] }>('/workspaces');
  activeWorkspaces = result.workspaces;
  renderWorkspaceSwitcher();
}

async function switchWorkspace(workspaceId: number, restoreSwitcherFocus = false): Promise<void> {
  resetPendingWorkspaceSwitch();
  if (activeUser === null || workspaceId === activeUser.workspace_id) return;
  workspaceSwitcher.disabled = true;
  guestWorkspaceSwitcher.disabled = true;
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
      loadProjects,
    );
    if (result === null) return;
    report(`Switched to ${result.workspace.name}.`);
  } catch (error) {
    renderWorkspaceSwitcher();
    report(error instanceof Error ? error.message : 'Could not switch workspace.', true);
  } finally {
    renderWorkspaceSwitcher();
    const switcher = activeUser?.role === 'guest' ? guestWorkspaceSwitcher : workspaceSwitcher;
    if (restoreSwitcherFocus && !switcher.disabled) switcher.focus();
  }
}

function renderWorkspaceSwitcher(): void {
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

function resetPendingWorkspaceSwitch(): void {
  pendingWorkspaceId = null;
  if (workspacePicker.open) workspacePicker.close();
}

function updateWorkspacePickerSelection(index: number): void {
  const workspace = activeWorkspaces[index];
  if (workspace === undefined) return;
  workspacePickerOptionIndex = index;
  pendingWorkspaceId = workspace.id;
  const currentName = activeWorkspaces.find((candidate) => candidate.id === activeUser?.workspace_id)?.name ?? 'Current workspace';
  workspacePickerDescription.textContent = `Current: ${currentName}. Proposed: ${workspace.name}.`;
  workspacePickerConfirm.disabled = workspace.id === activeUser?.workspace_id;
  workspacePickerConfirm.textContent = workspacePickerConfirm.disabled ? 'Already in this workspace' : `Switch to ${workspace.name}`;
  const options = Array.from(workspacePickerOptions.querySelectorAll<HTMLButtonElement>('.workspace-picker-option'));
  options.forEach((option, optionIndex) => {
    const active = optionIndex === index;
    option.classList.toggle('is-active', active);
    option.setAttribute('aria-selected', String(active));
    option.tabIndex = active ? 0 : -1;
  });
  options[index]?.focus();
}

function stageWorkspaceSwitch(workspaceId: number): void {
  const index = activeWorkspaces.findIndex((workspace) => workspace.id === workspaceId);
  if (index >= 0) updateWorkspacePickerSelection(index);
}

function openWorkspacePicker(proposedWorkspaceId?: number): void {
  if (activeUser === null || activeWorkspaces.length < 2) return;
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
    if (workspace.id === currentWorkspaceId) workspacePickerOptionIndex = index;
  });
  const proposedIndex = activeWorkspaces.findIndex((workspace) => workspace.id === proposedWorkspaceId);
  if (proposedIndex >= 0) workspacePickerOptionIndex = proposedIndex;
  workspacePicker.showModal();
  updateWorkspacePickerSelection(workspacePickerOptionIndex);
}

function commitPendingWorkspaceSwitch(): void {
  const workspaceId = pendingWorkspaceId;
  pendingWorkspaceId = null;
  if (workspacePicker.open) workspacePicker.close();
  if (workspaceId === null || activeUser === null || workspaceId === activeUser.workspace_id) return;
  void switchWorkspace(workspaceId, true);
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
    stopInboxPolling();
    inboxIssues = [];
    inboxEvents = [];
    inboxEventCounts = { unread: 0, mentions: 0 };
    inboxEventsHasMore = false;
    inboxEventsNextCursor = null;
  }
  if (view !== 'lounge') stopLoungePolling();
  if (view !== 'project') {
    if (activeProject !== null) projectReturnFocusId = activeProject.id;
    stopChatPolling();
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
  if (currentLocation.view !== 'admin') workspaceViewHistory.push(currentLocation);
  showWorkspaceView('admin');
  switchWorkspaceAdminTab(workspaceAdminTab);
  adminHeading.focus();
  void loadWorkspaceAdmin();
}

function switchWorkspaceAdminTab(tab: WorkspaceAdminTab): void {
  workspaceAdminTab = tab;
  const states: Array<[WorkspaceAdminTab, HTMLButtonElement, HTMLElement]> = [
    ['members', workspaceAdminMembersTab, workspaceAdminMembersPanel],
    ['invites', workspaceAdminInvitesTab, workspaceAdminInvitesPanel],
    ['workspaces', workspaceAdminWorkspacesTab, workspaceAdminWorkspacesPanel],
  ];
  for (const [name, button, panel] of states) {
    const selected = name === tab;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    button.classList.toggle('is-active', selected);
    panel.hidden = !selected;
  }
  updateWorkspaceAdminPanelTabIndex();
}

function updateWorkspaceAdminPanelTabIndex(): void {
  const panel = [workspaceAdminMembersPanel, workspaceAdminInvitesPanel, workspaceAdminWorkspacesPanel]
    .find((candidate) => !candidate.hidden);
  if (panel === undefined) return;
  const hasFocusableContent = Array.from(panel.querySelectorAll<HTMLElement>(
    'a[href], button, input, select, textarea, [tabindex]',
  )).some((element) => element.tabIndex >= 0 && !element.matches(':disabled') && element.closest('[hidden]') === null);
  panel.tabIndex = hasFocusableContent ? -1 : 0;
}

async function loadWorkspaceAdmin(): Promise<void> {
  if (activeUser?.role !== 'admin') return;
  try {
    const [members, invites, projects] = await Promise.all([
      api<{ users: WorkspaceMember[] }>('/users'),
      api<{ invites: WorkspaceInvite[] }>('/users/invites'),
      api<{ projects: Project[] }>('/projects'),
    ]);
    if (adminView.hidden) return;
    adminProjects = projects.projects.filter((project) => project.status === 'active' || project.status === 'paused');
    renderWorkspaceMembers(members.users);
    renderWorkspaceInvites(invites.invites);
    renderInviteProjectOptions();
    updateWorkspaceAdminPanelTabIndex();
  } catch (error) {
    report(error instanceof Error ? error.message : 'Could not load workspace administration.', true);
  }
}

function renderWorkspaceMembers(members: readonly WorkspaceMember[]): void {
  workspaceMembersList.replaceChildren();
  workspaceMembersEmpty.hidden = members.length > 0;
  const activeAdminCount = members.filter((member) => member.role === 'admin' && member.is_active).length;
  for (const member of members) {
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.className = 'workspace-admin-member-identity';
    label.textContent = `${member.name} · ${member.email}${member.is_active ? '' : ' · inactive'}`;
    const roleControl = document.createElement('div');
    roleControl.className = 'workspace-admin-role-control';
    const roleSelect = document.createElement('select');
    roleSelect.setAttribute('aria-label', `Workspace role for ${member.name}`);
    roleSelect.dataset.memberId = String(member.id);
    roleSelect.dataset.memberAction = 'role';
    for (const role of ['admin', 'developer', 'guest'] as const) {
      const option = document.createElement('option');
      option.value = role;
      option.textContent = role[0]!.toUpperCase() + role.slice(1);
      roleSelect.append(option);
    }
    roleSelect.value = member.role;
    const roleSaveButton = document.createElement('button');
    roleSaveButton.type = 'button';
    roleSaveButton.className = 'button button-quiet';
    roleSaveButton.textContent = 'Save role';
    roleSaveButton.dataset.memberId = String(member.id);
    roleSaveButton.dataset.memberAction = 'save-role';
    const isSelf = member.id === activeUser?.id;
    const isLastActiveAdmin = member.is_active && member.role === 'admin' && activeAdminCount <= 1;
    roleSelect.disabled = isSelf || isLastActiveAdmin;
    if (isSelf) roleSelect.title = 'Ask another workspace admin to change your role.';
    else if (isLastActiveAdmin) roleSelect.title = 'At least one active workspace admin must remain.';
    const updateRoleSaveButton = (): void => {
      roleSaveButton.disabled = roleSelect.disabled || roleSelect.value === member.role;
    };
    roleSelect.addEventListener('change', updateRoleSaveButton);
    updateRoleSaveButton();
    roleSaveButton.addEventListener('click', () => {
      if (roleSaveButton.disabled) return;
      const role = roleSelect.value as Role;
      if (role !== member.role && (role === 'admin' || member.role === 'admin')) {
        openWorkspaceMemberRoleConfirmation(member, role, roleSelect, roleSaveButton);
      } else {
        void setWorkspaceMemberRole(member, role, roleSelect);
      }
    });
    roleControl.append(roleSelect, roleSaveButton);
    item.classList.add('workspace-admin-member-row');
    const actions = document.createElement('div');
    actions.className = 'workspace-admin-member-actions';
    const resetLinkButton = document.createElement('button');
    resetLinkButton.type = 'button';
    resetLinkButton.className = 'button button-quiet';
    resetLinkButton.textContent = 'Send recovery email';
    resetLinkButton.setAttribute('aria-label', `Send password recovery email to ${member.name}`);
    resetLinkButton.disabled = !member.is_active;
    resetLinkButton.addEventListener('click', () => void sendMemberPasswordRecoveryEmail(member));
    if (member.role === 'guest') {
      const manageProjectsButton = document.createElement('button');
      manageProjectsButton.type = 'button';
      manageProjectsButton.className = 'button button-quiet';
      manageProjectsButton.textContent = 'Manage projects';
      manageProjectsButton.dataset.memberId = String(member.id);
      manageProjectsButton.dataset.memberAction = 'projects';
      manageProjectsButton.setAttribute('aria-label', `Manage project access for ${member.name}`);
      manageProjectsButton.addEventListener('click', () => void openWorkspaceGuestProjectAccess(member, manageProjectsButton));
      actions.append(manageProjectsButton);
    }
    const statusButton = document.createElement('button');
    statusButton.type = 'button';
    statusButton.className = member.is_active ? 'button button-quiet button-danger' : 'button button-quiet';
    statusButton.textContent = member.is_active ? 'Deactivate' : 'Reactivate';
    statusButton.dataset.memberId = String(member.id);
    statusButton.dataset.memberAction = 'status';
    statusButton.setAttribute('aria-label', `${member.is_active ? 'Deactivate' : 'Reactivate'} ${member.name} in this workspace`);
    const isLastAdmin = member.is_active && member.role === 'admin' && activeAdminCount <= 1;
    statusButton.disabled = member.is_active && (isSelf || isLastAdmin);
    if (isSelf) statusButton.title = 'Ask another workspace admin to deactivate your membership.';
    else if (isLastAdmin) statusButton.title = 'At least one active workspace admin must remain.';
    statusButton.addEventListener('click', () => {
      if (member.is_active) openWorkspaceMemberDeactivationConfirmation(member, statusButton);
      else void setWorkspaceMemberActive(member, true);
    });
    actions.append(resetLinkButton, statusButton);
    const memberTools = document.createElement('div');
    memberTools.className = 'workspace-admin-member-tools';
    memberTools.append(roleControl, actions);
    item.append(label, memberTools);
    workspaceMembersList.append(item);
  }
}

function openWorkspaceMemberDeactivationConfirmation(member: WorkspaceMember, button: HTMLButtonElement): void {
  workspaceMemberDeactivationTarget = { member, button };
  workspaceMemberDeactivationDescription.textContent = `${member.name} will lose access to this workspace and its projects. Existing browser sessions and API tokens for this workspace will be revoked.`;
  workspaceMemberDeactivationDialog.showModal();
  workspaceMemberDeactivationCancel.focus();
}

function closeWorkspaceMemberDeactivationConfirmation(restoreFocus = true): void {
  if (workspaceMemberDeactivationDialog.open) workspaceMemberDeactivationDialog.close();
  const target = workspaceMemberDeactivationTarget;
  workspaceMemberDeactivationTarget = null;
  workspaceMemberDeactivationConfirm.disabled = false;
  if (restoreFocus && !adminView.hidden && target?.button.isConnected && !target.button.disabled) target.button.focus();
}

async function setWorkspaceMemberActive(member: WorkspaceMember, isActive: boolean): Promise<void> {
  try {
    await api<{ user: WorkspaceMember }>(`/users/${member.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: isActive }),
    });
    report(isActive ? `${member.name} reactivated in this workspace.` : `${member.name} deactivated from this workspace.`);
    await loadWorkspaceAdmin();
    workspaceMembersList.querySelector<HTMLButtonElement>(`button[data-member-id="${member.id}"][data-member-action="status"]`)?.focus();
  } catch (error) {
    report(error instanceof Error ? error.message : `Could not ${isActive ? 'reactivate' : 'deactivate'} the workspace member.`, true);
    if (!adminView.hidden) workspaceMembersList.querySelector<HTMLButtonElement>(`button[data-member-id="${member.id}"][data-member-action="status"]`)?.focus();
  }
}

function openWorkspaceMemberRoleConfirmation(
  member: WorkspaceMember,
  role: Role,
  select: HTMLSelectElement,
  button: HTMLButtonElement,
): void {
  workspaceMemberRoleChangeTarget = { member, role, select, button };
  const roleLabel = role[0]!.toUpperCase() + role.slice(1);
  if (role === 'admin') {
    workspaceMemberRoleHeading.textContent = 'Grant admin access?';
    workspaceMemberRoleDescription.textContent = `${member.name} will gain workspace-wide administration access.`;
    workspaceMemberRoleConfirm.textContent = 'Grant admin access';
  } else {
    workspaceMemberRoleHeading.textContent = 'Remove admin access?';
    workspaceMemberRoleDescription.textContent = `${member.name} will lose workspace administration access and become a ${roleLabel}.`;
    workspaceMemberRoleConfirm.textContent = 'Change role';
  }
  workspaceMemberRoleDialog.showModal();
  workspaceMemberRoleCancel.focus();
}

function closeWorkspaceMemberRoleConfirmation(restoreFocus = true): void {
  if (workspaceMemberRoleDialog.open) workspaceMemberRoleDialog.close();
  const target = workspaceMemberRoleChangeTarget;
  workspaceMemberRoleChangeTarget = null;
  workspaceMemberRoleConfirm.disabled = false;
  if (restoreFocus && !adminView.hidden && target?.button.isConnected) target.button.focus();
}

async function setWorkspaceMemberRole(member: WorkspaceMember, role: Role, select: HTMLSelectElement): Promise<void> {
  try {
    await api<{ user: WorkspaceMember }>(`/users/${member.id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
    report(`${member.name}'s role changed to ${role}. They may need to reload to see their updated controls.`);
    await loadWorkspaceAdmin();
    workspaceMembersList.querySelector<HTMLSelectElement>(`select[data-member-id="${member.id}"][data-member-action="role"]`)?.focus();
  } catch (error) {
    report(error instanceof Error ? error.message : `Could not change ${member.name}'s role.`, true);
    if (!adminView.hidden && select.isConnected) select.focus();
  }
}

async function openWorkspaceGuestProjectAccess(member: WorkspaceMember, button: HTMLButtonElement): Promise<void> {
  workspaceGuestProjectsTarget = { member, button };
  workspaceGuestProjectsDescription.textContent = `Choose active or paused projects ${member.name} can access. Existing access to completed or archived projects can be removed.`;
  workspaceGuestProjectOptions.replaceChildren();
  workspaceGuestProjectsEmpty.hidden = true;
  workspaceGuestProjectsStatus.textContent = 'Loading project access…';
  workspaceGuestProjectsSave.disabled = true;
  workspaceGuestProjectsDialog.showModal();
  workspaceGuestProjectsCancel.focus();
  try {
    const result = await api<{
      project_ids: number[];
      projects: Array<Pick<Project, 'id' | 'name' | 'status'>>;
    }>(`/users/${member.id}/projects`);
    if (!workspaceGuestProjectsDialog.open || workspaceGuestProjectsTarget?.member.id !== member.id) return;
    workspaceGuestProjectOptions.replaceChildren();
    workspaceGuestProjectsStatus.textContent = '';
    workspaceGuestProjectsEmpty.hidden = result.projects.length > 0;
    if (result.projects.length === 0) {
      workspaceGuestProjectsEmpty.textContent = 'There are no active or paused projects. This guest will have no project access.';
    }
    for (const project of result.projects) {
      const label = document.createElement('label');
      label.className = 'admin-project-option';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.name = 'guest_project_ids';
      checkbox.value = String(project.id);
      checkbox.checked = result.project_ids.includes(project.id);
      const readOnly = project.status === 'completed' || project.status === 'archived';
      const description = readOnly ? `${project.name} (${project.status}; remove access only)` : project.name;
      label.append(checkbox, document.createTextNode(description));
      workspaceGuestProjectOptions.append(label);
    }
    const firstProjectCheckbox = workspaceGuestProjectOptions.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (firstProjectCheckbox !== null && document.activeElement === workspaceGuestProjectsCancel) {
      firstProjectCheckbox.focus();
    }
    workspaceGuestProjectsSave.disabled = false;
  } catch (error) {
    if (!workspaceGuestProjectsDialog.open || workspaceGuestProjectsTarget?.member.id !== member.id) return;
    report(error instanceof Error ? error.message : `Could not load ${member.name}'s project access.`, true);
    closeWorkspaceGuestProjectAccess();
  }
}

function closeWorkspaceGuestProjectAccess(restoreFocus = true): void {
  if (workspaceGuestProjectsDialog.open) workspaceGuestProjectsDialog.close();
  const target = workspaceGuestProjectsTarget;
  workspaceGuestProjectsTarget = null;
  workspaceGuestProjectsSave.disabled = false;
  if (restoreFocus && !adminView.hidden && target?.button.isConnected) target.button.focus();
}

async function saveWorkspaceGuestProjectAccess(): Promise<void> {
  const target = workspaceGuestProjectsTarget;
  if (target === null) return;
  const projectIds = Array.from(workspaceGuestProjectOptions.querySelectorAll<HTMLInputElement>(
    'input[name="guest_project_ids"]:checked',
  )).map((checkbox) => Number(checkbox.value));
  workspaceGuestProjectsSave.disabled = true;
  workspaceGuestProjectsStatus.textContent = 'Saving project access…';
  try {
    await api<{ project_ids: number[] }>(`/users/${target.member.id}/projects`, {
      method: 'PUT',
      body: JSON.stringify({ project_ids: projectIds }),
    });
    closeWorkspaceGuestProjectAccess(false);
    report(`${target.member.name}'s project access updated.`);
    if (!adminView.hidden && target.button.isConnected) target.button.focus();
  } catch (error) {
    report(error instanceof Error ? error.message : `Could not update ${target.member.name}'s project access.`, true);
    workspaceGuestProjectsStatus.textContent = 'The project access could not be saved. Review the selection and try again.';
    workspaceGuestProjectsSave.disabled = false;
    workspaceGuestProjectsSave.focus();
  }
}

function renderWorkspaceInvites(invites: readonly WorkspaceInvite[]): void {
  workspaceInvitesList.replaceChildren();
  workspaceInvitesEmpty.hidden = invites.length > 0;
  for (const invite of invites) {
    const item = document.createElement('li');
    item.className = 'workspace-invite-row';
    const details = document.createElement('span');
    details.className = 'workspace-invite-details';
    details.textContent = `${invite.name} · ${invite.email} · ${invite.role} · Expires ${new Date(`${invite.expires_at}Z`).toLocaleDateString()}`;
    const actions = document.createElement('div');
    actions.className = 'workspace-invite-actions';
    const resend = document.createElement('button');
    resend.type = 'button';
    resend.className = 'button button-quiet';
    resend.textContent = 'Resend invite';
    resend.dataset.inviteId = String(invite.id);
    resend.dataset.inviteAction = 'resend';
    resend.addEventListener('click', () => void resendWorkspaceInvite(invite.id));
    const revoke = document.createElement('button');
    revoke.type = 'button';
    revoke.className = 'button button-quiet button-danger';
    revoke.textContent = 'Revoke';
    revoke.dataset.inviteId = String(invite.id);
    revoke.dataset.inviteAction = 'revoke';
    revoke.addEventListener('click', () => void revokeWorkspaceInvite(invite.id));
    actions.append(resend, revoke);
    item.append(details, actions);
    workspaceInvitesList.append(item);
  }
}

function renderInviteProjectOptions(): void {
  inviteProjectOptions.replaceChildren();
  for (const project of adminProjects) {
    const label = document.createElement('label');
    label.className = 'admin-project-option';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'project_ids';
    checkbox.value = String(project.id);
    label.append(checkbox, document.createTextNode(project.name));
    inviteProjectOptions.append(label);
  }
  inviteProjectSelection.hidden = inviteRoleInput.value !== 'guest';
  if (adminProjects.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'panel-description';
    empty.textContent = 'Create a project before inviting a guest.';
    inviteProjectOptions.append(empty);
  }
}

async function sendMemberPasswordRecoveryEmail(member: WorkspaceMember): Promise<void> {
  try {
    await api<{ expires_at: string }>(`/users/${member.id}/password-reset`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    report(`Password recovery email sent to ${member.email}.`);
  } catch (error) {
    report(error instanceof Error ? error.message : 'Could not send the password recovery email.', true);
  }
}

async function resendWorkspaceInvite(inviteId: number): Promise<void> {
  try {
    const result = await api<{ invite: InviteDelivery }>(`/users/invites/${inviteId}/resend`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    report(`Invite resent to ${result.invite.email}. The previous link no longer works.`);
    await loadWorkspaceAdmin();
  } catch (error) {
    report(error instanceof Error ? error.message : 'Could not resend the invite.', true);
  }
}

async function revokeWorkspaceInvite(inviteId: number): Promise<void> {
  try {
    await api(`/users/invites/${inviteId}`, { method: 'DELETE' });
    report('Invite revoked.');
    await loadWorkspaceAdmin();
    const nextAction = workspaceInvitesList.querySelector<HTMLButtonElement>('.workspace-invite-actions button')
      ?? inviteForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    nextAction?.focus();
  } catch (error) {
    report(error instanceof Error ? error.message : 'Could not revoke the invite.', true);
  }
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

function sameWorkspaceLocation(left: WorkspaceLocation, right: WorkspaceLocation): boolean {
  if (left.view !== right.view) return false;
  if (left.view === 'project' && right.view === 'project') {
    return left.projectId === right.projectId && left.tab === right.tab;
  }
  if (left.view === 'projects' && right.view === 'projects') {
    return left.focusedProjectId === right.focusedProjectId;
  }
  if (left.view === 'lounge' && right.view === 'lounge') return true;
  return left.view === right.view;
}

function goToProjects(): void {
  workspaceViewHistory.length = 0;
  showWorkspaceView('projects');
}

function goToRoadmap(): void {
  if (activeUser === null || activeUser.role === 'guest') return;
  const currentLocation = currentWorkspaceLocation();
  if (currentLocation.view !== 'roadmap') workspaceViewHistory.push(currentLocation);
  showWorkspaceView('roadmap');
  roadmapHeading.focus();
  void loadRoadmap();
}

function goToInbox(): void {
  const currentLocation = currentWorkspaceLocation();
  if (currentLocation.view !== 'inbox') workspaceViewHistory.push(currentLocation);
  showWorkspaceView('inbox');
  inboxHeading.focus();
  void loadInboxIssues();
}

function goToLounge(): void {
  const currentLocation = currentWorkspaceLocation();
  if (currentLocation.view !== 'lounge') workspaceViewHistory.push(currentLocation);
  showWorkspaceView('lounge');
  loungeHeading.focus();
  loadLoungeChat();
}

function goBackWorkspaceView(): void {
  const currentLocation = currentWorkspaceLocation();
  if (currentLocation.view === 'projects') return;
  const previousLocation = workspaceViewHistory.pop();
  if (previousLocation?.view === 'project') {
    void loadProjectDetail(previousLocation.projectId, previousLocation.tab, false);
  } else if (previousLocation?.view === 'inbox') {
    showWorkspaceView('inbox');
    inboxHeading.focus();
    void loadInboxIssues();
  } else if (previousLocation?.view === 'roadmap') {
    showWorkspaceView('roadmap');
    roadmapHeading.focus();
    void loadRoadmap();
  } else if (previousLocation?.view === 'lounge') {
    showWorkspaceView('lounge');
    loungeHeading.focus();
    void loadLoungeChat();
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

function stopChatPolling(): void {
  stopProjectPresencePolling();
  activeChatProjectId = null;
  if (chatPollTimer !== null) window.clearTimeout(chatPollTimer);
  chatPollTimer = null;
  chatMessageList = null;
  chatEmptyState = null;
  chatInput = null;
  chatMentionList = null;
  chatMentionQuery = null;
  chatMentionMatches = [];
  chatMentionSelectedIndex = 0;
  chatMentionDismissed = false;
  chatReplyHint = null;
  chatCancelReply = null;
  chatReplyParent = null;
  selectedChatMessageId = null;
  chatFollowLatest = true;
  chatMessagesById.clear();
}

function stopLoungePolling(): void {
  loungeActive = false;
  selectedChatMessageId = null;
  if (loungePollTimer !== null) window.clearTimeout(loungePollTimer);
  loungePollTimer = null;
  loungePresenceUi.stopLoungePolling();
  loungeMembers = [];
  loungeMentionDismissed = false;
  clearLoungeReplyParent();
  loungeMessagesById.clear();
  hideLoungeMentionSuggestions();
  loungeMessageList.replaceChildren(loungeEmptyState);
  loungeEmptyState.hidden = false;
}

function updateLoungeMentionSuggestions(): void {
  if (loungeMentionDismissed) return;
  const query = findMentionQuery(loungeInput.value, loungeInput.selectionStart);
  if (query === null) {
    hideLoungeMentionSuggestions();
    return;
  }

  const matches = filterMentionMembers(loungeMembers, query.query, activeUser?.id ?? null);
  if (matches.length === 0) {
    loungeMentionQuery = query;
    loungeMentionMatches = [];
    loungeMentionSelectedIndex = 0;
    const empty = document.createElement('div');
    empty.className = 'chat-mention-empty';
    empty.setAttribute('role', 'option');
    empty.setAttribute('aria-disabled', 'true');
    empty.setAttribute('aria-selected', 'false');
    empty.textContent = mentionEmptyMessage(loungeMembers, query.query, activeUser?.id ?? null, 'workspace');
    loungeMentionList.replaceChildren(empty);
    loungeMentionList.hidden = false;
    loungeInput.setAttribute('aria-expanded', 'true');
    loungeInput.removeAttribute('aria-activedescendant');
    return;
  }

  loungeMentionQuery = query;
  loungeMentionMatches = matches;
  loungeMentionSelectedIndex = Math.min(loungeMentionSelectedIndex, matches.length - 1);
  loungeMentionList.replaceChildren(...matches.map((member, index) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.id = `lounge-mention-option-${index}`;
    option.className = 'chat-mention-option';
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String(index === loungeMentionSelectedIndex));
    const name = document.createElement('strong');
    name.textContent = member.name;
    const email = document.createElement('span');
    email.textContent = member.email;
    option.append(name, email);
    option.addEventListener('mousedown', (event) => event.preventDefault());
    option.addEventListener('click', () => selectLoungeMention(member));
    return option;
  }));
  loungeMentionList.hidden = false;
  loungeInput.setAttribute('aria-expanded', 'true');
  loungeInput.setAttribute('aria-activedescendant', `lounge-mention-option-${loungeMentionSelectedIndex}`);
}

function hideLoungeMentionSuggestions(): void {
  loungeMentionQuery = null;
  loungeMentionMatches = [];
  loungeMentionSelectedIndex = 0;
  loungeMentionList.hidden = true;
  loungeMentionList.replaceChildren();
  loungeInput.setAttribute('aria-expanded', 'false');
  loungeInput.removeAttribute('aria-activedescendant');
}

function selectLoungeMention(member: LoungeMentionMember): void {
  if (loungeMentionQuery === null) return;
  const insertion = replaceMentionQuery(loungeInput.value, loungeMentionQuery, member.name);
  loungeInput.value = insertion.value;
  loungeInput.setSelectionRange(insertion.cursor, insertion.cursor);
  loungeMentionDismissed = true;
  hideLoungeMentionSuggestions();
  loungeInput.focus();
}

function handleLoungeMentionKeydown(event: KeyboardEvent): boolean {
  return handleMentionKeydown(
    event,
    loungeInput,
    loungeMentionList,
    loungeMentionMatches,
    loungeMentionSelectedIndex,
    (index) => { loungeMentionSelectedIndex = index; },
    selectLoungeMention,
    () => {
      loungeMentionDismissed = true;
      hideLoungeMentionSuggestions();
    },
  );
}

function scheduleLoungePoll(delay = loungePollDelay): void {
  if (!loungeActive) return;
  if (loungePollTimer !== null) window.clearTimeout(loungePollTimer);
  loungePollTimer = window.setTimeout(() => {
    loungePollTimer = null;
    if (loungeActive) void pollLoungeChat();
  }, delay);
}

function appendLoungeMessage(message: ChatMessage, scrollToBottom = false): void {
  if (loungeMessageList.querySelector(`[data-message-id="${message.id}"]`) !== null) return;

  const item = document.createElement('article');
  item.className = message.parent_id === null ? 'chat-message' : 'chat-message chat-reply';
  item.dataset.messageId = String(message.id);
  item.tabIndex = -1;
  item.setAttribute('aria-keyshortcuts', 'j k ArrowUp ArrowDown Home End PageUp PageDown Enter r');
  item.addEventListener('focusin', () => selectChatMessage(message.id, false));
  item.addEventListener('click', (event) => {
    if (!(event.target instanceof HTMLElement) || event.target.closest('button') === null) {
      selectChatMessage(message.id);
    }
  });
  loungeMessagesById.set(message.id, message);
  if (message.parent_id !== null) {
    const parent = loungeMessagesById.get(message.parent_id);
    if (parent !== undefined) updateLoungeMessageReplyCount(parent);
  }

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
  time.textContent = formatChatTimestamp(message.created_at);
  authorDetails.append(author, time);
  const actions = document.createElement('div');
  actions.className = 'chat-message-actions';
  const reply = document.createElement('button');
  reply.className = 'button button-quiet chat-reply-button';
  reply.type = 'button';
  reply.textContent = 'Reply';
  reply.setAttribute('aria-label', `Reply to ${message.author_name}`);
  reply.addEventListener('click', () => setLoungeReplyParent(message));
  actions.append(reply);
  heading.append(avatar, authorDetails, actions);

  const body = document.createElement('p');
  body.className = 'chat-message-body';
  for (const segment of splitMentions(message.body, loungeMembers)) {
    if (segment.memberId === null) {
      body.append(document.createTextNode(segment.text));
    } else {
      const mention = document.createElement('mark');
      mention.className = 'chat-message-mention';
      mention.dataset.memberId = String(segment.memberId);
      mention.textContent = segment.text;
      body.append(mention);
    }
  }
  item.append(heading);
  if (message.parent_id !== null) {
    const parentAuthor = message.parent_author_name ?? loungeMessagesById.get(message.parent_id)?.author_name ?? null;
    const parentBody = message.parent_body ?? loungeMessagesById.get(message.parent_id)?.body ?? null;
    const parentExcerpt = parentBody === null ? '' : compactChatMessage(parentBody);
    const parentLabel = parentAuthor === null
      ? parentExcerpt || `Message #${message.parent_id}`
      : parentExcerpt === '' ? parentAuthor : `${parentAuthor}: ${parentExcerpt}`;
    const context = document.createElement('button');
    context.className = 'chat-reply-context';
    context.type = 'button';
    context.textContent = `↳ ${parentLabel}`;
    context.title = `Reply to ${parentLabel}`;
    context.setAttribute('aria-label', `Jump to message #${message.parent_id}: ${parentLabel}`);
    context.addEventListener('click', () => void focusLoungeMessageById(message.parent_id!));
    item.append(context);
  }
  item.append(body);
  loungeMessageList.append(item);
  updateLoungeMessageReplyCount(message);
  loungeEmptyState.hidden = true;
  if (scrollToBottom) loungeMessageList.scrollTop = loungeMessageList.scrollHeight;
}

function updateLoungeMessageReplyCount(message: ChatMessage): void {
  const item = loungeMessageList.querySelector<HTMLElement>(`.chat-message[data-message-id="${message.id}"]`);
  if (item === null) return;

  const replies = Array.from(loungeMessagesById.values()).filter((candidate) => candidate.parent_id === message.id);
  const replyCount = Math.max(message.reply_count ?? 0, replies.length);
  const loadedFirstReplyId = replies.reduce<number | null>((firstId, reply) =>
    firstId === null || reply.id < firstId ? reply.id : firstId, null);
  const firstReplyId = message.first_reply_id === null || message.first_reply_id === undefined
    ? loadedFirstReplyId
    : loadedFirstReplyId === null ? message.first_reply_id : Math.min(message.first_reply_id, loadedFirstReplyId);
  message.reply_count = replyCount;
  message.first_reply_id = firstReplyId;

  const existing = item.querySelector<HTMLButtonElement>('.chat-message-reply-count');
  if (replyCount === 0 || firstReplyId === null) {
    existing?.remove();
    return;
  }

  const button = existing ?? document.createElement('button');
  button.className = 'chat-message-reply-count';
  button.type = 'button';
  button.dataset.firstReplyId = String(firstReplyId);
  const label = `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`;
  button.textContent = label;
  button.title = `Show ${label} to ${message.author_name}'s message`;
  button.setAttribute('aria-label', `Jump to the first of ${label} to ${message.author_name}'s message`);
  if (existing === null) {
    button.addEventListener('click', () => {
      const firstReplyId = Number(button.dataset.firstReplyId);
      if (Number.isSafeInteger(firstReplyId)) void focusLoungeMessageById(firstReplyId);
    });
    item.append(button);
  }
}

function setLoungeReplyParent(message: ChatMessage): void {
  loungeReplyParent = { id: message.id, name: message.author_name, body: message.body };
  loungeReplyHint.textContent = `Replying to ${message.author_name}: ${compactChatMessage(message.body)}`;
  loungeReplyHint.hidden = false;
  loungeCancelReply.hidden = false;
  loungeInput.focus();
}

function clearLoungeReplyParent(): void {
  loungeReplyParent = null;
  loungeReplyHint.hidden = true;
  loungeReplyHint.textContent = '';
  loungeCancelReply.hidden = true;
}

async function focusLoungeMessageById(messageId: number): Promise<void> {
  if (!Number.isSafeInteger(messageId) || messageId < 1) return;
  let sourceMessage = loungeMessageList.querySelector<HTMLElement>(`.chat-message[data-message-id="${messageId}"]`);
  if (sourceMessage === null) {
    try {
      const result = await api<{ messages: ChatMessage[] }>(`/lounge/messages?since=${messageId - 1}`);
      if (!loungeActive || loungeView.hidden) return;
      for (const message of result.messages) appendLoungeMessage(message);
      sourceMessage = loungeMessageList.querySelector<HTMLElement>(`.chat-message[data-message-id="${messageId}"]`);
    } catch (error) {
      report(error instanceof Error ? error.message : 'Could not open the replied-to Lounge message.', true);
      return;
    }
  }
  if (sourceMessage === null) {
    report('The replied-to message is unavailable in the Lounge.', true);
    return;
  }
  loungeMessageList.querySelector('.is-chat-source')?.classList.remove('is-chat-source');
  sourceMessage.classList.add('is-chat-source');
  sourceMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
  sourceMessage.focus();
}

async function loadLoungeChat(): Promise<void> {
  stopLoungePolling();
  loungeActive = true;
  loungePresenceUi.resetLoungeStatus();
  loungePresenceUi.setLoungePresenceStatus('Checking who’s here…', 'checking');
  void loungePresenceUi.pollLoungePresence();
  loungeCursor = 0;
  loungeEtag = null;
  loungePollDelay = 1000;
  loungeFollowLatest = true;
  loungeMessageList.replaceChildren(loungeEmptyState);
  loungeEmptyState.hidden = false;

  try {
    const [result, membersResult] = await Promise.all([
      api<{ messages: ChatMessage[] }>('/lounge/messages'),
      api<{ members: LoungeMentionMember[] }>('/lounge/members'),
    ]);
    if (!loungeActive || loungeView.hidden) return;
    loungeMembers = membersResult.members;
    for (const message of result.messages) {
      loungeCursor = Math.max(loungeCursor, message.id);
      appendLoungeMessage(message);
    }
    loungeMessageList.scrollTop = loungeMessageList.scrollHeight;
    void pollLoungeChat();
  } catch (error) {
    if (!loungeActive) return;
    if (error instanceof ApiFailure && error.status === 401) {
      showSignedOut();
      return;
    }
    report(error instanceof Error ? error.message : 'Could not load the Lounge.', true);
    scheduleLoungePoll(5000);
  }
}

async function pollLoungeChat(): Promise<void> {
  if (!loungeActive || loungeView.hidden) return;
  if (loungePollTimer !== null) window.clearTimeout(loungePollTimer);
  loungePollTimer = null;
  if (document.hidden) {
    loungePollDelay = Math.min(10_000, Math.max(5_000, loungePollDelay * 1.5));
    scheduleLoungePoll();
    return;
  }

  const headers = new Headers();
  if (loungeEtag !== null) headers.set('If-None-Match', loungeEtag);
  try {
    const response = await fetch(`${apiBaseUrl}/lounge/messages?since=${loungeCursor}`, {
      headers,
      credentials: 'same-origin',
    });
    if (!loungeActive) return;
    if (response.status === 304) {
      loungePollDelay = Math.min(10_000, loungePollDelay * 1.5);
    } else {
      const payload = await response.json() as { messages?: ChatMessage[]; error?: { message?: string } };
      if (!loungeActive) return;
      if (!response.ok) throw new ApiFailure(payload.error?.message ?? 'Could not load the Lounge.', response.status);
      loungeEtag = response.headers.get('ETag');
      const received = payload.messages ?? [];
      for (const message of received) {
        loungeCursor = Math.max(loungeCursor, message.id);
        appendLoungeMessage(message, loungeFollowLatest);
      }
      loungePollDelay = received.length > 0 ? 1000 : Math.min(10_000, loungePollDelay * 1.5);
    }
  } catch (error) {
    if (!loungeActive) return;
    if (error instanceof ApiFailure && error.status === 401) {
      showSignedOut();
      return;
    }
    report(error instanceof Error ? error.message : 'Could not load the Lounge.', true);
    loungePollDelay = Math.min(10_000, loungePollDelay * 1.5);
  }

  if (loungeActive) scheduleLoungePoll();
}

async function sendLoungeMessage(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const body = loungeInput.value.trim();
  if (body === '') return;
  const sendButton = loungeForm.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (sendButton !== null) sendButton.disabled = true;
  try {
    const messageBody: { body: string; parent_id?: number } = { body };
    if (loungeReplyParent !== null) messageBody.parent_id = loungeReplyParent.id;
    const result = await api<{ message: ChatMessage }>('/lounge/messages', {
      method: 'POST',
      body: JSON.stringify(messageBody),
    });
    if (!loungeActive) return;
    loungeCursor = Math.max(loungeCursor, result.message.id);
    appendLoungeMessage(result.message, true);
    loungeInput.value = '';
    clearLoungeReplyParent();
    loungeMentionDismissed = false;
    hideLoungeMentionSuggestions();
    loungeEtag = null;
    loungePollDelay = 1000;
    scheduleLoungePoll(0);
  } catch (error) {
    if (error instanceof ApiFailure && error.status === 401) {
      showSignedOut();
      return;
    }
    report(error instanceof Error ? error.message : 'Could not send the Lounge message.', true);
  } finally {
    if (sendButton !== null) sendButton.disabled = false;
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
  const dialogOpen = issueStatusPicker.open || issueDeleteConfirmation.open
    || memberRemovalConfirmation.open || workspaceMemberDeactivationDialog.open
    || workspaceMemberRoleDialog.open || workspaceGuestProjectsDialog.open
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
                void loadIssueStatusHistory(selectedIssueId);
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

function visibleInboxIssueTitleButtons(): HTMLButtonElement[] {
  return Array.from(activeMyWorkListRoot().querySelectorAll<HTMLButtonElement>('.issue-title-button'))
    .filter((button) => button.closest<HTMLDetailsElement>('.my-work-task-group')?.open !== false);
}

function selectedInboxIssueButton(): HTMLButtonElement | null {
  const focused = document.activeElement;
  const activeList = activeMyWorkListRoot();
  if (focused instanceof HTMLElement && activeList.contains(focused)) {
    const focusedRow = focused.closest<HTMLElement>('.inbox-issue-card');
    if (focusedRow !== null) return focusedRow.querySelector<HTMLButtonElement>('.issue-title-button');
  }
  const selected = activeList.querySelector<HTMLButtonElement>('.inbox-issue-card.is-keyboard-selected .issue-title-button');
  return selected?.closest<HTMLDetailsElement>('.my-work-task-group')?.open === false ? null : selected;
}

function activeMyWorkListRoot(): HTMLElement {
  return myWorkTab === 'tasks' ? myWorkTaskGroups : inboxIssueList;
}

function hasSelectedInboxIssue(): boolean {
  return selectedInboxIssueButton() !== null;
}

function hasSelectedIssueInVisibleView(): boolean {
  return !projectView.hidden && (!issuesView.hidden || !issueDetailView.hidden)
    && (selectedIssue !== null || selectedIssueButton() !== null);
}

function latestChatIssueButton(): HTMLButtonElement | null {
  if (chatMessageList === null) return null;
  const messages = Array.from(chatMessageList.querySelectorAll<HTMLElement>('.chat-message'))
    .filter((message) => Number(message.dataset.messageId) > 0);
  return messages.at(-1)?.querySelector<HTMLButtonElement>('.chat-create-issue-button:not(:disabled)') ?? null;
}

function activeChatMessageList(): HTMLElement | null {
  return loungeView.hidden ? chatMessageList : loungeMessageList;
}

function activeChatMessagesById(): Map<number, ChatMessage> {
  return loungeView.hidden ? chatMessagesById : loungeMessagesById;
}

function focusActiveChatComposer(): void {
  if (loungeView.hidden) chatInput?.focus();
  else loungeInput.focus();
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
  if (loungeView.hidden) chatFollowLatest = chatMessageElements().at(-1) === item;
  else loungeFollowLatest = chatMessageElements().at(-1) === item;
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
    chatInput?.focus();
  }
}

function replyToSelectedChatMessage(): void {
  if (selectedChatMessageId === null || selectedChatMessageId <= 0) return;
  const message = activeChatMessagesById().get(selectedChatMessageId);
  if (message === undefined) return;
  if (loungeView.hidden) setChatReplyParent(message);
  else setLoungeReplyParent(message);
}

function createIssueFromSelectedChatMessage(): void {
  if (selectedChatMessageId !== null) {
    const selectedButton = chatMessageList
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
  clearIssueDiscussion();
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
    hasSelectedInboxIssue: hasSelectedInboxIssue(),
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
      || memberRemovalConfirmation.open || workspaceMemberDeactivationDialog.open || workspaceMemberRoleDialog.open
      || workspaceGuestProjectsDialog.open || milestoneUi.deleteConfirmation.open || milestoneUi.managerDialog.open
      || workspacePicker.open,
    canDismiss: commandPalette.open || shortcutHelp.open || (!workspacePanel.hidden && (
      pendingWorkspaceId !== null
      || (!projectView.hidden && (!issueDetailView.hidden || !issueDetailEditForm.hidden
        || issueQuickAddEscapePending || chatReplyParent !== null))
      || (!loungeView.hidden && loungeReplyParent !== null)
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
    moveFocusWithin(visibleInboxIssueTitleButtons(), '.inbox-issue-card', direction);
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
    moveFocusToBoundary(visibleInboxIssueTitleButtons(), '.inbox-issue-card', edge);
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
  } else if (document.activeElement instanceof HTMLElement
    && document.activeElement.closest('.issue-discussion-message') !== null) {
    moveIssueDiscussionSelectionByPage(direction);
  } else if (!projectsView.hidden) {
    moveFocusByPage(
      Array.from(projectList.querySelectorAll<HTMLButtonElement>('.project-card button')),
      '.project-card',
      projectsView,
      direction,
    );
  } else if (!inboxView.hidden) {
    moveFocusByPage(visibleInboxIssueTitleButtons(), '.inbox-issue-card', inboxView, direction);
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
  clearIssueDiscussion();
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
    openIssueStatusPicker(selectedIssue, issueDetailStatus);
    return;
  }
  const titleButton = selectedIssueButton();
  const row = titleButton?.closest<HTMLElement>('.issue-card');
  const issueId = Number(row?.dataset.issueId);
  const issue = projectIssues.find((candidate) => candidate.id === issueId);
  if (issue !== undefined && titleButton !== null && titleButton !== undefined) {
    openIssueStatusPicker(issue, titleButton);
  }
}

function createIssueFromLatestMessage(): void {
  latestChatIssueButton()?.click();
}

function beginCreateIssueFromChatMessage(message: ChatMessage, trigger: HTMLButtonElement): void {
  const projectId = activeProject?.id;
  if (projectId === undefined || activeChatProjectId !== projectId) return;
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
      run: openWorkspacePicker,
    });
    for (const workspace of activeWorkspaces) {
      if (workspace.id === activeUser.workspace_id) continue;
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

function renderCommandResults(): void {
  const query = commandSearch.value.trim().toLocaleLowerCase();
  visiblePaletteCommands = paletteCommands.filter((command) =>
    `${command.label} ${command.detail}`.toLocaleLowerCase().includes(query),
  );
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

function closeCommandPalette(): void {
  if (commandPalette.open) commandPalette.close();
}

function runPaletteCommand(index: number): void {
  const command = visiblePaletteCommands[index];
  if (command === undefined) return;
  closeCommandPalette();
  command.run();
}

function openCommandPalette(): void {
  if (activeUser === null || milestoneUi.deleteConfirmButton.disabled) return;
  if (themeUi.aboutDialog.open) themeUi.aboutDialog.close();
  if (projectEditDialog.open) projectEditDialog.close();
  if (workspacePicker.open) resetPendingWorkspaceSwitch();
  if (clientSummaryUi.dialog.open) clientSummaryUi.close();
  if (issueAiPromptDialog.open) issueAiPromptDialog.close();
  if (milestoneUi.deleteConfirmation.open) milestoneUi.closeDeleteConfirmation();
  if (milestoneUi.managerDialog.open) milestoneUi.close();
  if (issueStatusPicker.open) closeIssueStatusPicker();
  if (issueDeleteConfirmation.open) closeIssueDeleteConfirmation();
  if (memberRemovalConfirmation.open) closeMemberRemovalConfirmation();
  if (workspaceMemberDeactivationDialog.open) closeWorkspaceMemberDeactivationConfirmation();
  if (workspaceMemberRoleDialog.open) closeWorkspaceMemberRoleConfirmation();
  if (workspaceGuestProjectsDialog.open) closeWorkspaceGuestProjectAccess();
  if (shortcutHelp.open) shortcutHelp.close();
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

function showShortcutHelp(): void {
  if (activeUser === null || milestoneUi.deleteConfirmButton.disabled) return;
  if (workspacePicker.open) resetPendingWorkspaceSwitch();
  if (clientSummaryUi.dialog.open) clientSummaryUi.close();
  if (issueAiPromptDialog.open) issueAiPromptDialog.close();
  if (milestoneUi.deleteConfirmation.open) milestoneUi.closeDeleteConfirmation();
  if (milestoneUi.managerDialog.open) milestoneUi.close();
  if (issueStatusPicker.open) closeIssueStatusPicker();
  if (issueDeleteConfirmation.open) closeIssueDeleteConfirmation();
  if (memberRemovalConfirmation.open) closeMemberRemovalConfirmation();
  if (workspaceMemberDeactivationDialog.open) closeWorkspaceMemberDeactivationConfirmation();
  if (workspaceMemberRoleDialog.open) closeWorkspaceMemberRoleConfirmation();
  if (workspaceGuestProjectsDialog.open) closeWorkspaceGuestProjectAccess();
  if (commandPalette.open) closeCommandPalette();
  if (shortcutHelp.open) {
    shortcutHelp.close();
    return;
  }
  shortcutHelp.showModal();
  shortcutHelpClose.focus();
}

function dismissCurrentView(): void {
  if (milestoneUi.deleteConfirmButton.disabled) return;
  if (themeUi.aboutDialog.open) {
    themeUi.aboutDialog.close();
  } else if (projectEditDialog.open) {
    projectEditDialog.close();
  } else if (workspacePicker.open) {
    resetPendingWorkspaceSwitch();
  } else if (clientSummaryUi.dialog.open) {
    clientSummaryUi.close();
  } else if (issueAiPromptDialog.open) {
    issueAiPromptDialog.close();
  } else if (milestoneUi.deleteConfirmation.open) {
    milestoneUi.closeDeleteConfirmation();
  } else if (milestoneUi.managerDialog.open) {
    milestoneUi.close();
  } else if (issueDeleteConfirmation.open) {
    closeIssueDeleteConfirmation();
  } else if (memberRemovalConfirmation.open) {
    closeMemberRemovalConfirmation();
  } else if (workspaceMemberDeactivationDialog.open) {
    closeWorkspaceMemberDeactivationConfirmation();
  } else if (workspaceMemberRoleDialog.open) {
    closeWorkspaceMemberRoleConfirmation();
  } else if (workspaceGuestProjectsDialog.open) {
    closeWorkspaceGuestProjectAccess();
  } else if (issueStatusPicker.open) {
    closeIssueStatusPicker();
  } else if (commandPalette.open) {
    closeCommandPalette();
  } else if (shortcutHelp.open) {
    shortcutHelp.close();
  } else if (!workspacePanel.hidden && !projectView.hidden && !issueDetailEditForm.hidden) {
    issueDetailCancelButton.click();
  } else if (!workspacePanel.hidden && !projectView.hidden && !issueDetailView.hidden) {
    issueBackButton.click();
  } else if (!workspacePanel.hidden && !projectsView.hidden && !projectFormPanel.hidden) {
    cancelProjectFormButton.click();
  } else if (!workspacePanel.hidden && !projectView.hidden
    && (issueQuickAddEscapePending || issueForm.classList.contains('is-active'))) {
    cancelIssueQuickAdd();
  } else if (!workspacePanel.hidden && !loungeView.hidden && loungeReplyParent !== null) {
    clearLoungeReplyParent();
  } else if (!workspacePanel.hidden && !projectView.hidden && chatReplyParent !== null) {
    clearChatReplyParent();
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

function closeProjectForm(): void {
  projectForm.reset();
  projectFormPanel.hidden = true;
  toggleProjectFormButton.focus();
}

function populateGithubRepositorySelect(
  select: HTMLSelectElement,
  selected: GitHubRepositoryOptionSelection | null = null,
  unavailableRepository: GitHubRepository | null = null,
): void {
  const selectedRepositoryId = selected === null
    ? null
    : 'id' in selected ? selected.id : selected.repository_id;
  const options = [new Option('No repository connected', '')];
  for (const repository of githubRepositories) {
    options.push(new Option(repository.full_name, githubRepositorySelectionValue(repository)));
  }
  if (selected !== null && !githubRepositories.some((repository) =>
    repository.id === selectedRepositoryId && repository.installation_id === selected.installation_id)) {
    if (unavailableRepository?.id === selectedRepositoryId
      && unavailableRepository.installation_id === selected.installation_id) {
      options.push(new Option(
        `${unavailableRepository.full_name} (access unavailable)`,
        githubRepositorySelectionValue(unavailableRepository),
      ));
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

async function loadGithubRepositories(): Promise<void> {
  if (activeUser?.role !== 'admin') return;
  try {
    const result = await api<{ repositories: GitHubRepository[]; connected: boolean; configured: boolean; can_connect: boolean }>('/github/repositories');
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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load GitHub repositories.';
    githubProjectSelectionStatus.textContent = message;
    githubProjectEditStatus.textContent = message;
    connectGithubCreateButton.hidden = false;
    connectGithubEditButton.hidden = false;
  }
}

async function connectGithub(): Promise<void> {
  const githubWindow = window.open('about:blank', '_blank');
  if (githubWindow === null) {
    report('Allow pop-up windows to connect a GitHub installation.', true);
    return;
  }
  githubWindow.opener = null;
  try {
    const result = await api<{ url: string }>('/github/install', { method: 'POST', body: '{}' });
    githubWindow.location.assign(result.url);
  } catch (error) {
    githubWindow.close();
    report(error instanceof Error ? error.message : 'Could not start GitHub connection.', true);
  }
}

function openProjectEditDialog(): void {
  if (activeUser?.role !== 'admin' || activeProject === null) return;
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

function projectStatusHint(status: Project['status']): string {
  return PROJECT_STATUS_HINTS[status];
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
  if (chatInput !== null) chatInput.disabled = readOnly;
  const chatSend = chatView.querySelector<HTMLButtonElement>('.chat-composer button[type="submit"]');
  if (chatSend !== null) chatSend.disabled = readOnly;
  if (status === 'completed') {
    projectReadOnlyNotice.textContent = 'This project is completed and read-only. An admin can reopen it from Edit project.';
  } else if (status === 'archived') {
    projectReadOnlyNotice.textContent = 'This project is archived and read-only. An admin can restore its previous work state from Edit project.';
  } else {
    projectReadOnlyNotice.textContent = '';
  }
}

function updateProjectStatusHint(): void {
  const status = projectEditStatus.value as Project['status'];
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
  } else if (activeProject?.status === 'archived' && status !== 'archived') {
    hint += status === archivedFromStatus
      ? ' Saving will restore the previous work state.'
      : ` Saving will unarchive the project as ${PROJECT_STATUS_LABELS[status].toLowerCase()}.`;
  }
  projectEditStatusHelp.textContent = hint;
}

async function saveProjectEdit(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  if (activeUser?.role !== 'admin' || activeProject === null) return;
  const projectId = activeProject.id;
  projectEditSave.disabled = true;
  projectEditMessage.textContent = '';
  projectEditMessage.classList.remove('is-error');
  try {
    const githubRepositorySelection = parseGitHubRepositorySelection(projectEditGithubRepository.value);
    const result = await api<{ project: Project }>(`/projects/${projectId}`, {
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
    if (activeProject?.id !== projectId) return;
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
    } catch (error) {
      report(error instanceof Error ? error.message : 'Project updated, but the project list could not be refreshed.', true);
    }
  } catch (error) {
    projectEditMessage.textContent = error instanceof Error ? error.message : 'Could not update the project.';
    projectEditMessage.classList.add('is-error');
    projectEditName.focus();
  } finally {
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
  if (activeUser?.role === 'admin' && !projectView.hidden) editProjectButton.focus();
});

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
    workspaceAdminTabs.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus();
    return;
  }
  if (focused === issueDiscussionInput) {
    const selected = selectedIssueDiscussionMessageId === null
      ? null
      : issueDiscussionList.querySelector<HTMLElement>(`.issue-discussion-message[data-message-id="${selectedIssueDiscussionMessageId}"]`);
    const latest = issueDiscussionMessageElements().at(-1) ?? null;
    const target = selected ?? latest;
    if (target !== null) selectIssueDiscussionMessage(Number(target.dataset.messageId));
    else issueDiscussionHeading.focus();
    return;
  }
  if (focused === loungeInput) {
    const selected = selectedChatMessageId === null
      ? null
      : loungeMessageList.querySelector<HTMLElement>(`.chat-message[data-message-id="${selectedChatMessageId}"]`);
    const latest = chatMessageElements().at(-1) ?? null;
    const target = selected ?? latest;
    if (target !== null) selectChatMessage(Number(target.dataset.messageId));
    else loungeHeading.focus();
    return;
  }
  if (focused !== chatInput) return;

  const selected = selectedChatMessageId === null
    ? null
    : chatMessageList?.querySelector<HTMLElement>(`.chat-message[data-message-id="${selectedChatMessageId}"]`) ?? null;
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
    case 'workspace-switcher': openWorkspacePicker(); break;
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
    case 'first-issue-discussion-message': moveIssueDiscussionSelectionToBoundary('first'); break;
    case 'last-issue-discussion-message': moveIssueDiscussionSelectionToBoundary('last'); break;
    case 'page-up': moveSelectionByPage(-1); break;
    case 'page-down': moveSelectionByPage(1); break;
    case 'next': moveIssueSelection(1); break;
    case 'previous': moveIssueSelection(-1); break;
    case 'first-issue': moveIssueSelectionToBoundary('first'); break;
    case 'last-issue': moveIssueSelectionToBoundary('last'); break;
    case 'focus-issue-filter': issueFilter.focus(); break;
    case 'open-selected':
      if (!inboxView.hidden) selectedInboxIssueButton()?.click();
      else selectedIssueButton()?.click();
      break;
    case 'create-issue': beginCreateIssue(); break;
    case 'edit-selected': editSelectedIssue(); break;
    case 'focus-status': focusSelectedIssueStatus(); break;
    case 'issue-from-latest-message': createIssueFromLatestMessage(); break;
    case 'next-chat-message': moveChatMessageSelection(1); break;
    case 'previous-chat-message': moveChatMessageSelection(-1); break;
    case 'next-issue-discussion-message': moveIssueDiscussionSelection(1); break;
    case 'previous-issue-discussion-message': moveIssueDiscussionSelection(-1); break;
    case 'focus-chat-composer': focusActiveChatComposer(); break;
    case 'reply-to-chat-message': replyToSelectedChatMessage(); break;
    case 'focus-issue-discussion-composer': issueDiscussionInput.focus(); break;
    case 'reply-to-issue-discussion-message': replyToSelectedIssueDiscussionMessage(); break;
    case 'issue-from-selected-chat-message': createIssueFromSelectedChatMessage(); break;
    case 'blur-text-input': blurTextInput(); break;
    case 'collapse-status-history': issueStatusHistory.open = false; break;
    case 'dismiss': dismissCurrentView(); break;
  }
}

function handleKeyboardShortcut(event: KeyboardEvent): void {
  if (guestUi.isPreviewActive()) {
    if (event.key === 'Escape') guestUi.closePreview();
    return;
  }
  if ((commandPalette.open || clientSummaryUi.dialog.open || shortcutHelp.open || issueAiPromptDialog.open || issueStatusPicker.open || issueDeleteConfirmation.open || memberRemovalConfirmation.open || workspaceMemberDeactivationDialog.open || workspaceMemberRoleDialog.open || workspaceGuestProjectsDialog.open || milestoneUi.deleteConfirmation.open || milestoneUi.managerDialog.open || workspacePicker.open || themeUi.aboutDialog.open || projectEditDialog.open)
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

function movePaletteCommandSelection(direction: -1 | 1): void {
  if (visiblePaletteCommands.length === 0) return;
  activePaletteCommandIndex = (activePaletteCommandIndex + direction + visiblePaletteCommands.length) % visiblePaletteCommands.length;
  renderCommandResults();
  commandResults.querySelectorAll<HTMLButtonElement>('.command-item')[activePaletteCommandIndex]?.focus();
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
  } else if (event.key === 'Enter') {
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
  if (!(event.target instanceof HTMLElement) || !event.target.matches('.issue-status-option')) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    event.stopPropagation();
    focusIssueStatusPickerOption(issueStatusPickerOptionIndex + (event.key === 'ArrowDown' ? 1 : -1));
  } else if (event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    void applyIssueStatusPickerSelection();
  }
});
document.addEventListener('keydown', handleKeyboardShortcut);

function scheduleChatPoll(delay = chatPollDelay): void {
  if (activeChatProjectId === null) return;
  if (chatPollTimer !== null) window.clearTimeout(chatPollTimer);
  chatPollTimer = window.setTimeout(() => {
    chatPollTimer = null;
    if (activeChatProjectId !== null) void pollProjectChat(activeChatProjectId);
  }, delay);
}

function stopProjectPresencePolling(): void {
  if (projectPresenceTimer !== null) window.clearTimeout(projectPresenceTimer);
  projectPresenceTimer = null;
  projectPresenceRequestVersion += 1;
  chatPresenceIndicator = null;
}

function scheduleProjectPresencePoll(delay = PROJECT_PRESENCE_INTERVAL_MS): void {
  if (projectPresenceTimer !== null) window.clearTimeout(projectPresenceTimer);
  projectPresenceTimer = null;
  if (activeChatProjectId === null || chatPresenceIndicator === null) return;
  projectPresenceTimer = window.setTimeout(() => {
    projectPresenceTimer = null;
    if (activeChatProjectId !== null) void pollProjectPresence(activeChatProjectId);
  }, delay);
}

async function pollProjectPresence(projectId: number): Promise<void> {
  if (projectPresenceTimer !== null) window.clearTimeout(projectPresenceTimer);
  projectPresenceTimer = null;
  if (activeChatProjectId !== projectId || chatPresenceIndicator === null) return;
  const requestVersion = ++projectPresenceRequestVersion;
  if (document.hidden) {
    scheduleProjectPresencePoll();
    return;
  }

  try {
    const result = await api<{ someone_else_viewing?: boolean }>(`/projects/${projectId}/presence`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (requestVersion !== projectPresenceRequestVersion || activeChatProjectId !== projectId) return;
    setProjectPresenceState(result.someone_else_viewing === true ? 'active' : 'alone');
  } catch (error) {
    if (requestVersion !== projectPresenceRequestVersion || activeChatProjectId !== projectId) return;
    if (error instanceof ApiFailure && error.status === 401) {
      showSignedOut();
      return;
    }
    setProjectPresenceState('unknown');
  } finally {
    if (requestVersion === projectPresenceRequestVersion && activeChatProjectId === projectId) {
      scheduleProjectPresencePoll();
    }
  }
}

function setProjectPresenceState(state: 'active' | 'alone' | 'unknown'): void {
  if (chatPresenceIndicator === null) return;
  const isActive = state === 'active';
  const light = chatPresenceIndicator.querySelector<HTMLElement>('.chat-presence-light');
  chatPresenceIndicator.className = state === 'active'
    ? 'chat-presence is-active'
    : state === 'unknown' ? 'chat-presence is-unknown' : 'chat-presence is-alone';
  light?.classList.toggle('is-on', isActive);
  light?.classList.toggle('is-off', !isActive);
  const label = state === 'active'
    ? 'Another person is viewing this project'
    : state === 'unknown' ? 'Could not check whether anyone else is viewing this project' : 'No other active viewers';
  chatPresenceIndicator.setAttribute('aria-label', label);
  chatPresenceIndicator.title = label;
}

async function pollProjectChat(projectId: number): Promise<void> {
  if (activeChatProjectId !== projectId) return;
  if (document.hidden) {
    chatPollDelay = Math.min(10_000, Math.max(5_000, chatPollDelay * 1.5));
    scheduleChatPoll();
    return;
  }

  const cursor = chatEventFeed.requestQuery();
  try {
    const result = await pollProjectChatEvents(
      fetch,
      apiBaseUrl,
      projectId,
      cursor,
      chatEtag,
      chatPollDelay,
    );
    if (activeChatProjectId !== projectId) return;
    if (!result.notModified && (result.status < 200 || result.status >= 300)) {
      throw new ApiFailure(result.errorMessage ?? 'Could not load project chat.', result.status);
    }
    chatPollDelay = result.nextDelay;
    if (!result.notModified) {
      chatEtag = result.etag;
      const received = result.events as ChatEvent[];
      chatEventFeed.consume(
        received,
        projectId,
        (messageId) => chatMessagesById.has(messageId),
        (event) => appendChatMessage(event, chatFollowLatest),
      );
    }
  } catch (error) {
    if (error instanceof ApiFailure && error.status === 401) {
      showSignedOut();
      return;
    }
    report(error instanceof Error ? error.message : 'Could not load project chat.', true);
    chatPollDelay = Math.min(10_000, chatPollDelay * 1.5);
  }

  if (activeChatProjectId === projectId) scheduleChatPoll();
}

async function loadProjectChatHistory(projectId: number): Promise<void> {
  try {
    const result = await api<{ messages: ChatMessage[] }>(`/projects/${projectId}/messages`);
    if (activeChatProjectId !== projectId) return;
    for (const message of result.messages) appendChatMessage(message);
    if (chatFollowLatest) scrollChatToBottom();
    void pollProjectChat(projectId);
  } catch (error) {
    if (error instanceof ApiFailure && error.status === 401) {
      showSignedOut();
      return;
    }
    report(error instanceof Error ? error.message : 'Could not load project chat.', true);
    scheduleChatPoll();
  }
}

function appendChatMessage(message: ChatMessage, scrollToBottom = false): void {
  if (chatMessageList === null) return;
  if (chatMessageList.querySelector(`[data-message-id="${message.id}"]`)) {
    if (scrollToBottom) scrollChatToBottom();
    return;
  }
  chatMessagesById.set(message.id, message);
  if (message.parent_id !== null && message.id > 0) {
    const parent = chatMessagesById.get(message.parent_id);
    if (parent !== undefined) updateChatMessageReplyCount(parent);
  }

  const item = document.createElement('article');
  item.className = message.parent_id === null ? 'chat-message' : 'chat-message chat-reply';
  item.dataset.messageId = String(message.id);
  item.tabIndex = -1;
  item.setAttribute('aria-keyshortcuts', 'j k ArrowUp ArrowDown Home End PageUp PageDown Enter r i');
  item.addEventListener('focusin', () => selectChatMessage(message.id, false));
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
  authorDetails.append(author);
  if (message.author_role === 'guest') authorDetails.append(chatMessageMarker('client'));
  if (message.is_client_visible) authorDetails.append(chatMessageMarker('visible'));
  authorDetails.append(time);
  const reply = document.createElement('button');
  reply.className = 'button button-quiet chat-reply-button';
  reply.type = 'button';
  reply.textContent = 'Reply';
  reply.disabled = activeProject !== null && projectStatusIsReadOnly(activeProject.status);
  reply.addEventListener('click', () => {
    selectChatMessage(message.id, false);
    setChatReplyParent(message);
  });
  const createIssue = document.createElement('button');
  createIssue.className = 'button button-quiet chat-create-issue-button';
  createIssue.type = 'button';
  createIssue.textContent = 'Create issue';
  createIssue.disabled = activeProject !== null && projectStatusIsReadOnly(activeProject.status);
  createIssue.addEventListener('click', () => {
    selectChatMessage(message.id, false);
    const projectId = activeProject?.id;
    if (projectId === undefined || activeChatProjectId !== projectId) return;
    beginCreateIssueFromChatMessage(message, createIssue);
  });
  const actions = document.createElement('div');
  actions.className = 'chat-message-actions';
  actions.append(reply, createIssue);
  heading.append(avatar, authorDetails, actions);

  const body = document.createElement('p');
  body.className = 'chat-message-body';
  body.textContent = message.body;
  item.append(heading);
  if (message.parent_id !== null) {
    const parentMessage = chatMessagesById.get(message.parent_id);
    const parentAuthor = message.parent_author_name ?? parentMessage?.author_name ?? null;
    const parentBody = message.parent_body ?? parentMessage?.body ?? null;
    const parentExcerpt = parentBody === null ? '' : compactChatMessage(parentBody);
    const parentLabel = parentAuthor === null
      ? parentExcerpt || `Message #${message.parent_id}`
      : parentExcerpt === '' ? parentAuthor : `${parentAuthor}: ${parentExcerpt}`;
    const context = document.createElement('button');
    context.className = 'chat-reply-context';
    context.type = 'button';
    context.textContent = `↳ ${parentLabel}`;
    context.title = `Reply to ${parentLabel}`;
    context.setAttribute('aria-label', `Jump to message #${message.parent_id}: ${parentLabel}`);
    context.addEventListener('click', () => void focusChatMessageById(message.parent_id!));
    item.append(context);
  }
  item.append(body);
  const followingMessage = scrollToBottom ? null : Array.from(chatMessageList.children).find((child) => {
    const existingId = Number((child as HTMLElement).dataset.messageId);
    return Number.isFinite(existingId) && existingId > message.id;
  });
  chatMessageList.insertBefore(item, followingMessage ?? null);
  updateChatMessageReplyCount(message);
  chatEmptyState!.hidden = true;
  if (scrollToBottom) scrollChatToBottom();
}

function updateChatMessageReplyCount(message: ChatMessage): void {
  const item = chatMessageList?.querySelector<HTMLElement>(`.chat-message[data-message-id="${message.id}"]`);
  if (item === null || item === undefined) return;

  const replies = Array.from(chatMessagesById.values()).filter((candidate) =>
    candidate.id > 0 && candidate.parent_id === message.id,
  );
  const replyCount = Math.max(message.reply_count ?? 0, replies.length);
  const loadedFirstReplyId = replies.reduce<number | null>((firstId, reply) =>
    firstId === null || reply.id < firstId ? reply.id : firstId, null);
  const firstReplyId = message.first_reply_id === null || message.first_reply_id === undefined
    ? loadedFirstReplyId
    : loadedFirstReplyId === null ? message.first_reply_id : Math.min(message.first_reply_id, loadedFirstReplyId);
  message.reply_count = replyCount;
  message.first_reply_id = firstReplyId;

  const existing = item.querySelector<HTMLButtonElement>('.chat-message-reply-count');
  if (replyCount === 0 || firstReplyId === null) {
    existing?.remove();
    return;
  }

  const button = existing ?? document.createElement('button');
  button.className = 'chat-message-reply-count';
  button.type = 'button';
  button.dataset.firstReplyId = String(firstReplyId);
  const label = `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`;
  button.textContent = label;
  button.title = `Show ${label} to ${message.author_name}'s message`;
  button.setAttribute('aria-label', `Jump to the first of ${label} to ${message.author_name}'s message`);
  if (existing === null) {
    button.addEventListener('click', () => {
      const firstReplyId = Number(button.dataset.firstReplyId);
      if (Number.isSafeInteger(firstReplyId)) void focusChatMessageById(firstReplyId);
    });
    item.append(button);
  }
}

function isChatNearBottom(): boolean {
  if (chatMessageList === null) return true;
  return chatMessageList.scrollHeight - chatMessageList.scrollTop - chatMessageList.clientHeight <= 24;
}

function scrollChatToBottom(): void {
  chatFollowLatest = true;
  if (chatMessageList !== null) chatMessageList.scrollTop = chatMessageList.scrollHeight;
}

function compactChatMessage(body: string): string {
  const normalized = body.replace(/\s+/g, ' ').trim();
  const characters = Array.from(normalized);
  return characters.length > 110 ? `${characters.slice(0, 109).join('').trimEnd()}…` : normalized;
}

async function focusChatMessageById(messageId: number): Promise<void> {
  const projectId = activeProject?.id;
  if (projectId === undefined || activeChatProjectId !== projectId || !Number.isSafeInteger(messageId) || messageId < 1) return;

  let sourceMessage = chatMessageList?.querySelector<HTMLElement>(`.chat-message[data-message-id="${messageId}"]`) ?? null;
  if (sourceMessage === null) {
    try {
      const result = await api<{ messages: ChatMessage[] }>(`/projects/${projectId}/messages?since=${messageId - 1}`);
      if (activeProject?.id !== projectId || activeChatProjectId !== projectId) return;
      for (const message of result.messages) appendChatMessage(message);
      sourceMessage = chatMessageList?.querySelector<HTMLElement>(`.chat-message[data-message-id="${messageId}"]`) ?? null;
    } catch (error) {
      report(error instanceof Error ? error.message : 'Could not open the replied-to message.', true);
      return;
    }
  }

  if (sourceMessage === null) {
    report('The replied-to message is unavailable in this project chat.', true);
    return;
  }
  chatMessageList?.querySelector('.is-chat-source')?.classList.remove('is-chat-source');
  sourceMessage.classList.add('is-chat-source');
  sourceMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
  selectChatMessage(messageId);
}

function avatarInitials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join('').toUpperCase();
}

function chatMessageMarker(kind: 'client' | 'visible'): SVGSVGElement {
  const namespace = 'http://www.w3.org/2000/svg';
  const label = kind === 'client' ? 'Client message' : 'Visible to client';
  const marker = document.createElementNS(namespace, 'svg');
  marker.classList.add('chat-message-marker', `is-${kind}`);
  marker.setAttribute('viewBox', '0 0 16 16');
  marker.setAttribute('role', 'img');
  marker.setAttribute('aria-label', label);
  marker.setAttribute('title', label);

  const shapes = kind === 'client'
    ? [
      { tag: 'circle', attrs: { cx: '8', cy: '5', r: '2.25' } },
      { tag: 'path', attrs: { d: 'M3 14c.45-2.5 2.15-3.8 5-3.8s4.55 1.3 5 3.8' } },
    ]
    : [
      { tag: 'path', attrs: { d: 'M1.5 8s2.2-4 6.5-4 6.5 4 6.5 4-2.2 4-6.5 4-6.5-4-6.5-4Z' } },
      { tag: 'circle', attrs: { cx: '8', cy: '8', r: '1.7' } },
    ];
  for (const shape of shapes) {
    const element = document.createElementNS(namespace, shape.tag);
    for (const [name, value] of Object.entries(shape.attrs)) element.setAttribute(name, value);
    element.setAttribute('fill', 'none');
    element.setAttribute('stroke', 'currentColor');
    element.setAttribute('stroke-width', '1.35');
    element.setAttribute('stroke-linecap', 'round');
    element.setAttribute('stroke-linejoin', 'round');
    marker.append(element);
  }
  return marker;
}

function setChatReplyParent(message: ChatMessage): void {
  const clientVisible = message.is_client_visible === true;
  chatReplyParent = { id: message.id, name: message.author_name, body: message.body };
  if (chatReplyHint !== null) {
    const replyContext = `Replying to ${message.author_name}: ${compactChatMessage(message.body)}`;
    chatReplyHint.textContent = clientVisible
      ? `${replyContext}. Your reply will be visible to the guest.`
      : replyContext;
    chatReplyHint.classList.toggle('is-client-visible', clientVisible);
    chatReplyHint.hidden = false;
  }
  if (chatCancelReply !== null) chatCancelReply.hidden = false;
  chatInput?.focus();
}

function clearChatReplyParent(): void {
  chatReplyParent = null;
  if (chatReplyHint !== null) {
    chatReplyHint.hidden = true;
    chatReplyHint.classList.remove('is-client-visible');
  }
  if (chatCancelReply !== null) chatCancelReply.hidden = true;
}

function updateChatMentionSuggestions(): void {
  if (chatInput === null || chatMentionList === null || chatMentionDismissed) return;
  const query = findMentionQuery(chatInput.value, chatInput.selectionStart);
  if (query === null) {
    hideChatMentionSuggestions();
    return;
  }
  const matches = filterMentionMembers(activeProjectMembers, query.query, activeUser?.id ?? null);
  if (matches.length === 0) {
    chatMentionQuery = query;
    chatMentionMatches = [];
    chatMentionSelectedIndex = 0;
    const empty = document.createElement('div');
    empty.className = 'chat-mention-empty';
    empty.setAttribute('role', 'option');
    empty.setAttribute('aria-disabled', 'true');
    empty.setAttribute('aria-selected', 'false');
    empty.textContent = mentionEmptyMessage(activeProjectMembers, query.query, activeUser?.id ?? null);
    chatMentionList.replaceChildren(empty);
    chatMentionList.hidden = false;
    chatInput.setAttribute('aria-expanded', 'true');
    chatInput.removeAttribute('aria-activedescendant');
    return;
  }

  chatMentionQuery = query;
  chatMentionMatches = matches;
  chatMentionSelectedIndex = Math.min(chatMentionSelectedIndex, matches.length - 1);
  chatMentionList.replaceChildren(...matches.map((member, index) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.id = `chat-mention-option-${index}`;
    option.className = 'chat-mention-option';
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String(index === chatMentionSelectedIndex));
    const name = document.createElement('strong');
    name.textContent = member.name;
    const email = document.createElement('span');
    email.textContent = member.email;
    option.append(name, email);
    option.addEventListener('mousedown', (event) => event.preventDefault());
    option.addEventListener('click', () => selectChatMention(member));
    return option;
  }));
  chatMentionList.hidden = false;
  chatInput.setAttribute('aria-expanded', 'true');
  chatInput.setAttribute('aria-activedescendant', `chat-mention-option-${chatMentionSelectedIndex}`);
}

function hideChatMentionSuggestions(): void {
  chatMentionQuery = null;
  chatMentionMatches = [];
  chatMentionSelectedIndex = 0;
  if (chatMentionList !== null) {
    chatMentionList.hidden = true;
    chatMentionList.replaceChildren();
  }
  chatInput?.setAttribute('aria-expanded', 'false');
  chatInput?.removeAttribute('aria-activedescendant');
}

function selectChatMention(member: Member): void {
  if (chatInput === null || chatMentionQuery === null) return;
  const insertion = replaceMentionQuery(chatInput.value, chatMentionQuery, member.name);
  chatInput.value = insertion.value;
  chatInput.setSelectionRange(insertion.cursor, insertion.cursor);
  chatMentionDismissed = true;
  hideChatMentionSuggestions();
  chatInput.focus();
}

function handleChatMentionKeydown(event: KeyboardEvent): boolean {
  if (chatMentionList === null || chatMentionList.hidden) return false;
  if (chatInput === null) return false;
  return handleMentionKeydown(
    event,
    chatInput,
    chatMentionList,
    chatMentionMatches,
    chatMentionSelectedIndex,
    (index) => { chatMentionSelectedIndex = index; },
    selectChatMention,
    () => {
      chatMentionDismissed = true;
      hideChatMentionSuggestions();
    },
  );
}

function handleMentionKeydown<T extends MentionMember>(
  event: KeyboardEvent,
  input: HTMLTextAreaElement,
  list: HTMLDivElement,
  matches: readonly T[],
  selectedIndex: number,
  setSelectedIndex: (index: number) => void,
  selectMember: (member: T) => void,
  dismiss: () => void,
): boolean {
  if (list.hidden) return false;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    dismiss();
    return true;
  }
  if (matches.length === 0) return false;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    event.stopPropagation();
    const nextIndex = nextMentionSelectionIndex(selectedIndex, event.key === 'ArrowDown' ? 1 : -1, matches.length);
    setSelectedIndex(nextIndex);
    const options = Array.from(list.querySelectorAll<HTMLButtonElement>('[role="option"]'));
    options.forEach((option, index) => option.setAttribute('aria-selected', String(index === nextIndex)));
    const selected = options[nextIndex];
    if (selected !== undefined) {
      input.setAttribute('aria-activedescendant', selected.id);
      selected.scrollIntoView({ block: 'nearest' });
    }
    return true;
  }
  if ((event.key === 'Enter' && !event.shiftKey && !event.isComposing) || event.key === 'Tab') {
    const member = matches[selectedIndex];
    if (member === undefined) return false;
    event.preventDefault();
    event.stopPropagation();
    selectMember(member);
    return true;
  }
  return false;
}

function createProjectChat(projectId: number): HTMLElement {
  stopProjectPresencePolling();
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
  const activity = document.createElement('span');
  activity.className = 'chat-heading-activity';
  const presenceIndicator = document.createElement('span');
  presenceIndicator.className = 'chat-presence is-unknown';
  presenceIndicator.setAttribute('role', 'status');
  presenceIndicator.setAttribute('aria-label', 'Checking project viewer status');
  presenceIndicator.title = 'Checking project viewer status';
  const presenceLight = document.createElement('span');
  presenceLight.className = 'login-power-light chat-presence-light is-off';
  presenceLight.setAttribute('aria-hidden', 'true');
  presenceIndicator.append(presenceLight);
  activity.append(memberCount, presenceIndicator);
  heading.append(channelName, activity);

  chatFollowLatest = true;
  const messageList = document.createElement('div');
  messageList.className = 'chat-message-list';
  chatMessageList = messageList;
  const emptyState = document.createElement('p');
  emptyState.className = 'chat-empty-state';
  emptyState.textContent = 'No messages yet.';
  chatEmptyState = emptyState;
  messageList.append(emptyState);
  messageList.addEventListener('scroll', () => {
    if (chatMessageList !== messageList) return;
    chatFollowLatest = isChatNearBottom();
  });

  const form = document.createElement('form');
  form.className = 'chat-composer form-stack';
  chatMentionList = document.createElement('div');
  chatMentionList.id = `chat-mention-suggestions-${projectId}`;
  chatMentionList.className = 'chat-mention-suggestions';
  chatMentionList.setAttribute('role', 'listbox');
  chatMentionList.setAttribute('aria-label', 'Mention a project member');
  chatMentionList.hidden = true;
  const label = document.createElement('label');
  label.textContent = 'Message';
  chatInput = document.createElement('textarea');
  chatInput.name = 'body';
  chatInput.rows = 2;
  chatInput.maxLength = 10_000;
  chatInput.required = true;
  chatInput.disabled = activeProject !== null && projectStatusIsReadOnly(activeProject.status);
  chatInput.placeholder = `Message #${activeProject?.slug ?? 'project'}…`;
  chatInput.setAttribute('aria-label', 'Message');
  chatInput.setAttribute('aria-autocomplete', 'list');
  chatInput.setAttribute('aria-controls', chatMentionList.id);
  chatInput.setAttribute('aria-expanded', 'false');
  chatInput.addEventListener('input', () => {
    chatMentionDismissed = false;
    updateChatMentionSuggestions();
  });
  chatInput.addEventListener('click', updateChatMentionSuggestions);
  chatInput.addEventListener('select', updateChatMentionSuggestions);
  chatInput.addEventListener('keyup', updateChatMentionSuggestions);
  chatInput.addEventListener('blur', hideChatMentionSuggestions);
  chatInput.addEventListener('keydown', (event) => {
    if (!handleChatMentionKeydown(event)) submitFormOnEnter(event, form);
  });
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
  send.disabled = activeProject !== null && projectStatusIsReadOnly(activeProject.status);
  actions.append(chatCancelReply, send);

  form.append(chatMentionList, label, chatReplyHint, actions);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = chatInput?.value.trim() ?? '';
    if (body === '') return;
    const messageBody: { body: string; parent_id?: number } = { body };
    if (chatReplyParent !== null) messageBody.parent_id = chatReplyParent.id;
    const optimisticId = -Date.now();
    const optimisticMessage: ChatMessage = {
      id: optimisticId,
      channel_id: 0,
      parent_id: messageBody.parent_id ?? null,
      author_id: activeUser?.id ?? 0,
      author_name: activeUser?.name ?? 'You',
      parent_author_name: chatReplyParent?.name ?? null,
      parent_body: chatReplyParent?.body ?? null,
      body,
      created_at: new Date().toISOString(),
    };
    if (activeChatProjectId === projectId) appendChatMessage(optimisticMessage, true);
    send.disabled = true;
    try {
      const result = await api<{ message: ChatMessage }>(`/projects/${projectId}/messages`, {
        method: 'POST',
        body: JSON.stringify(messageBody),
      });
      if (activeChatProjectId === projectId) {
        chatMessageList?.querySelector(`[data-message-id="${optimisticId}"]`)?.remove();
        chatMessagesById.delete(optimisticId);
        appendChatMessage(result.message);
        scrollChatToBottom();
        selectChatMessage(result.message.id, false);
        chatInput!.value = '';
        chatMentionDismissed = false;
        hideChatMentionSuggestions();
        clearChatReplyParent();
        chatEtag = null;
        chatPollDelay = 1000;
        scheduleChatPoll(0);
      }
    } catch (error) {
      if (activeChatProjectId === projectId) {
        chatMessageList?.querySelector(`[data-message-id="${optimisticId}"]`)?.remove();
        chatMessagesById.delete(optimisticId);
        report(error instanceof Error ? error.message : 'Could not send the message.', true);
      }
    } finally {
      send.disabled = false;
    }
  });

  section.append(heading, chatMessageList, form);
  activeChatProjectId = projectId;
  chatPresenceIndicator = presenceIndicator;
  chatEventFeed.reset();
  chatEtag = null;
  chatPollDelay = 1000;
  void pollProjectPresence(projectId);
  void loadProjectChatHistory(projectId);

  return section;
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && activeChatProjectId !== null) {
    chatPollDelay = 1000;
    scheduleChatPoll(0);
    void pollProjectPresence(activeChatProjectId);
  }
  if (!document.hidden && loungeActive) {
    loungePollDelay = 1000;
    scheduleLoungePoll(0);
    void loungePresenceUi.pollLoungePresence();
  }
  if (!document.hidden && !loungeActive) void loungePresenceUi.pollWorkspacePresence();
  if (!document.hidden && activeProject !== null && issuePollingIsActive(activeProject.id)) {
    issuePollDelay = 1000;
    scheduleIssuePoll(0);
  }
  if (!document.hidden && inboxPollingIsActive()) {
    inboxPollDelay = 1000;
    scheduleInboxPoll(0);
  }
});
document.addEventListener('focusout', () => {
  window.setTimeout(resumeDeferredIssuePolling, 0);
  window.setTimeout(resumeDeferredInboxPolling, 0);
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
loungeMessageList.addEventListener('scroll', () => {
  loungeFollowLatest = loungeMessageList.scrollHeight - loungeMessageList.scrollTop
    - loungeMessageList.clientHeight <= 24;
});
loungeForm.addEventListener('submit', (event) => void sendLoungeMessage(event));
loungeCancelReply.addEventListener('click', clearLoungeReplyParent);
loungeInput.addEventListener('input', () => {
  loungeMentionDismissed = false;
  updateLoungeMentionSuggestions();
});
loungeInput.addEventListener('click', updateLoungeMentionSuggestions);
loungeInput.addEventListener('select', updateLoungeMentionSuggestions);
loungeInput.addEventListener('keyup', updateLoungeMentionSuggestions);
loungeInput.addEventListener('blur', hideLoungeMentionSuggestions);
loungeInput.addEventListener('keydown', (event) => {
  if (!handleLoungeMentionKeydown(event)) submitFormOnEnter(event, loungeForm);
});
workspaceAdminMembersTab.addEventListener('click', () => switchWorkspaceAdminTab('members'));
workspaceAdminInvitesTab.addEventListener('click', () => switchWorkspaceAdminTab('invites'));
workspaceAdminWorkspacesTab.addEventListener('click', () => switchWorkspaceAdminTab('workspaces'));
workspaceAdminTabs.addEventListener('keydown', (event) => {
  const tabs = [workspaceAdminMembersTab, workspaceAdminInvitesTab, workspaceAdminWorkspacesTab];
  const names: WorkspaceAdminTab[] = ['members', 'invites', 'workspaces'];
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
  const nextName = names[nextIndex];
  if (nextTab !== undefined && nextName !== undefined) {
    switchWorkspaceAdminTab(nextName);
    nextTab.focus();
  }
});
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
issueDetailOngoingInput.addEventListener('change', () =>
  updateOngoingMilestoneControl(issueDetailOngoingInput, issueDetailMilestoneInput));
issueQuickAddTitle.addEventListener('input', () => issueQuickAddTitle.setCustomValidity(''));
projectForm.querySelector<HTMLTextAreaElement>('textarea[name="description"]')
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

toggleProjectFormButton.addEventListener('click', () => {
  if (!projectFormPanel.hidden) {
    closeProjectForm();
    return;
  }
  projectFormPanel.hidden = false;
  projectForm.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
});
editProjectButton.addEventListener('click', openProjectEditDialog);
connectGithubCreateButton.addEventListener('click', () => void connectGithub());
connectGithubEditButton.addEventListener('click', () => void connectGithub());
projectEditStatus.addEventListener('change', updateProjectStatusHint);
cancelProjectFormButton.addEventListener('click', closeProjectForm);
linkPullRequestButton.addEventListener('click', () => {
  if (selectedIssue === null || activeProject === null || activeProject.github_repository === null
    || projectStatusIsReadOnly(activeProject.status)) return;
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
  if (selectedIssue !== null && !issueDetailView.hidden) linkPullRequestButton.focus();
});
issuePullRequestForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const issueId = selectedIssue?.id;
  if (issueId === undefined || activeProject === null || activeProject.github_repository === null) return;
  issuePullRequestSubmit.disabled = true;
  issuePullRequestMessage.textContent = '';
  issuePullRequestMessage.classList.remove('is-error');
  void api<{ pull_request: LinkedPullRequest }>(`/issues/${issueId}/pull-requests`, {
    method: 'POST',
    body: JSON.stringify({ url: issuePullRequestUrl.value }),
  }).then(async () => {
    if (selectedIssue?.id !== issueId) return;
    await loadIssuePullRequests(issueId);
    issuePullRequestDialog.close();
    report('Pull request linked.');
  }).catch((error: unknown) => {
    issuePullRequestMessage.textContent = error instanceof Error ? error.message : 'Could not link pull request.';
    issuePullRequestMessage.classList.add('is-error');
    issuePullRequestUrl.focus();
  }).finally(() => {
    issuePullRequestSubmit.disabled = false;
  });
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

memberForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (activeProject === null || memberSelect.value === '') return;
  const projectId = activeProject.id;
  try {
    await api(`/projects/${projectId}/members/${memberSelect.value}`, { method: 'PUT' });
    report('Member added to the project.');
    await loadProjectDetail(projectId, 'members');
  } catch (error) {
    report(error instanceof Error ? error.message : 'Could not add member.', true);
  }
});

function projectStatusLabel(status: Project['status']): string {
  return PROJECT_STATUS_LABELS[status];
}

function updateProjectEmptyStates(projects: readonly Project[]): void {
  const isEmpty = projects.length === 0;
  const isAdmin = activeUser?.role === 'admin';
  emptyProjects.hidden = !isEmpty;
  projectSidebarEmpty.hidden = !isEmpty;
  if (!isEmpty) return;

  emptyProjects.textContent = isAdmin
    ? 'No projects yet.'
    : "You're not a member of any projects yet. Ask a workspace admin to add you.";
  projectSidebarEmpty.textContent = isAdmin ? 'No projects yet.' : 'No project access yet.';
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

async function loadProjects(): Promise<void> {
  const result = await api<{ projects: Project[] }>('/projects');
  const projects = [...result.projects].sort((left, right) => (
    PROJECT_STATUS_ORDER[left.status] - PROJECT_STATUS_ORDER[right.status]
      || left.name.localeCompare(right.name)
  ));
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

function loadInboxIssues(): void {
  renderMyWorkTabs();
  renderInboxTabs();
  if (!inboxPollingIsActive()) return;
  if (myWorkTab === 'tasks') renderInboxIssues();
  else renderInboxEvents();
  inboxPollDelay = 1000;
  scheduleInboxPoll(0);
}

async function fetchConditionalInboxCollection<T extends { id: number }>(
  path: string,
  key: 'issues' | 'events',
  etag: string | null,
): Promise<ConditionalInboxCollection<T>> {
  const headers = new Headers();
  if (etag !== null) headers.set('If-None-Match', etag);
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers,
    credentials: 'same-origin',
  });
  const responseEtag = response.headers.get('ETag') ?? etag;
  if (response.status === 304) return { items: null, etag: responseEtag };

  const payload = await response.json() as Record<string, unknown> & {
    error?: { message?: string };
    has_more?: boolean;
    next_cursor?: number | null;
    counts?: { unread: number; mentions: number };
  };
  if (!response.ok) {
    throw new ApiFailure(payload.error?.message ?? 'Could not refresh your inbox.', response.status);
  }
  return {
    items: Array.isArray(payload[key]) ? payload[key] as T[] : [],
    etag: responseEtag,
    hasMore: payload.has_more,
    nextCursor: payload.next_cursor,
    counts: payload.counts,
  };
}

function inboxPollingIsActive(): boolean {
  return !workspacePanel.hidden && !inboxView.hidden;
}

function stopInboxPolling(): void {
  if (inboxPollTimer !== null) window.clearTimeout(inboxPollTimer);
  inboxPollTimer = null;
  inboxPollRequestVersion += 1;
  inboxPollInFlight = false;
  inboxPollDelay = 1000;
  inboxIssuesEtag = null;
  inboxEventsEtag = null;
  inboxPollHasDeferredChanges = false;
}

function scheduleInboxPoll(delay = inboxPollDelay): void {
  if (!inboxPollingIsActive()) {
    stopInboxPolling();
    return;
  }
  if (inboxPollTimer !== null) window.clearTimeout(inboxPollTimer);
  inboxPollTimer = window.setTimeout(() => {
    inboxPollTimer = null;
    void pollInbox();
  }, delay);
}

function inboxUpdatesAreDeferred(): boolean {
  return shouldDeferInboxUpdates({
    listFocused: inboxIssueList.contains(document.activeElement) || myWorkTaskGroups.contains(document.activeElement),
    mutationPending: inboxMutationPending > 0,
  });
}

function resumeDeferredInboxPolling(): void {
  if (inboxPollHasDeferredChanges && inboxPollingIsActive() && !inboxUpdatesAreDeferred()) {
    inboxPollDelay = 1000;
    scheduleInboxPoll(0);
  }
}

async function pollInbox(): Promise<void> {
  if (!inboxPollingIsActive() || inboxPollInFlight) return;
  if (document.hidden) {
    inboxPollDelay = nextInboxPollDelay(inboxPollDelay, false, true);
    scheduleInboxPoll(inboxPollDelay);
    return;
  }

  const deferUpdatesAtStart = inboxUpdatesAreDeferred();
  const forceDeferredRefresh = inboxPollHasDeferredChanges && !deferUpdatesAtStart;
  const requestVersion = ++inboxPollRequestVersion;
  inboxPollInFlight = true;
  let changed = false;
  try {
    const [issuesResult, eventsResult] = await Promise.all([
      fetchConditionalInboxCollection<InboxIssue>('/inbox', 'issues', forceDeferredRefresh ? null : inboxIssuesEtag),
      fetchConditionalInboxCollection<InboxEvent>(inboxEventPagePath(inboxTab), 'events', forceDeferredRefresh ? null : inboxEventsEtag),
    ]);
    if (requestVersion !== inboxPollRequestVersion || !inboxPollingIsActive()) return;

    const incomingIssues = issuesResult.items ?? inboxIssues;
    const incomingEvents = eventsResult.items === null
      ? inboxEvents
      : mergeInboxEventPage(inboxEvents, eventsResult.items);
    const issuesDiff = diffInboxCollections(inboxIssues, incomingIssues);
    const eventsDiff = diffInboxCollections(inboxEvents, incomingEvents);
    const issuesChanged = issuesDiff.added.length > 0 || issuesDiff.changed.length > 0
      || issuesDiff.removed.length > 0 || issuesDiff.orderChanged;
    const eventsChanged = eventsDiff.added.length > 0 || eventsDiff.changed.length > 0
      || eventsDiff.removed.length > 0 || eventsDiff.orderChanged;
    const incomingCounts = eventsResult.counts ?? inboxEventCounts;
    const countsChanged = incomingCounts.unread !== inboxEventCounts.unread
      || incomingCounts.mentions !== inboxEventCounts.mentions;
    changed = issuesChanged || eventsChanged || countsChanged;
    inboxIssuesEtag = issuesResult.etag;
    inboxEventsEtag = eventsResult.etag;

    const deferUpdates = deferUpdatesAtStart || inboxUpdatesAreDeferred();
    if (deferUpdates && changed) {
      inboxPollHasDeferredChanges = true;
    } else if (!deferUpdates) {
      inboxEventCounts = incomingCounts;
      if (eventsResult.hasMore !== undefined) inboxEventsHasMore = eventsResult.hasMore;
      if (eventsResult.nextCursor !== undefined) inboxEventsNextCursor = eventsResult.nextCursor;
      if (issuesChanged) inboxIssues = incomingIssues;
      if (eventsChanged) inboxEvents = incomingEvents;
      inboxPollHasDeferredChanges = false;
      if (issuesChanged && myWorkTab === 'tasks') renderInboxIssues();
      if (eventsChanged || countsChanged) {
        renderInboxTabs();
        if (myWorkTab === 'inbox') renderInboxEvents();
      }
    }
    inboxPollDelay = nextInboxPollDelay(inboxPollDelay, changed && !deferUpdates, false);
  } catch (error) {
    if (error instanceof ApiFailure && error.status === 401) {
      showSignedOut();
      return;
    }
    if (inboxPollingIsActive()) report(error instanceof Error ? error.message : 'Could not refresh your inbox.', true);
    inboxPollDelay = nextInboxPollDelay(inboxPollDelay, false, false);
  } finally {
    if (requestVersion === inboxPollRequestVersion) {
      inboxPollInFlight = false;
      const readyToApplyDeferredChanges = inboxPollHasDeferredChanges && !inboxUpdatesAreDeferred();
      if (readyToApplyDeferredChanges) inboxPollDelay = 1000;
      if (inboxPollingIsActive()) scheduleInboxPoll(readyToApplyDeferredChanges ? 0 : inboxPollDelay);
    }
  }
}

function renderMyWorkTabs(): void {
  const inboxSelected = myWorkTab === 'inbox';
  myWorkInboxTab.classList.toggle('is-active', inboxSelected);
  myWorkInboxTab.setAttribute('aria-selected', String(inboxSelected));
  myWorkInboxTab.tabIndex = inboxSelected ? 0 : -1;
  myWorkTasksTab.classList.toggle('is-active', !inboxSelected);
  myWorkTasksTab.setAttribute('aria-selected', String(!inboxSelected));
  myWorkTasksTab.tabIndex = inboxSelected ? -1 : 0;
  myWorkInboxPanel.hidden = !inboxSelected;
  myWorkTasksPanel.hidden = inboxSelected;
  inboxMarkAllReadButton.hidden = !inboxSelected || inboxTab === 'done';
}

function selectMyWorkTab(tab: MyWorkTab): void {
  myWorkTab = tab;
  renderMyWorkTabs();
  if (tab === 'tasks') {
    renderInboxIssues();
  } else {
    renderInboxTabs();
    renderInboxEvents();
  }
  scheduleInboxPoll(0);
}

function renderInboxTabs(): void {
  const existing = new Map(
    Array.from(inboxTabsElement.querySelectorAll<HTMLButtonElement>(':scope > .inbox-tab'))
      .map((button) => [button.dataset.inboxTab ?? '', button]),
  );
  for (const [index, tab] of INBOX_TABS.entries()) {
    let button = existing.get(tab.id);
    if (button === undefined) {
      button = document.createElement('button');
      button.type = 'button';
      button.id = `inbox-tab-${tab.id}`;
      button.className = 'inbox-tab';
      button.dataset.inboxTab = tab.id;
      button.setAttribute('role', 'tab');
      button.addEventListener('click', () => selectInboxTab(tab.id));
    }
    button.classList.toggle('is-active', tab.id === inboxTab);
    button.setAttribute('aria-selected', String(tab.id === inboxTab));
    button.tabIndex = tab.id === inboxTab ? 0 : -1;
    const count = tab.id === 'unread' ? inboxEventCounts.unread
      : tab.id === 'mentions' ? inboxEventCounts.mentions
      : null;
    button.textContent = count === null || count === 0 ? tab.label : `${tab.label} ${count}`;
    placeNodeAtPosition(inboxTabsElement, button, index);
    existing.delete(tab.id);
  }
  for (const button of existing.values()) button.remove();
  inboxMarkAllReadButton.hidden = myWorkTab !== 'inbox' || inboxTab === 'done';
}

function selectInboxTab(tab: InboxTab): void {
  inboxTab = tab;
  inboxEvents = [];
  inboxEventsEtag = null;
  inboxEventsHasMore = false;
  inboxEventsNextCursor = null;
  inboxLoadMoreButton.hidden = true;
  inboxPollRequestVersion += 1;
  inboxPollInFlight = false;
  renderInboxTabs();
  renderInboxEvents();
  scheduleInboxPoll(0);
}

myWorkInboxTab.addEventListener('click', () => selectMyWorkTab('inbox'));
myWorkTasksTab.addEventListener('click', () => selectMyWorkTab('tasks'));

myWorkTabsElement.addEventListener('keydown', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement) || event.altKey || event.ctrlKey || event.metaKey) return;
  const currentIndex = target === myWorkInboxTab ? 0 : target === myWorkTasksTab ? 1 : -1;
  if (currentIndex < 0) return;

  let nextIndex: number;
  if (event.key === 'ArrowRight') nextIndex = currentIndex === 0 ? 1 : 0;
  else if (event.key === 'ArrowLeft') nextIndex = currentIndex === 0 ? 1 : 0;
  else if (event.key === 'Home') nextIndex = 0;
  else if (event.key === 'End') nextIndex = 1;
  else return;

  event.preventDefault();
  event.stopPropagation();
  const nextTab = nextIndex === 0 ? myWorkInboxTab : myWorkTasksTab;
  selectMyWorkTab(nextIndex === 0 ? 'inbox' : 'tasks');
  nextTab.focus();
});

inboxTabsElement.addEventListener('keydown', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement) || event.altKey || event.ctrlKey || event.metaKey) return;
  const currentIndex = INBOX_TABS.findIndex((tab) => tab.id === target.dataset.inboxTab);
  if (currentIndex < 0) return;

  let nextIndex: number;
  if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % INBOX_TABS.length;
  else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + INBOX_TABS.length) % INBOX_TABS.length;
  else if (event.key === 'Home') nextIndex = 0;
  else if (event.key === 'End') nextIndex = INBOX_TABS.length - 1;
  else return;

  const nextTab = INBOX_TABS[nextIndex];
  if (nextTab === undefined) return;
  event.preventDefault();
  event.stopPropagation();
  selectInboxTab(nextTab.id);
  inboxTabsElement.querySelector<HTMLButtonElement>(`#inbox-tab-${nextTab.id}`)?.focus();
});

function reconcileInboxRows<T extends { id: number }>(
  list: HTMLUListElement,
  items: readonly T[],
  dataKey: 'issueId' | 'eventId',
  signatures: WeakMap<HTMLLIElement, string>,
  create: (item: T) => HTMLLIElement,
): void {
  const existingRows = new Map<number, HTMLLIElement>();
  const rowsFromOtherCollections: HTMLLIElement[] = [];
  for (const row of Array.from(list.querySelectorAll<HTMLLIElement>(':scope > .inbox-issue-card'))) {
    const rowId = row.dataset[dataKey];
    if (rowId === undefined || !Number.isSafeInteger(Number(rowId))) {
      rowsFromOtherCollections.push(row);
    } else {
      existingRows.set(Number(rowId), row);
    }
  }
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const focusedRow = focused?.closest<HTMLLIElement>('.inbox-issue-card') ?? null;
  const focusedRowId = focusedRow === null ? null : Number(focusedRow.dataset[dataKey]);
  const focusedIndex = focusedRow === null ? -1 : Array.from(list.children).indexOf(focusedRow);
  const focusSelector = focused?.matches('.issue-title-button') ? '.issue-title-button'
    : focused?.matches('.inbox-event-read') ? '.inbox-event-read'
    : focused?.matches('.inbox-event-done') ? '.inbox-event-done'
    : null;
  const expectedIds = new Set<number>();

  rowsFromOtherCollections.forEach((row) => row.remove());

  for (const [index, item] of items.entries()) {
    expectedIds.add(item.id);
    const existingRow = existingRows.get(item.id);
    const signature = inboxItemSignature(item);
    let row = existingRow;
    if (row === undefined || signatures.get(row) !== signature) {
      row = create(item);
      signatures.set(row, signature);
      if (existingRow !== undefined) {
        row.classList.toggle('is-keyboard-selected', existingRow.classList.contains('is-keyboard-selected'));
        existingRow.replaceWith(row);
      }
    }
    placeNodeAtPosition(list, row, index);
  }

  for (const [id, row] of existingRows) {
    if (!expectedIds.has(id)) row.remove();
  }

  if (focusedRowId === null || focusSelector === null) return;
  const focusedReplacement = Array.from(list.querySelectorAll<HTMLLIElement>(':scope > .inbox-issue-card'))
    .find((row) => Number(row.dataset[dataKey]) === focusedRowId);
  const focusTarget = focusedReplacement?.querySelector<HTMLElement>(focusSelector);
  if (focusTarget !== null && focusTarget !== undefined && focusedRow !== focusedReplacement) {
    focusTarget.focus();
  } else if (focusedRow !== null && !focusedRow.isConnected) {
    const nextRow = list.children.item(Math.min(Math.max(focusedIndex, 0), list.children.length - 1));
    const nextFocusTarget = nextRow?.querySelector<HTMLElement>('.issue-title-button')
      ?? inboxTabsElement.querySelector<HTMLElement>('.inbox-tab.is-active');
    nextFocusTarget?.focus();
  }
}

function inboxItemSignature(item: object): string {
  return JSON.stringify(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)));
}

function renderInboxEvents(): void {
  const events = inboxEvents;
  const unread = inboxEventCounts.unread;
  inboxSummary.textContent = `${unread} unread ${unread === 1 ? 'event' : 'events'}.`;
  reconcileInboxRows(inboxIssueList, events, 'eventId', inboxEventRowRenderSignatures, (event) => createEventRow(event, {
    open: (target) => void openInboxEvent(target),
    toggleRead: (target) => void updateInboxEvent(target, { read: !target.read }),
    toggleDone: (target) => void updateInboxEvent(target, { done: !target.done, read: true }),
  }));
  inboxEmptyState.textContent = 'Nothing here.';
  inboxEmptyState.hidden = events.length > 0;
  inboxLoadMoreButton.hidden = !inboxEventsHasMore;
  inboxLoadMoreButton.disabled = inboxMorePageLoading;
}

async function loadMoreInboxEvents(): Promise<void> {
  if (inboxMorePageLoading || !inboxEventsHasMore || inboxEventsNextCursor === null) return;
  inboxMorePageLoading = true;
  const requestVersion = ++inboxPollRequestVersion;
  inboxPollInFlight = true;
  renderInboxEvents();
  try {
    const page = await fetchConditionalInboxCollection<InboxEvent>(
      inboxEventPagePath(inboxTab, inboxEventsNextCursor),
      'events',
      null,
    );
    if (requestVersion !== inboxPollRequestVersion || !inboxPollingIsActive() || page.items === null) return;
    inboxEvents = mergeInboxEventPage(inboxEvents, page.items);
    inboxEventCounts = page.counts ?? inboxEventCounts;
    inboxEventsHasMore = page.hasMore ?? false;
    inboxEventsNextCursor = page.nextCursor ?? null;
    renderInboxTabs();
    renderInboxEvents();
  } catch (error) {
    if (error instanceof ApiFailure && error.status === 401) {
      showSignedOut();
      return;
    }
    report(error instanceof Error ? error.message : 'Could not load older inbox events.', true);
  } finally {
    inboxMorePageLoading = false;
    if (requestVersion === inboxPollRequestVersion) {
      inboxPollInFlight = false;
      if (inboxPollingIsActive()) scheduleInboxPoll(1000);
    }
    renderInboxEvents();
  }
}

async function updateInboxEvent(event: InboxEvent, change: { read?: boolean; done?: boolean }): Promise<void> {
  inboxMutationPending += 1;
  try {
    const result = await api<{ event: InboxEvent }>(`/inbox/events/${event.id}`, {
      method: 'PATCH',
      body: JSON.stringify(change),
    });
    inboxEvents = inboxEvents.map((candidate) => (candidate.id === event.id ? result.event : candidate));
    inboxEvents = eventsForTab(inboxEvents, inboxTab);
    inboxEventsEtag = null;
    inboxPollDelay = 1000;
    renderInboxTabs();
    renderInboxEvents();
    inboxPollRequestVersion += 1;
    inboxPollInFlight = false;
    scheduleInboxPoll(0);
  } catch (error) {
    report(error instanceof Error ? error.message : 'Could not update the event.', true);
  } finally {
    inboxMutationPending -= 1;
    resumeDeferredInboxPolling();
  }
}

async function markAllInboxEventsRead(): Promise<void> {
  inboxMutationPending += 1;
  try {
    await api('/inbox/events/read-all', { method: 'POST' });
    inboxEvents = inboxEvents.map((event) => ({ ...event, read: true }));
    if (inboxTab === 'unread') {
      inboxEvents = [];
      inboxEventsHasMore = false;
      inboxEventsNextCursor = null;
    }
    inboxEventCounts = { ...inboxEventCounts, unread: 0 };
    inboxEventsEtag = null;
    inboxPollDelay = 1000;
    renderInboxTabs();
    renderInboxEvents();
    inboxPollRequestVersion += 1;
    inboxPollInFlight = false;
    scheduleInboxPoll(0);
  } catch (error) {
    report(error instanceof Error ? error.message : 'Could not mark events as read.', true);
  } finally {
    inboxMutationPending -= 1;
    resumeDeferredInboxPolling();
  }
}

async function openInboxEvent(event: InboxEvent): Promise<void> {
  if (!event.read) void updateInboxEvent(event, { read: true });
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
    if (activeProject?.id !== event.project_id || activeChatProjectId !== event.project_id) return;
    appendChatMessage(result.message);
    selectChatMessage(result.message.id);
    chatFollowLatest = false;
  } catch (error) {
    if (error instanceof ApiFailure && error.status === 404) {
      report('The source message is no longer available.', true);
      return;
    }
    report(error instanceof Error ? error.message : 'Could not open the source message.', true);
  }
}

function renderInboxIssues(): void {
  const projectCount = new Set(inboxIssues.map((issue) => issue.project_id)).size;
  myWorkTasksSummary.textContent = inboxIssues.length === 0
    ? 'Open issues assigned to you across your projects.'
    : `${inboxIssues.length} open ${inboxIssues.length === 1 ? 'issue' : 'issues'} assigned to you in ${projectCount} ${projectCount === 1 ? 'project' : 'projects'}.`;
  const openGroups = new Map(
    Array.from(myWorkTaskGroups.querySelectorAll<HTMLDetailsElement>('.my-work-task-group'))
      .map((group) => [group.dataset.groupKey ?? '', group.open] as const),
  );
  const selectedIssueId = myWorkTaskGroups.querySelector<HTMLElement>('.inbox-issue-card.is-keyboard-selected')?.dataset.issueId;
  const fragment = document.createDocumentFragment();
  for (const project of groupMyWorkTasks(inboxIssues)) {
    const projectSection = document.createElement('section');
    projectSection.className = 'my-work-project-group';
    projectSection.setAttribute('aria-label', project.projectName);
    const projectHeading = document.createElement('h2');
    projectHeading.className = 'my-work-project-heading';
    projectHeading.textContent = project.projectName;
    projectSection.append(projectHeading);

    for (const milestone of project.milestones) {
      const group = document.createElement('details');
      group.className = 'my-work-task-group';
      group.dataset.groupKey = milestone.key;
      group.open = openGroups.get(milestone.key) ?? true;
      const summary = document.createElement('summary');
      summary.className = 'my-work-task-group-summary';
      const name = document.createElement('span');
      name.className = 'my-work-task-group-name';
      name.textContent = milestone.name;
      const count = document.createElement('span');
      count.className = 'my-work-task-group-count';
      count.textContent = `${milestone.tasks.length} ${milestone.tasks.length === 1 ? 'task' : 'tasks'}`;
      summary.append(name, count);
      if (milestone.dueDate !== null) {
        const dueDate = document.createElement('span');
        dueDate.className = 'my-work-task-group-date';
        dueDate.textContent = `Due ${formatIssueDueDate(milestone.dueDate)}`;
        summary.append(dueDate);
      }

      const list = document.createElement('ul');
      list.className = 'issue-list inbox-issue-list';
      list.setAttribute('aria-label', `${project.projectName}, ${milestone.name}`);
      for (const issue of milestone.tasks) {
        const row = createInboxIssueRow(issue);
        if (String(issue.id) === selectedIssueId) row.classList.add('is-keyboard-selected');
        list.append(row);
      }
      group.append(summary, list);
      projectSection.append(group);
    }
    fragment.append(projectSection);
  }
  myWorkTaskGroups.replaceChildren(fragment);
  myWorkTasksEmptyState.textContent = 'You have no open issues assigned to you.';
  myWorkTasksEmptyState.hidden = inboxIssues.length > 0;
}

function createInboxIssueRow(issue: InboxIssue): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'issue-card inbox-issue-card';
  item.dataset.issueId = String(issue.id);

  const marker = document.createElement('span');
  marker.className = `inbox-marker is-${issue.status}`;
  marker.setAttribute('aria-hidden', 'true');
  const content = document.createElement('div');
  content.className = 'issue-content';
  const mainline = document.createElement('div');
  mainline.className = 'issue-mainline';
  const key = document.createElement('span');
  key.className = 'issue-key';
  key.textContent = `#${issue.id}`;
  const title = document.createElement('button');
  title.className = 'issue-title issue-title-button';
  title.type = 'button';
  title.textContent = issue.title;
  title.setAttribute('aria-label', `Open ${issue.title} in ${issue.project_name}`);
  title.addEventListener('click', () => void openInboxIssue(issue));
  const primary = document.createElement('div');
  primary.className = 'inbox-issue-primary';

  const metadata = document.createElement('div');
  metadata.className = 'issue-metadata inbox-issue-metadata';
  const status = document.createElement('span');
  status.className = `inbox-issue-status is-${issue.status}`;
  status.textContent = issueStatusLabel(issue.status);
  metadata.append(status);
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
    metadata.append(dueDate);
  }
  const discussionIndicator = createDiscussionIndicator(issue.discussion_count ?? 0);
  if (discussionIndicator !== null) metadata.append(discussionIndicator);
  primary.append(title, metadata);
  mainline.append(key, primary);
  content.append(mainline);
  const updated = document.createElement('time');
  updated.className = 'inbox-updated';
  updated.dateTime = issue.updated_at;
  updated.textContent = new Date(issue.updated_at).toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
  item.append(marker, content, updated);
  return item;
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
  stopChatPolling();
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
        chatView.replaceChildren(createProjectChat(projectId));
        switchProjectTab(tab);
        (tab === 'issues' ? issuesTabButton : tab === 'members' ? membersTabButton : notesTabButton).focus();
      },
      (error) => {
        workspaceViewHistory.length = 0;
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
    if (showingIssueDetail && selectedIssue !== null) scheduleIssueDiscussionPoll(selectedIssue.id);
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
    void loadProjectMembers(activeProject.id);
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

  reconcileIssueBoardGroups(groupIssues(visible).map((group) => ({
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
  reconcileIssueBoardGroups(groups);
}

function reconcileIssueBoardGroups(groups: IssueBoardGroup[]): void {
  const existingGroups = new Map(
    Array.from(issueList.querySelectorAll<HTMLDetailsElement>(':scope > .issue-group'))
      .map((group) => [group.dataset.groupKey ?? '', group]),
  );
  const existingRows = new Map(
    Array.from(issueList.querySelectorAll<HTMLLIElement>('.issue-card'))
      .map((row) => [Number(row.dataset.issueId), row]),
  );
  const expectedRowsByGroup = new Map<string, Set<number>>();
  const retainedGroupKeys = new Set<string>();

  for (const [groupIndex, group] of groups.entries()) {
    retainedGroupKeys.add(group.key);
    let details = existingGroups.get(group.key);
    if (details === undefined) {
      details = document.createElement('details');
      details.open = group.openByDefault ?? true;
      details.dataset.groupKey = group.key;
    }
    if (details.className !== group.className) details.className = group.className;
    const summary = details.querySelector<HTMLElement>(':scope > summary') ?? createIssueGroupSummary(group.name, group.issues.length);
    const groupName = summary.querySelector<HTMLElement>('.issue-group-name');
    const groupCount = summary.querySelector<HTMLElement>('.issue-group-count');
    if (groupName !== null) setTextContentIfChanged(groupName, group.name);
    if (groupCount !== null) setTextContentIfChanged(groupCount, String(group.issues.length));
    let bulkSelectToggle = summary.querySelector<HTMLButtonElement>(':scope > .issue-bulk-select-toggle');
    if (group.allowBulkMove === true) {
      if (bulkSelectToggle === null) {
        bulkSelectToggle = document.createElement('button');
        bulkSelectToggle.type = 'button';
        bulkSelectToggle.className = 'button button-secondary issue-bulk-select-toggle';
        bulkSelectToggle.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (bulkMovePending) return;
          if (bulkAssignSelectionMode) clearBulkAssignSelection();
          if (bulkMoveSelectionMode) clearBulkMoveSelection();
          else bulkMoveSelectionMode = true;
          details.open = true;
          renderProjectIssueBoard();
        });
        summary.append(bulkSelectToggle);
      }
      bulkSelectToggle.textContent = bulkMoveSelectionMode ? 'Cancel selection' : 'Select issues';
      bulkSelectToggle.disabled = bulkMovePending || (activeProject !== null && projectStatusIsReadOnly(activeProject.status));
    } else {
      bulkSelectToggle?.remove();
    }
    const isBulkMoveGroup = group.key === 'milestone:none' && group.allowBulkMove === true;
    let bulkToolbar = details.querySelector<HTMLDivElement>(':scope > .issue-bulk-move-toolbar');
    if (isBulkMoveGroup && bulkMoveSelectionMode) {
      if (bulkToolbar === null) bulkToolbar = createIssueBulkMoveToolbar(group.issues);
      syncIssueBulkMoveToolbar(bulkToolbar, group.issues);
    } else {
      bulkToolbar?.remove();
      bulkToolbar = null;
    }
    const rows = details.querySelector<HTMLUListElement>(':scope > .issue-group-items') ?? document.createElement('ul');
    rows.className = 'issue-group-items';
    const expectedIds = new Set<number>();
    for (const [rowIndex, issue] of group.issues.entries()) {
      expectedIds.add(issue.id);
      const reorder = group.reorderByIssueId?.get(issue.id);
      const allowBulkMoveSelection = isBulkMoveGroup && bulkMoveSelectionMode;
      const bulkMoveSelected = selectedBulkMoveIssueIds.has(issue.id);
      const allowBulkAssignSelection = bulkAssignSelectionMode;
      const bulkAssignSelected = selectedBulkAssignIssueIds.has(issue.id);
      const signature = issueRowSignature(
        issue,
        reorder,
        allowBulkMoveSelection,
        bulkMoveSelected,
        allowBulkAssignSelection,
        bulkAssignSelected,
      );
      const existing = existingRows.get(issue.id);
      let row: HTMLLIElement;
      if (existing !== undefined && issueRowRenderSignatures.get(existing) === signature) {
        row = existing;
      } else {
        row = createIssueRow(issue, reorder, allowBulkMoveSelection, allowBulkAssignSelection) as HTMLLIElement;
        row.classList.toggle('is-keyboard-selected', selectedIssue?.id === issue.id);
        issueRowRenderSignatures.set(row, signature);
        if (existing !== undefined) replaceIssueRowPreservingFocus(existing, row);
      }
      placeNodeAtPosition(rows, row, rowIndex);
    }
    if (bulkToolbar !== null) syncIssueBulkMoveToolbar(bulkToolbar, group.issues);
    expectedRowsByGroup.set(group.key, expectedIds);
    placeNodeAtPosition(details, summary, 0);
    if (bulkToolbar !== null) placeNodeAtPosition(details, bulkToolbar, 1);
    placeNodeAtPosition(details, rows, bulkToolbar === null ? 1 : 2);
    placeNodeAtPosition(issueList, details, groupIndex);
  }

  for (const group of Array.from(issueList.querySelectorAll<HTMLDetailsElement>(':scope > .issue-group'))) {
    const key = group.dataset.groupKey ?? '';
    if (!retainedGroupKeys.has(key)) {
      group.remove();
      continue;
    }
    const expected = expectedRowsByGroup.get(key) ?? new Set<number>();
    group.querySelectorAll<HTMLLIElement>(':scope > .issue-group-items > .issue-card').forEach((row) => {
      if (!expected.has(Number(row.dataset.issueId))) row.remove();
    });
  }
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

function issueRowSignature(
  issue: Issue,
  reorder: { canMoveEarlier?: boolean; canMoveLater?: boolean; showMilestoneTag?: boolean } | undefined,
  allowBulkMoveSelection = false,
  bulkMoveSelected = false,
  allowBulkAssignSelection = false,
  bulkAssignSelected = false,
): string {
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

function createIssueGroupSummary(name: string, count: number): HTMLElement {
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
  restoreButton.addEventListener('click', () => void restoreIssue(issue, restoreButton));
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
  renderIssuePullRequests();
}

function renderIssuePullRequests(message = ''): void {
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

async function loadIssuePullRequests(issueId: number): Promise<void> {
  const requestVersion = ++issuePullRequestsRequestVersion;
  renderIssuePullRequests('Loading pull requests…');
  try {
    const result = await api<{ pull_requests: LinkedPullRequest[] }>(`/issues/${issueId}/pull-requests`);
    if (requestVersion !== issuePullRequestsRequestVersion || selectedIssue?.id !== issueId) return;
    linkedPullRequests = result.pull_requests;
    renderIssuePullRequests();
  } catch (error) {
    if (requestVersion !== issuePullRequestsRequestVersion || selectedIssue?.id !== issueId) return;
    linkedPullRequests = [];
    renderIssuePullRequests(error instanceof Error ? error.message : 'Could not load linked pull requests.');
  }
}

async function unlinkIssuePullRequest(issueId: number, pullRequestId: number, button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  try {
    await api(`/issues/${issueId}/pull-requests/${pullRequestId}`, { method: 'DELETE' });
    await loadIssuePullRequests(issueId);
  } catch (error) {
    button.disabled = false;
    report(error instanceof Error ? error.message : 'Could not unlink pull request.', true);
  }
}

async function loadIssueStatusHistory(issueId: number): Promise<void> {
  const requestVersion = ++issueStatusHistoryRequestVersion;
  issueStatusHistory.hidden = false;
  issueStatusHistoryCount.textContent = '…';
  issueStatusHistoryList.replaceChildren();
  issueStatusHistoryEmpty.hidden = false;
  issueStatusHistoryEmpty.textContent = 'Loading status history…';
  try {
    const result = await api<{ transitions: IssueStatusTransition[] }>(`/issues/${issueId}/history`);
    if (requestVersion !== issueStatusHistoryRequestVersion || selectedIssue?.id !== issueId) return;
    issueStatusHistoryCount.textContent = String(result.transitions.length);
    issueStatusHistoryEmpty.hidden = result.transitions.length > 0;
    issueStatusHistoryEmpty.textContent = 'No status changes yet.';
    issueStatusHistoryList.replaceChildren(...result.transitions.map(createIssueStatusHistoryRow));
  } catch (error) {
    if (requestVersion !== issueStatusHistoryRequestVersion || selectedIssue?.id !== issueId) return;
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

function stopIssueDiscussionPolling(): void {
  if (issueDiscussionPollTimer !== null) window.clearTimeout(issueDiscussionPollTimer);
  issueDiscussionPollTimer = null;
  issueDiscussionRequestVersion += 1;
}

function clearIssueDiscussion(): void {
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

function scheduleIssueDiscussionPoll(issueId: number): void {
  if (issueDiscussionPollTimer !== null) window.clearTimeout(issueDiscussionPollTimer);
  issueDiscussionPollTimer = null;
  if (selectedIssue?.id !== issueId || issueDetailView.hidden) return;
  issueDiscussionPollTimer = window.setTimeout(() => {
    issueDiscussionPollTimer = null;
    void loadIssueDiscussion(issueId, false);
  }, 5_000);
}

async function loadIssueDiscussion(issueId: number, showLoading = true): Promise<void> {
  const requestVersion = ++issueDiscussionRequestVersion;
  if (showLoading) issueDiscussionStatus.textContent = 'Loading discussion…';
  try {
    const result = await api<{ messages: IssueDiscussionMessage[] }>(`/issues/${issueId}/discussion`);
    if (requestVersion !== issueDiscussionRequestVersion || selectedIssue?.id !== issueId) return;
    const changed = result.messages.length !== issueDiscussionMessages.length
      || result.messages.some((message, index) => {
        const current = issueDiscussionMessages[index];
        return current === undefined || current.id !== message.id || current.body !== message.body
          || current.parent_id !== message.parent_id;
      });
    issueDiscussionMessages = result.messages;
    issueDiscussionStatus.textContent = '';
    updateProjectIssueDiscussionCount(issueId, result.messages.length);
    if (changed) renderIssueDiscussion();
  } catch (error) {
    if (requestVersion !== issueDiscussionRequestVersion || selectedIssue?.id !== issueId) return;
    if (error instanceof ApiFailure && error.status === 401) {
      showSignedOut();
      return;
    }
    issueDiscussionStatus.textContent = error instanceof Error ? error.message : 'Could not load the discussion.';
  } finally {
    scheduleIssueDiscussionPoll(issueId);
  }
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
  inboxIssues = inboxIssues.map((issue) => issue.id === issueId && (issue.discussion_count ?? 0) !== count
    ? { ...issue, discussion_count: count }
    : issue);
  if (!inboxView.hidden && myWorkTab === 'tasks') renderInboxIssues();
}

function renderIssueDiscussion(): void {
  issueDiscussionCount.textContent = String(issueDiscussionMessages.length);
  issueDiscussionEmpty.hidden = issueDiscussionMessages.length > 0;
  const existing = new Map(
    Array.from(issueDiscussionList.querySelectorAll<HTMLLIElement>('.issue-discussion-message'))
      .map((item) => [Number(item.dataset.messageId), item] as const),
  );
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
      const oldEditInput = current.querySelector<HTMLTextAreaElement>('[data-discussion-edit-input]');
      const newEditInput = item.querySelector<HTMLTextAreaElement>('[data-discussion-edit-input]');
      if (oldEditInput !== null && newEditInput !== null && isEditing) newEditInput.value = oldEditInput.value;
      current.replaceWith(item);
      existing.delete(message.id);
    } else {
      issueDiscussionList.append(item);
    }
  }
  existing.forEach((item) => item.remove());
}

function canEditIssueDiscussionMessage(message: IssueDiscussionMessage): boolean {
  return activeUser !== null
    && message.author_id === activeUser.id
    && issueDiscussionMessages.at(-1)?.id === message.id
    && activeProject !== null
    && !projectStatusIsReadOnly(activeProject.status);
}

function issueDiscussionMessageElements(): HTMLElement[] {
  return Array.from(issueDiscussionList.querySelectorAll<HTMLElement>('.issue-discussion-message'));
}

function selectIssueDiscussionMessage(id: number, focus = true): void {
  const item = issueDiscussionList.querySelector<HTMLElement>(`.issue-discussion-message[data-message-id="${id}"]`);
  if (item === null) return;
  selectedIssueDiscussionMessageId = id;
  issueDiscussionMessageElements().forEach((message) => {
    message.classList.toggle('is-keyboard-selected', message === item);
  });
  if (focus) item.focus();
}

function moveIssueDiscussionSelection(direction: -1 | 1): void {
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
  if (next !== undefined) selectIssueDiscussionMessage(Number(next.dataset.messageId));
}

function moveIssueDiscussionSelectionToBoundary(edge: 'first' | 'last'): void {
  const messages = issueDiscussionMessageElements();
  const target = messages[edge === 'first' ? 0 : messages.length - 1];
  if (target !== undefined) selectIssueDiscussionMessage(Number(target.dataset.messageId));
}

function moveIssueDiscussionSelectionByPage(direction: -1 | 1): void {
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
  if (target !== undefined) selectIssueDiscussionMessage(Number(target.dataset.messageId));
}

function replyToSelectedIssueDiscussionMessage(): void {
  if (selectedIssueDiscussionMessageId === null) return;
  const message = issueDiscussionMessages.find((candidate) => candidate.id === selectedIssueDiscussionMessageId);
  if (message !== undefined) setIssueDiscussionReply(message);
}

function createIssueDiscussionMessage(
  message: IssueDiscussionMessage,
  canEdit: boolean,
  isEditing: boolean,
  isConfirmingDelete: boolean,
): HTMLLIElement {
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
      const parentMessage = issueDiscussionList.querySelector<HTMLElement>(`[data-message-id="${message.parent_id}"]`);
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
  } else if (canEdit && isConfirmingDelete) {
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
      issueDiscussionList.querySelector<HTMLButtonElement>(`[data-message-id="${message.id}"] [data-discussion-delete-begin]`)?.focus();
    });
    actions.append(prompt, confirm, cancel);
  } else if (canEdit) {
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
      issueDiscussionList.querySelector<HTMLTextAreaElement>(`[data-message-id="${message.id}"] [data-discussion-edit-input]`)?.focus();
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
      issueDiscussionList.querySelector<HTMLButtonElement>(`[data-message-id="${message.id}"] [data-discussion-delete]`)?.focus();
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
      issueDiscussionList.querySelector<HTMLButtonElement>(`[data-message-id="${message.id}"] [data-discussion-edit]`)?.focus();
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
  } else {
    const body = document.createElement('p');
    body.className = 'issue-discussion-body';
    body.textContent = message.body;
    item.append(heading, body);
  }
  return item;
}

async function saveIssueDiscussionMessage(messageId: number, body: string, button: HTMLButtonElement): Promise<void> {
  const issueId = selectedIssue?.id;
  if (issueId === undefined || body.trim() === '') return;
  button.disabled = true;
  try {
    const result = await api<{ message: IssueDiscussionMessage }>(`/issues/${issueId}/discussion/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    });
    if (selectedIssue?.id !== issueId) return;
    issueDiscussionMessages = issueDiscussionMessages.map((message) => message.id === messageId ? result.message : message);
    editingIssueDiscussionMessageId = null;
    issueDiscussionStatus.textContent = 'Message updated.';
    renderIssueDiscussion();
    issueDiscussionList.querySelector<HTMLButtonElement>(`[data-message-id="${messageId}"] [data-discussion-edit]`)?.focus();
  } catch (error) {
    issueDiscussionStatus.textContent = error instanceof Error ? error.message : 'Could not update the message.';
  } finally {
    button.disabled = false;
  }
}

async function deleteIssueDiscussionMessage(messageId: number, button: HTMLButtonElement): Promise<void> {
  const issueId = selectedIssue?.id;
  if (issueId === undefined) return;
  button.disabled = true;
  try {
    await api(`/issues/${issueId}/discussion/${messageId}`, { method: 'DELETE' });
    if (selectedIssue?.id !== issueId) return;
    issueDiscussionMessages = issueDiscussionMessages.filter((message) => message.id !== messageId);
    confirmingIssueDiscussionDeleteId = null;
    updateProjectIssueDiscussionCount(issueId, issueDiscussionMessages.length);
    issueDiscussionStatus.textContent = 'Message deleted.';
    renderIssueDiscussion();
    const latest = issueDiscussionMessages.at(-1);
    if (latest === undefined) issueDiscussionHeading.focus();
    else selectIssueDiscussionMessage(latest.id);
  } catch (error) {
    issueDiscussionStatus.textContent = error instanceof Error ? error.message : 'Could not delete the message.';
  } finally {
    button.disabled = false;
  }
}

function setIssueDiscussionReply(message: IssueDiscussionMessage): void {
  selectIssueDiscussionMessage(message.id, false);
  issueDiscussionParent = message;
  const excerpt = message.body.length > 100 ? `${message.body.slice(0, 100)}…` : message.body;
  issueDiscussionReplyLabel.textContent = `Replying to ${message.author_name}: ${excerpt}`;
  issueDiscussionReplyContext.hidden = false;
  issueDiscussionInput.focus();
}

function clearIssueDiscussionReply(): void {
  issueDiscussionParent = null;
  issueDiscussionReplyLabel.textContent = '';
  issueDiscussionReplyContext.hidden = true;
}

async function postIssueDiscussionMessage(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const issueId = selectedIssue?.id;
  const body = issueDiscussionInput.value.trim();
  if (issueId === undefined || body === '') return;
  const parentId = issueDiscussionParent?.id ?? null;
  issueDiscussionSubmit.disabled = true;
  issueDiscussionStatus.textContent = '';
  try {
    const result = await api<{ message: IssueDiscussionMessage }>(`/issues/${issueId}/discussion`, {
      method: 'POST',
      body: JSON.stringify({ body, parent_id: parentId }),
    });
    if (selectedIssue?.id !== issueId) return;
    issueDiscussionMessages.push(result.message);
    editingIssueDiscussionMessageId = null;
    confirmingIssueDiscussionDeleteId = null;
    updateProjectIssueDiscussionCount(issueId, issueDiscussionMessages.length);
    renderIssueDiscussion();
    if (issueDiscussionInput.value.trim() === body) issueDiscussionInput.value = '';
    if (issueDiscussionParent?.id === parentId) clearIssueDiscussionReply();
    issueDiscussionList.querySelector<HTMLElement>(`[data-message-id="${result.message.id}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    issueDiscussionInput.focus();
  } catch (error) {
    if (error instanceof ApiFailure && error.status === 401) {
      showSignedOut();
      return;
    }
    issueDiscussionStatus.textContent = error instanceof Error ? error.message : 'Could not send the message.';
  } finally {
    issueDiscussionSubmit.disabled = false;
  }
}

function createIssueStatusHistoryRow(transition: IssueStatusTransition): HTMLLIElement {
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

function focusIssueTitleButton(issueId: number): boolean {
  const button = issueList.querySelector<HTMLButtonElement>(
    `.issue-card[data-issue-id="${issueId}"] .issue-title-button`,
  );
  if (button === null) return false;
  button.focus();
  return true;
}

function closeIssueDetailEditForm(): void {
  resetIssueDetailEditForm();
  issueDetailEditForm.hidden = true;
  issueDetailDisplay.hidden = false;
  if (!issueDetailView.hidden) issueDetailEditButton.focus();
}

function resetIssueDetailEditForm(): void {
  issueDetailEditForm.reset();
  issueDetailOngoingInput.disabled = false;
  issueDetailOngoingInput.title = '';
  updateOngoingMilestoneControl(issueDetailOngoingInput, issueDetailMilestoneInput);
}

function openIssue(issue: Issue): void {
  stopIssueDiscussionPolling();
  selectedIssue = issue;
  linkedPullRequests = [];
  issueDiscussionMessages = [];
  selectedIssueDiscussionMessageId = null;
  issueDiscussionList.replaceChildren();
  issueDiscussionInput.value = '';
  clearIssueDiscussionReply();
  renderIssueDiscussion();
  issueList.querySelectorAll<HTMLElement>('.issue-card').forEach((row) => {
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

function openIssueStatusPicker(issue: Issue, returnFocus: HTMLElement): void {
  if (issueStatusPicker.open) issueStatusPicker.close();
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

function focusIssueStatusPickerOption(index: number): void {
  const options = Array.from(issueStatusPickerOptions.querySelectorAll<HTMLButtonElement>('.issue-status-option'));
  if (options.length === 0) return;
  issueStatusPickerOptionIndex = Math.max(0, Math.min(options.length - 1, index));
  options.forEach((option, optionIndex) => {
    const active = optionIndex === issueStatusPickerOptionIndex;
    option.classList.toggle('is-active', active);
    option.setAttribute('aria-selected', String(active));
    option.tabIndex = active ? 0 : -1;
  });
  options[issueStatusPickerOptionIndex]?.focus();
}

function closeIssueStatusPicker(): void {
  if (issueStatusPicker.open) issueStatusPicker.close();
}

function openIssueDeleteConfirmation(issue: Issue | null = selectedIssue): void {
  if (issue === null) return;
  issueDeleteTarget = issue;
  issueDeleteDescription.textContent = `“${issue.title}” is currently ${issueStatusLabel(issue.status)}. It will be moved to Deleted issues, where you can restore it later.`;
  issueDeleteError.textContent = '';
  issueDeleteError.hidden = true;
  issueDeleteConfirmation.showModal();
  issueDeleteCancel.focus();
}

function closeIssueDeleteConfirmation(): void {
  if (issueDeleteConfirmation.open) issueDeleteConfirmation.close();
  issueDeleteTarget = null;
  issueDeleteError.textContent = '';
  issueDeleteError.hidden = true;
  issueDeleteConfirm.disabled = false;
}

async function deleteSelectedIssue(): Promise<void> {
  const issue = issueDeleteTarget;
  const projectId = activeProject?.id;
  if (issue === null || projectId !== issue.project_id) return;

  issueDeleteConfirm.disabled = true;
  issueDeleteError.textContent = '';
  issueDeleteError.hidden = true;
  try {
    await api<void>(`/issues/${issue.id}`, { method: 'DELETE' });
    closeIssueDeleteConfirmation();
    if (activeProject?.id !== projectId) return;
    if (selectedIssue?.id === issue.id) {
      selectedIssue = null;
      resetIssueDetailEditForm();
      issueDetailEditForm.hidden = true;
      issueDetailDisplay.hidden = false;
      switchProjectTab('issues', issue.id);
      if (!deletedIssuesDetails.open) void loadDeletedProjectIssues(projectId);
    } else {
      await loadProjectIssues(projectId);
      if (!deletedIssuesDetails.open) await loadDeletedProjectIssues(projectId);
      if (!focusIssueTitleButton(issue.id)) issueFilter.focus();
    }
    report('Issue moved to Deleted issues. You can restore it from the issue list.');
  } catch (error) {
    if (error instanceof ApiFailure && error.status === 401) {
      closeIssueDeleteConfirmation();
      showSignedOut();
      return;
    }
    issueDeleteError.textContent = error instanceof Error ? error.message : 'Could not delete the issue.';
    issueDeleteError.hidden = false;
    issueDeleteConfirm.focus();
  } finally {
    issueDeleteConfirm.disabled = false;
  }
}

async function restoreIssue(issue: Issue, restoreButton: HTMLButtonElement): Promise<void> {
  restoreButton.disabled = true;
  try {
    await api<{ issue: Issue }>(`/issues/${issue.id}/restore`, { method: 'POST' });
    await loadProjectIssues(issue.project_id);
    if (!focusIssueTitleButton(issue.id)) issuesTabButton.focus();
    report('Issue restored.');
  } catch (error) {
    report(error instanceof Error ? error.message : 'Could not restore the issue.', true);
  } finally {
    restoreButton.disabled = false;
  }
}

function showDeletedIssues(restoreIssueId?: number): void {
  const projectId = activeProject?.id;
  if (projectId === undefined || deletedProjectIssues.length === 0) return;

  selectedIssue = null;
  resetIssueDetailEditForm();
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

async function applyIssueStatusPickerSelection(): Promise<void> {
  const issue = issueStatusPickerIssue;
  const status = issue === null ? undefined : issueStatusOptions(issue)[issueStatusPickerOptionIndex]?.value;
  if (issue === null || status === undefined) return;
  closeIssueStatusPicker();
  if (status !== issue.status) await updateIssueStatus(issue, status);
  if (activeProject?.id !== issue.project_id) return;
  if (issueDetailView.hidden) {
    if (!focusIssueTitleButton(issue.id)) issuesTabButton.focus();
  } else {
    issueDetailStatus.focus();
  }
}

function createIssueStatusButton(issue: Issue): HTMLButtonElement {
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
      if (previousStatus !== result.issue.status) void loadIssueStatusHistory(issue.id);
    }
    report('Issue status updated.');
    if (issueDetailView.hidden) await loadProjectIssues(issue.project_id);
  } catch (error) {
    report(error instanceof Error ? error.message : 'Could not update the issue status.', true);
  }
}

function createIssueRow(
  issue: Issue,
  reorder?: { canMoveEarlier?: boolean; canMoveLater?: boolean; showMilestoneTag?: boolean },
  allowBulkMoveSelection = false,
  allowBulkAssignSelection = false,
): HTMLElement {
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
  let sharedIndicator: HTMLSpanElement | null = null;
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
  if (sharedIndicator !== null) statusColumn.append(sharedIndicator);

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
    if (allowBulkMoveSelection) actions.append(createIssueBulkSelectCheckbox(issue));
    if (allowBulkAssignSelection) actions.append(createIssueBulkAssignCheckbox(issue));
    if (discussionIndicator !== null) actions.append(discussionIndicator);
    actions.append(createIssueStatusButton(issue));
    item.append(content, actions);
  } else {
    const actions = document.createElement('div');
    actions.className = 'issue-row-actions';
    if (allowBulkMoveSelection) actions.append(createIssueBulkSelectCheckbox(issue));
    if (allowBulkAssignSelection) actions.append(createIssueBulkAssignCheckbox(issue));
    if (discussionIndicator !== null) actions.append(discussionIndicator);
    for (const direction of ['up', 'down'] as const) {
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

function createDiscussionIndicator(count: number): HTMLSpanElement | null {
  const label = discussionIndicatorLabel(count);
  if (label === null) return null;
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

function issueAiPromptDraft(issue: Issue): Issue {
  return {
    ...issue,
    context: issueAiPromptContext.value.trim(),
    expected_outcome: issueAiPromptOutcome.value.trim(),
    acceptance_criteria: issueAiPromptCriteria.value.trim(),
  };
}

function issueAiPromptHasChanges(issue: Issue): boolean {
  return issueAiPromptContext.value.trim() !== issue.context
    || issueAiPromptOutcome.value.trim() !== issue.expected_outcome
    || issueAiPromptCriteria.value.trim() !== issue.acceptance_criteria;
}

function renderIssueAiPromptStep(): void {
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

function updateIssueAiPromptDraft(): void {
  if (selectedIssue === null) return;
  issueAiPromptStatus.textContent = issueAiPromptHasChanges(selectedIssue) ? 'Unsaved context changes.' : '';
  issueAiPromptStatus.classList.remove('is-error');
  issueAiPromptSaveButton.disabled = !issueAiPromptHasChanges(selectedIssue);
  if (issueAiPromptStepIndex === issueAiPromptSteps.length - 1) renderIssueAiPromptStep();
}

function openIssueAiPrompt(): void {
  if (selectedIssue === null) return;
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

async function saveIssueAiPromptContext(): Promise<void> {
  const issue = selectedIssue;
  if (issue === null || !issueAiPromptHasChanges(issue)) return;
  const draft = issueAiPromptDraft(issue);
  issueAiPromptSaveButton.disabled = true;
  issueAiPromptStatus.classList.remove('is-error');
  issueAiPromptStatus.textContent = 'Saving prompt context…';
  try {
    const result = await api<{ issue: Issue }>(`/issues/${issue.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        context: draft.context,
        expected_outcome: draft.expected_outcome,
        acceptance_criteria: draft.acceptance_criteria,
      }),
    });
    if (selectedIssue?.id !== issue.id || activeProject?.id !== issue.project_id) return;
    selectedIssue = result.issue;
    projectIssues = projectIssues.map((candidate) => candidate.id === issue.id ? result.issue : candidate);
    renderIssueDetail();
    renderProjectIssueBoard();
    issueAiPromptSaveButton.disabled = true;
    issueAiPromptStatus.textContent = 'Prompt context saved to this issue.';
  } catch (error) {
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

async function copyIssueAiPrompt(text: string, message: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    issueAiPromptStatus.classList.remove('is-error');
    issueAiPromptStatus.textContent = message;
  } catch {
    issueAiPromptPreview.value = text;
    issueAiPromptPreview.focus();
    issueAiPromptPreview.select();
    issueAiPromptStatus.classList.remove('is-error');
    issueAiPromptStatus.textContent = 'Clipboard unavailable. Export text selected for copying.';
  }
}

function downloadIssueMarkdown(issue: Issue): void {
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
  if (selectedIssue === null) return;
  const prompt = formatIssuePrompt(issueAiPromptDraft(selectedIssue));
  issueAiPromptPreview.value = prompt;
  void copyIssueAiPrompt(prompt, 'Prompt copied.');
});
issueAiPromptCopyMarkdownButton.addEventListener('click', () => {
  if (selectedIssue === null) return;
  void copyIssueAiPrompt(formatIssueMarkdown(issueAiPromptDraft(selectedIssue)), 'Markdown copied.');
});
issueAiPromptDownloadButton.addEventListener('click', () => {
  if (selectedIssue === null) return;
  downloadIssueMarkdown(issueAiPromptDraft(selectedIssue));
  issueAiPromptStatus.classList.remove('is-error');
  issueAiPromptStatus.textContent = 'Markdown downloaded.';
});

issueDetailEditButton.addEventListener('click', () => {
  if (selectedIssue === null) return;
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
  if (selectedIssue === null || activeProject === null) return;
  const issue = selectedIssue;
  issueDetailSaveButton.disabled = true;
  try {
    const result = await api<{ issue: Issue }>(`/issues/${issue.id}`, {
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
    if (selectedIssue?.id !== issue.id || activeProject?.id !== issue.project_id) return;
    selectedIssue = result.issue;
    projectIssues = projectIssues.map((candidate) => candidate.id === issue.id ? result.issue : candidate);
    renderIssueDetail();
    renderProjectIssueBoard();
    closeIssueDetailEditForm();
    report('Issue updated.');
  } catch (error) {
    if (selectedIssue?.id === issue.id && activeProject?.id === issue.project_id) {
      issueDetailTitleInput.focus();
    }
    report(error instanceof Error ? error.message : 'Could not update the issue.', true);
  } finally {
    issueDetailSaveButton.disabled = false;
  }
});

issueDetailSharedInput.addEventListener('change', () => {
  if (!issueDetailSharedInput.checked) issueDetailApprovalInput.checked = false;
  issueDetailApprovalInput.disabled = !issueDetailSharedInput.checked;
});

issueDetailStatus.addEventListener('click', () => {
  if (selectedIssue !== null) openIssueStatusPicker(selectedIssue, issueDetailStatus);
});

issueSourceLink.addEventListener('click', async (event) => {
  event.preventDefault();
  const issue = selectedIssue;
  const projectId = activeProject?.id;
  const messageId = Number(issueSourceLink.dataset.messageId);
  if (issue === null || projectId === undefined || !Number.isSafeInteger(messageId) || messageId < 1) return;

  let sourceMessage = chatMessageList?.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`) ?? null;
  if (sourceMessage === null) {
    try {
      const result = await api<{ messages: ChatMessage[] }>(`/projects/${projectId}/messages?since=${messageId - 1}`);
      if (activeProject?.id !== projectId || selectedIssue?.id !== issue.id) return;
      for (const message of result.messages) appendChatMessage(message);
      sourceMessage = chatMessageList?.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`) ?? null;
    } catch (error) {
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

async function loadProjectMembers(projectId: number): Promise<void> {
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
    const result = await api<{ users: User[] }>('/users');
    if (activeProject?.id !== projectId || membersView.hidden) return;
    memberSelect.replaceChildren();
    const availableMembers = result.users.filter(
      (user) => !activeProjectMembers.some((member) => member.id === user.id),
    );
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
  } catch (error) {
    if (activeProject?.id === projectId && !membersView.hidden) {
      memberAddStatus.textContent = 'Could not load available members.';
      memberAddStatus.hidden = false;
    }
    report(error instanceof Error ? error.message : 'Could not load workspace users.', true);
  }
}

function openMemberRemovalConfirmation(member: Member, button: HTMLButtonElement): void {
  memberRemovalTarget = { member, button };
  memberRemovalDescription.textContent = `“${member.name}” will be removed from the project.`;
  memberRemovalConfirmation.showModal();
  memberRemovalCancel.focus();
}

function closeMemberRemovalConfirmation(): void {
  if (memberRemovalConfirmation.open) memberRemovalConfirmation.close();
  memberRemovalTarget = null;
  memberRemovalConfirm.disabled = false;
}

async function confirmMemberRemoval(): Promise<void> {
  const target = memberRemovalTarget;
  if (target === null) return;
  closeMemberRemovalConfirmation();
  await removeProjectMember(target.member, target.button);
}

async function removeProjectMember(member: Member, removeButton: HTMLButtonElement): Promise<void> {
  const projectId = activeProject?.id;
  if (projectId === undefined) return;

  const memberIndex = activeProjectMembers.findIndex((candidate) => candidate.id === member.id);
  removeButton.disabled = true;
  try {
    await api<void>(`/projects/${projectId}/members/${member.id}`, { method: 'DELETE' });
    if (activeProject?.id === projectId) {
      await loadProjectDetail(projectId, 'members');
      if (activeProject?.id === projectId && !membersView.hidden) {
        const nextIndex = Math.min(memberIndex, activeProjectMembers.length - 1);
        const nextMember = activeProjectMembers[nextIndex];
        const nextRemoveButton = nextMember === undefined
          ? null
          : memberList.querySelector<HTMLButtonElement>(`button[data-user-id="${nextMember.id}"]`);
        (nextRemoveButton ?? memberSelect).focus();
      }
    }
    report(`${member.name} removed from the project.`);
  } catch (error) {
    report(error instanceof Error ? error.message : 'Could not remove the project member.', true);
  } finally {
    removeButton.disabled = false;
  }
}

memberRemovalCancel.addEventListener('click', closeMemberRemovalConfirmation);
memberRemovalConfirm.addEventListener('click', () => void confirmMemberRemoval());
workspaceMemberDeactivationCancel.addEventListener('click', () => closeWorkspaceMemberDeactivationConfirmation());
workspaceMemberDeactivationDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeWorkspaceMemberDeactivationConfirmation();
});
workspaceMemberDeactivationConfirm.addEventListener('click', () => {
  const target = workspaceMemberDeactivationTarget;
  if (target === null) return;
  closeWorkspaceMemberDeactivationConfirmation(false);
  void setWorkspaceMemberActive(target.member, false);
});
workspaceMemberRoleCancel.addEventListener('click', () => closeWorkspaceMemberRoleConfirmation());
workspaceMemberRoleDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeWorkspaceMemberRoleConfirmation();
});
workspaceMemberRoleConfirm.addEventListener('click', () => {
  const target = workspaceMemberRoleChangeTarget;
  if (target === null) return;
  closeWorkspaceMemberRoleConfirmation(false);
  void setWorkspaceMemberRole(target.member, target.role, target.select);
});
workspaceGuestProjectsCancel.addEventListener('click', () => closeWorkspaceGuestProjectAccess());
workspaceGuestProjectsDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeWorkspaceGuestProjectAccess();
});
workspaceGuestProjectsSave.addEventListener('click', () => void saveWorkspaceGuestProjectAccess());

function updateMembersPanelTabIndex(): void {
  const hasFocusableContent = Array.from(membersView.querySelectorAll<HTMLElement>(
    'a[href], button, input, select, textarea, [tabindex]',
  )).some((element) => element.tabIndex >= 0 && !element.matches(':disabled') && element.closest('[hidden]') === null);
  membersView.tabIndex = hasFocusableContent ? -1 : 0;
}

function consumeCredentialFragment(): CredentialFragment | null {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const inviteToken = fragment.get('invite');
  const resetToken = fragment.get('reset');
  const credential = inviteToken !== null
    ? { type: 'invite' as const, token: inviteToken }
    : resetToken !== null ? { type: 'reset' as const, token: resetToken } : null;
  if (credential === null || !/^[a-f0-9]{64}$/.test(credential.token)) return null;
  history.replaceState(null, '', location.pathname + location.search);
  return credential;
}

function resetAuthForms(): void {
  credentialFragment = null;
  invitePreview = null;
  loginForm.reset();
  loginForm.hidden = false;
  loginAdminHelp.hidden = true;
  credentialFlow.hidden = true;
  credentialFlowError.hidden = true;
  credentialFlowError.textContent = '';
  credentialForm.reset();
  credentialSubmit.hidden = false;
  credentialSubmit.disabled = false;
  setCredentialCancelSecondary();
  loginStatusMessage.hidden = false;
  loginKeyboardHints.hidden = false;
  const password = credentialForm.elements.namedItem('password');
  const confirmation = credentialForm.elements.namedItem('confirmation');
  const verificationCode = credentialForm.elements.namedItem('verification_code');
  credentialPasswordLabel.textContent = 'New password';
  credentialVerificationField.hidden = true;
  credentialVerificationInput.required = false;
  credentialConfirmationField.hidden = false;
  if (password instanceof HTMLInputElement) password.required = true;
  if (confirmation instanceof HTMLInputElement) confirmation.required = true;
  if (verificationCode instanceof HTMLInputElement) verificationCode.value = '';
  credentialPasswordFields.hidden = true;
}

function showCredentialFlow(): void {
  loginForm.hidden = true;
  loginAdminHelp.hidden = true;
  credentialFlow.hidden = false;
  loginStatusMessage.hidden = true;
  loginKeyboardHints.hidden = true;
  credentialFlowError.hidden = true;
  credentialFlowError.textContent = '';
}

function setCredentialCancelPrimary(): void {
  credentialCancel.classList.remove('auth-text-button');
  credentialCancel.classList.add('button', 'button-primary');
  credentialCancel.textContent = 'Back to sign in';
}

function setCredentialCancelSecondary(): void {
  credentialCancel.classList.remove('button', 'button-primary');
  credentialCancel.classList.add('auth-text-button');
  credentialCancel.textContent = 'Back to sign in';
}

async function openCredentialFlow(credential: CredentialFragment): Promise<void> {
  credentialFragment = credential;
  showCredentialFlow();
  if (credential.type === 'reset') {
    credentialFlowHeading.textContent = 'Choose a new password';
    credentialFlowDescription.textContent = 'Your workspace admin provided this one-time reset link. Use at least 15 characters; spaces and Unicode are allowed.';
    credentialPasswordFields.hidden = false;
    credentialPasswordLabel.textContent = 'New password';
    credentialVerificationField.hidden = true;
    credentialVerificationInput.required = false;
    credentialConfirmationField.hidden = false;
    credentialSubmit.textContent = 'Reset password';
    const password = credentialForm.elements.namedItem('password');
    const confirmation = credentialForm.elements.namedItem('confirmation');
    if (password instanceof HTMLInputElement) {
      password.required = true;
      password.autocomplete = 'new-password';
    }
    if (confirmation instanceof HTMLInputElement) confirmation.required = true;
    credentialForm.querySelector<HTMLInputElement>('input[name="password"]')?.focus();
    return;
  }

  credentialFlowHeading.textContent = 'Accept workspace invite';
  credentialFlowDescription.textContent = 'Checking invite…';
  credentialSubmit.disabled = true;
  try {
    const result = await api<{ invite: InvitePreview }>('/auth/invites/inspect', {
      method: 'POST',
      body: JSON.stringify({ token: credential.token }),
    });
    invitePreview = result.invite;
    const presentation = inviteCredentialPresentation(
      result.invite.password_setup_required,
      result.invite.email_verification_required,
    );
    credentialFlowDescription.textContent = `You’re invited to join “${result.invite.workspace_name}” as a ${result.invite.role}. ${presentation.description}`;
    credentialPasswordFields.hidden = !result.invite.password_required;
    const password = credentialForm.elements.namedItem('password');
    const confirmation = credentialForm.elements.namedItem('confirmation');
    credentialPasswordLabel.textContent = presentation.passwordLabel;
    credentialVerificationField.hidden = !presentation.showVerificationCode;
    credentialVerificationInput.required = presentation.showVerificationCode;
    credentialConfirmationField.hidden = !presentation.showConfirmation;
    if (password instanceof HTMLInputElement) password.required = result.invite.password_required;
    if (password instanceof HTMLInputElement) password.autocomplete = presentation.passwordAutocomplete;
    if (confirmation instanceof HTMLInputElement) confirmation.required = presentation.showConfirmation;
    credentialSubmit.textContent = presentation.submitLabel;
    credentialSubmit.disabled = false;
    if (presentation.showVerificationCode) credentialVerificationInput.focus();
    else if (result.invite.password_required) credentialForm.querySelector<HTMLInputElement>('input[name="password"]')?.focus();
    else credentialSubmit.focus();
  } catch (error) {
    credentialFlowDescription.textContent = 'This invite link cannot be used.';
    credentialFlowError.textContent = error instanceof Error ? error.message : 'This invite link is invalid or expired.';
    credentialFlowError.hidden = false;
    credentialSubmit.hidden = true;
    setCredentialCancelPrimary();
    credentialCancel.focus();
  }
}

credentialCancel.addEventListener('click', () => {
  resetAuthForms();
  loginForm.querySelector<HTMLInputElement>('input[name="email"]')?.focus();
});

credentialForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const credential = credentialFragment;
  if (credential === null) return;
  const values = new FormData(credentialForm);
  const password = values.get('password');
  const confirmation = values.get('confirmation');
  if (!credentialPasswordFields.hidden && credentialNeedsConfirmation(
    credential.type,
    invitePreview?.password_setup_required === true,
  ) && password !== confirmation) {
    credentialFlowError.textContent = 'The passwords do not match.';
    credentialFlowError.hidden = false;
    credentialForm.querySelector<HTMLInputElement>('input[name="confirmation"]')?.focus();
    return;
  }
  credentialSubmit.disabled = true;
  credentialFlowError.hidden = true;
  try {
    if (credential.type === 'invite') {
      const result = await api<LoginResponse>('/auth/invites/accept', {
        method: 'POST',
        body: JSON.stringify({
          token: credential.token,
          ...(invitePreview?.password_required ? { password } : {}),
          ...(invitePreview?.email_verification_required ? { verification_code: values.get('verification_code') } : {}),
        }),
      });
      credentialFragment = null;
      showSignedIn(result.user);
      await loadWorkspaces();
      if (result.user.role !== 'guest') await loadProjects();
    } else {
      await api('/auth/password-reset/complete', {
        method: 'POST',
        body: JSON.stringify({ token: credential.token, password }),
      });
      resetAuthForms();
      report('Password reset. Sign in with your new password.');
      loginForm.querySelector<HTMLInputElement>('input[name="email"]')?.focus();
    }
  } catch (error) {
    credentialFlowError.textContent = error instanceof Error ? error.message : 'Could not complete this request.';
    credentialFlowError.hidden = false;
  } finally {
    credentialSubmit.disabled = false;
  }
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginAdminHelp.hidden = true;
  const values = new FormData(loginForm);
  try {
    const result = await api<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: values.get('email'), password: values.get('password') }),
    });
    showSignedIn(result.user);
    await loadWorkspaces();
    if (result.user.role === 'guest') return;
    await loadProjects();
  } catch (error) {
    if (error instanceof ApiFailure && error.status === 429) {
      loginAdminHelp.hidden = false;
    }
    report(error instanceof Error ? error.message : 'Could not sign in.', true);
  }
});

workspaceSwitcher.addEventListener('click', () => openWorkspacePicker());
guestWorkspaceSwitcher.addEventListener('click', () => openWorkspacePicker());
workspacePickerCancel.addEventListener('click', () => resetPendingWorkspaceSwitch());
workspacePickerConfirm.addEventListener('click', commitPendingWorkspaceSwitch);
workspacePicker.addEventListener('close', () => {
  pendingWorkspaceId = null;
  if (commandPalette.open || shortcutHelp.open || issueStatusPicker.open) return;
  if (guestUi.isShellVisible() && !guestWorkspaceSwitcher.hidden && !guestWorkspaceSwitcher.disabled) {
    guestWorkspaceSwitcher.focus();
  } else if (!workspacePanel.hidden && !workspaceSwitcher.disabled) {
    workspaceSwitcher.focus();
  }
});
workspacePicker.addEventListener('keydown', (event) => {
  if (!(event.target instanceof HTMLElement) || !event.target.matches('.workspace-picker-option')) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    event.stopPropagation();
    const offset = event.key === 'ArrowDown' ? 1 : -1;
    const index = Math.max(0, Math.min(activeWorkspaces.length - 1, workspacePickerOptionIndex + offset));
    updateWorkspacePickerSelection(index);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    event.stopPropagation();
    commitPendingWorkspaceSwitch();
  }
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
  } catch (error) {
    if (!projectFormPanel.hidden) projectForm.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
    report(error instanceof Error ? error.message : 'Could not create project.', true);
  }
});

inviteRoleInput.addEventListener('change', () => {
  inviteProjectSelection.hidden = inviteRoleInput.value !== 'guest';
});

inviteForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = new FormData(inviteForm);
  const role = values.get('role') === 'guest' ? 'guest' : 'developer';
  const projectIds = values.getAll('project_ids').map(Number).filter(Number.isSafeInteger);
  if (role === 'guest' && projectIds.length === 0) {
    report('Choose at least one project for a guest invite.', true);
    inviteProjectOptions.querySelector<HTMLInputElement>('input')?.focus();
    return;
  }
  try {
    const result = await api<{ invite: InviteDelivery }>('/users/invites', {
      method: 'POST',
      body: JSON.stringify({
        name: values.get('name'),
        email: values.get('email'),
        role,
        project_ids: role === 'guest' ? projectIds : [],
      }),
    });
    inviteForm.reset();
    inviteProjectSelection.hidden = true;
    report(`Invitation sent to ${result.invite.email}.`);
    await loadWorkspaceAdmin();
  } catch (error) {
    report(error instanceof Error ? error.message : 'Could not send the invitation email.', true);
  }
});

guestLogoutButton.addEventListener('click', () => { void signOut(); });
inboxMarkAllReadButton.addEventListener('click', () => { void markAllInboxEventsRead(); });
inboxLoadMoreButton.addEventListener('click', () => { void loadMoreInboxEvents(); });
window.addEventListener('storage', (event) => {
  if (event.key === 'tangent-github-connected' && activeUser?.role === 'admin') void loadGithubRepositories();
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
  const credentialState = consumeCredentialFragment();
  if (credentialState !== null) {
    showSignedOut();
    await openCredentialFlow(credentialState);
    return;
  }
  try {
    const result = await api<{ user: User }>('/auth/me');
    showSignedIn(result.user);
    await loadWorkspaces();
    if (result.user.role === 'guest') return;
    await loadProjects();
    if (githubConnected) report('GitHub connected. Choose a repository in project settings.');
  } catch (error) {
    showSignedOut();
    if (error instanceof ApiFailure && error.status !== 401) {
      report(error.message, true);
    }
  }
}

void start();
