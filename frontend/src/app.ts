import {
  INBOX_TABS, createEventRow, eventsForTab, tabCount, type InboxEvent, type InboxTab,
} from './inbox-events.js';
import { renderClientEmptyState, renderClientView, type ClientView } from './guest-view.js';
import { resolveShortcut, shouldSubmitOnEnter, type ShortcutAction } from './shortcuts.js';
import {
  filterIssues,
  groupIssues,
  milestoneProgress,
  sortIssues,
  type BoardIssue,
  type IssueSortOrder,
  type IssueStatus,
} from './issue-board.js';

type Role = 'admin' | 'developer' | 'guest';
type IssueType = 'task' | 'bug' | 'feature' | 'research' | 'maintenance';

type WorkspaceLocation =
  | { view: 'projects'; focusedProjectId?: number }
  | { view: 'inbox' }
  | { view: 'admin' }
  | { view: 'project'; projectId: number; tab: 'issues' | 'members' };

interface User {
  id: number;
  workspace_id: number;
  name: string;
  email: string;
  role: Role;
}

interface Workspace {
  id: number;
  name: string;
  slug: string;
  role: Role;
}

interface Project {
  id: number;
  workspace_id: number;
  name: string;
  slug: string;
  description: string;
  status: 'active' | 'archived';
}

interface GuestProject {
  id: number;
  name: string;
  slug: string;
}

interface Issue extends BoardIssue {
  type: IssueType;
  assignee_id: number | null;
  workspace_id: number;
  project_id: number;
  created_by: number;
  source_channel_id: number | null;
  source_message_id: number | null;
  is_shared: boolean;
  milestone_id: number | null;
  milestone_name?: string | null;
  milestone_due_date?: string | null;
  sort_order: number;
  approval_requested_at: string | null;
  approved_by: number | null;
  approved_at: string | null;
  deleted_at: string | null;
}

interface Milestone {
  id: number;
  name: string;
  due_date: string | null;
}

interface InboxIssue extends Issue {
  project_name: string;
  project_slug: string;
}

const ISSUE_STATUS_OPTIONS: Array<{ value: IssueStatus; label: string }> = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'Todo' },
  { value: 'doing', label: 'Doing' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
];

const ISSUE_TYPE_OPTIONS: Array<{ value: IssueType; label: string }> = [
  { value: 'task', label: 'Task' },
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature' },
  { value: 'research', label: 'Research' },
  { value: 'maintenance', label: 'Maintenance' },
];

function issueStatusLabel(status: IssueStatus): string {
  return ISSUE_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function issueTypeLabel(type: IssueType): string {
  return ISSUE_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
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
    const option = document.createElement('option');
    option.value = String(milestone.id);
    option.textContent = milestone.name;
    select.append(option);
  }
  select.value = selectedMilestoneId === null ? '' : String(selectedMilestoneId);
}

interface Member extends User {
  joined_at?: string;
}

interface ChatMessage {
  id: number;
  channel_id: number;
  parent_id: number | null;
  author_id: number;
  author_role?: Role;
  author_name: string;
  body: string;
  created_at: string;
  is_client_visible?: boolean;
}

interface ChatEvent extends ChatMessage {
  project_id: number;
  type: 'message';
}

interface LoginResponse {
  user: User;
  csrf_token: string;
  expires_at: string;
}

class ApiFailure extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

interface PaletteCommand {
  label: string;
  detail: string;
  shortcut: string;
  run: () => void;
}

const loginPanel = document.querySelector<HTMLElement>('#login-panel')!;
const loginShell = document.querySelector<HTMLElement>('#login-shell')!;
const workspacePanel = document.querySelector<HTMLElement>('#workspace-panel')!;
const accountBar = document.querySelector<HTMLElement>('#account-bar')!;
const currentUserLabel = document.querySelector<HTMLElement>('#current-user')!;
const workspaceNav = document.querySelector<HTMLElement>('#workspace-nav')!;
const workspaceSwitcher = document.querySelector<HTMLButtonElement>('#workspace-switcher')!;
const workspaceSwitcherLabel = document.querySelector<HTMLElement>('#workspace-switcher-label')!;
const workspacePicker = document.querySelector<HTMLDialogElement>('#workspace-picker')!;
const workspacePickerCancel = document.querySelector<HTMLButtonElement>('#workspace-picker-cancel')!;
const workspacePickerConfirm = document.querySelector<HTMLButtonElement>('#workspace-picker-confirm')!;
const workspacePickerDescription = document.querySelector<HTMLElement>('#workspace-picker-description')!;
const workspacePickerOptions = document.querySelector<HTMLElement>('#workspace-picker-options')!;
const createWorkspaceForm = document.querySelector<HTMLFormElement>('#create-workspace-form')!;
const breadcrumbProjectsButton = document.querySelector<HTMLButtonElement>('#breadcrumb-projects')!;
const breadcrumbDivider = document.querySelector<HTMLElement>('#breadcrumb-divider')!;
const breadcrumbCurrent = document.querySelector<HTMLElement>('#breadcrumb-current')!;
const projectsNavButton = document.querySelector<HTMLButtonElement>('#projects-nav')!;
const inboxNavButton = document.querySelector<HTMLButtonElement>('#inbox-nav')!;
const adminNavButton = document.querySelector<HTMLButtonElement>('#admin-nav')!;
const projectsView = document.querySelector<HTMLElement>('#projects-view')!;
const inboxView = document.querySelector<HTMLElement>('#inbox-view')!;
const inboxHeading = document.querySelector<HTMLHeadingElement>('#inbox-heading')!;
const inboxSummary = document.querySelector<HTMLElement>('#inbox-summary')!;
const inboxIssueList = document.querySelector<HTMLUListElement>('#inbox-issue-list')!;
const inboxEmptyState = document.querySelector<HTMLElement>('#inbox-empty-state')!;
const projectView = document.querySelector<HTMLElement>('#project-view')!;
const adminView = document.querySelector<HTMLElement>('#admin-view')!;
const adminHeading = document.querySelector<HTMLHeadingElement>('#admin-heading')!;
const projectForm = document.querySelector<HTMLFormElement>('#project-form')!;
const toggleProjectFormButton = document.querySelector<HTMLButtonElement>('#toggle-project-form')!;
const cancelProjectFormButton = document.querySelector<HTMLButtonElement>('#cancel-project-form')!;
const developerForm = document.querySelector<HTMLFormElement>('#developer-form')!;
const loginForm = document.querySelector<HTMLFormElement>('#login-form')!;
const projectList = document.querySelector<HTMLUListElement>('#project-list')!;
const emptyProjects = document.querySelector<HTMLElement>('#empty-projects')!;
const projectFormPanel = document.querySelector<HTMLElement>('#project-form-panel')!;
const projectDescription = document.querySelector<HTMLElement>('#project-description')!;
const projectState = document.querySelector<HTMLElement>('#project-state')!;
const chatView = document.querySelector<HTMLElement>('#chat-view')!;
const projectChatColumn = document.querySelector<HTMLElement>('#project-chat-column')!;
const projectSidebarList = document.querySelector<HTMLUListElement>('#project-sidebar-list')!;
const projectMain = document.querySelector<HTMLElement>('.project-main')!;
const projectTabs = document.querySelector<HTMLElement>('.project-tabs')!;
const issuesView = document.querySelector<HTMLElement>('#issues-view')!;
const membersView = document.querySelector<HTMLElement>('#members-view')!;
const issueDetailView = document.querySelector<HTMLElement>('#issue-detail-view')!;
const issueDetailDisplay = document.querySelector<HTMLElement>('#issue-detail-display')!;
const issueDetailTitle = document.querySelector<HTMLElement>('#issue-detail-title')!;
const issueDetailDescription = document.querySelector<HTMLElement>('#issue-detail-description')!;
const issueDetailStatus = document.querySelector<HTMLButtonElement>('#issue-detail-status')!;
const issueDetailStatusLabel = document.querySelector<HTMLElement>('#issue-detail-status-label')!;
const issueSourceLink = document.querySelector<HTMLAnchorElement>('#issue-source-link')!;
const issueDetailEditForm = document.querySelector<HTMLFormElement>('#issue-detail-edit-form')!;
const issueDetailTitleInput = document.querySelector<HTMLInputElement>('#issue-detail-title-input')!;
const issueDetailDescriptionInput = document.querySelector<HTMLTextAreaElement>('#issue-detail-description-input')!;
const issueDetailEditButton = document.querySelector<HTMLButtonElement>('#issue-detail-edit-button')!;
const issueDetailDeleteButton = document.querySelector<HTMLButtonElement>('#issue-detail-delete-button')!;
const issueDetailSaveButton = document.querySelector<HTMLButtonElement>('#issue-detail-save-button')!;
const keyboardHints = document.querySelector<HTMLElement>('#keyboard-hints')!;
const projectKeyboardHints = document.querySelector<HTMLElement>('#project-keyboard-hints')!;
const goPrefixHint = document.querySelector<HTMLElement>('#go-prefix-hint')!;
const commandPalette = document.querySelector<HTMLDialogElement>('#command-palette')!;
const commandPaletteClose = document.querySelector<HTMLButtonElement>('#command-palette-close')!;
const commandSearch = document.querySelector<HTMLInputElement>('#command-search')!;
const commandResults = document.querySelector<HTMLUListElement>('#command-results')!;
const shortcutHelp = document.querySelector<HTMLDialogElement>('#shortcut-help')!;
const shortcutHelpClose = document.querySelector<HTMLButtonElement>('#shortcut-help-close')!;
const membersTabButton = document.querySelector<HTMLButtonElement>('#members-tab')!;
const issuesTabButton = document.querySelector<HTMLButtonElement>('#issues-tab')!;
const issueBackButton = document.querySelector<HTMLButtonElement>('#issue-back-button')!;
const issueDetailCancelButton = document.querySelector<HTMLButtonElement>('#issue-detail-cancel-button')!;
const issueForm = document.querySelector<HTMLFormElement>('#issue-form')!;
const issueQuickAddTitle = document.querySelector<HTMLInputElement>('#issue-quick-add-title')!;
const issueQuickAddAssignee = document.querySelector<HTMLSelectElement>('#issue-quick-add-assignee')!;
const issueDetailType = document.querySelector<HTMLElement>('#issue-detail-type')!;
const issueDetailAssignee = document.querySelector<HTMLElement>('#issue-detail-assignee')!;
const issueDetailMilestone = document.querySelector<HTMLElement>('#issue-detail-milestone')!;
const issueDetailSharing = document.querySelector<HTMLElement>('#issue-detail-sharing')!;
const issueDetailApproval = document.querySelector<HTMLElement>('#issue-detail-approval')!;
const issueDetailTypeInput = document.querySelector<HTMLSelectElement>('#issue-detail-type-input')!;
const issueDetailAssigneeInput = document.querySelector<HTMLSelectElement>('#issue-detail-assignee-input')!;
const issueDetailMilestoneInput = document.querySelector<HTMLSelectElement>('#issue-detail-milestone-input')!;
const issueDetailSharedInput = document.querySelector<HTMLInputElement>('#issue-detail-shared-input')!;
const issueDetailApprovalInput = document.querySelector<HTMLInputElement>('#issue-detail-approval-input')!;
const issueDescriptionDetails = document.querySelector<HTMLDetailsElement>('#issue-description-details')!;
const issueProgress = document.querySelector<HTMLProgressElement>('#issue-progress')!;
const issueProgressLabel = document.querySelector<HTMLElement>('#issue-progress-label')!;
const manageMilestonesButton = document.querySelector<HTMLButtonElement>('#manage-milestones-button')!;
const milestoneManagerDialog = document.querySelector<HTMLDialogElement>('#milestone-manager-dialog')!;
const milestoneManagerClose = document.querySelector<HTMLButtonElement>('#milestone-manager-close')!;
const milestoneList = document.querySelector<HTMLUListElement>('#milestone-list')!;
const milestoneListEmpty = document.querySelector<HTMLElement>('#milestone-list-empty')!;
const milestoneForm = document.querySelector<HTMLFormElement>('#milestone-form')!;
const milestoneFormHeading = document.querySelector<HTMLHeadingElement>('#milestone-form-heading')!;
const milestoneNameInput = document.querySelector<HTMLInputElement>('#milestone-name-input')!;
const milestoneDueDateInput = document.querySelector<HTMLInputElement>('#milestone-due-date-input')!;
const milestoneFormError = document.querySelector<HTMLElement>('#milestone-form-error')!;
const milestoneFormCancel = document.querySelector<HTMLButtonElement>('#milestone-form-cancel')!;
const milestoneFormSubmit = document.querySelector<HTMLButtonElement>('#milestone-form-submit')!;
const issueFilter = document.querySelector<HTMLInputElement>('#issue-filter')!;
const issueOrder = document.querySelector<HTMLSelectElement>('#issue-order')!;
const issueGroupingLabel = document.querySelector<HTMLElement>('#issue-grouping-label')!;
const issueCountSummary = document.querySelector<HTMLElement>('#issue-count-summary')!;
const issueList = document.querySelector<HTMLUListElement>('#issue-list')!;
const deletedIssuesDetails = document.querySelector<HTMLDetailsElement>('#deleted-issues-details')!;
const deletedIssueCount = document.querySelector<HTMLElement>('#deleted-issue-count')!;
const deletedIssueList = document.querySelector<HTMLUListElement>('#deleted-issue-list')!;
const issueStatusPicker = document.querySelector<HTMLDialogElement>('#issue-status-picker')!;
const issueStatusPickerClose = document.querySelector<HTMLButtonElement>('#issue-status-picker-close')!;
const issueStatusPickerDescription = document.querySelector<HTMLElement>('#issue-status-picker-description')!;
const issueStatusPickerOptions = document.querySelector<HTMLElement>('#issue-status-picker-options')!;
const issueDeleteConfirmation = document.querySelector<HTMLDialogElement>('#issue-delete-confirmation')!;
const issueDeleteDescription = document.querySelector<HTMLElement>('#issue-delete-description')!;
const issueDeleteError = document.querySelector<HTMLElement>('#issue-delete-error')!;
const issueDeleteCancel = document.querySelector<HTMLButtonElement>('#issue-delete-cancel')!;
const issueDeleteConfirm = document.querySelector<HTMLButtonElement>('#issue-delete-confirm')!;
const emptyIssues = document.querySelector<HTMLElement>('#empty-issues')!;
const memberList = document.querySelector<HTMLUListElement>('#member-list')!;
const memberForm = document.querySelector<HTMLFormElement>('#member-form')!;
const memberSelect = document.querySelector<HTMLSelectElement>('#member-select')!;
const addMemberButton = document.querySelector<HTMLButtonElement>('#add-member-button')!;
const memberRemovalConfirmation = document.querySelector<HTMLDialogElement>('#member-removal-confirmation')!;
const memberRemovalDescription = document.querySelector<HTMLElement>('#member-removal-description')!;
const memberRemovalCancel = document.querySelector<HTMLButtonElement>('#member-removal-cancel')!;
const memberRemovalConfirm = document.querySelector<HTMLButtonElement>('#member-removal-confirm')!;
const statusMessage = document.querySelector<HTMLElement>('#status-message')!;
const loginStatusMessage = document.querySelector<HTMLElement>('#login-status-message')!;
const logoutButton = document.querySelector<HTMLButtonElement>('#logout-button')!;

let activeUser: User | null = null;
let activeWorkspaces: Workspace[] = [];
let activeProject: Project | null = null;
let projectReturnFocusId: number | null = null;
let pendingWorkspaceId: number | null = null;
let workspacePickerOptionIndex = 0;
const workspaceViewHistory: WorkspaceLocation[] = [];
let activeProjectMembers: Member[] = [];
let projectMilestones: Milestone[] = [];
let editingMilestoneId: number | null = null;
let projectIssues: Issue[] = [];
let inboxIssues: InboxIssue[] = [];
let inboxEvents: InboxEvent[] = [];
let inboxTab: InboxTab = 'assigned';
const inboxTabsElement = document.querySelector<HTMLElement>('#inbox-tabs')!;
const inboxMarkAllReadButton = document.querySelector<HTMLButtonElement>('#inbox-mark-all-read')!;
const guestShell = document.querySelector<HTMLElement>('#guest-shell')!;
const guestStatus = document.querySelector<HTMLElement>('#guest-status')!;
const guestMain = document.querySelector<HTMLElement>('#guest-main')!;
const guestTitle = document.querySelector<HTMLElement>('#guest-title')!;
const guestUser = document.querySelector<HTMLElement>('#guest-user')!;
const guestProjectLabel = document.querySelector<HTMLElement>('#guest-project-label')!;
const guestProjectSelect = document.querySelector<HTMLSelectElement>('#guest-project-select')!;
const guestLogoutButton = document.querySelector<HTMLButtonElement>('#guest-logout-button')!;
let deletedProjectIssues: Issue[] = [];
let selectedIssue: Issue | null = null;
let activeChatProjectId: number | null = null;
let chatPollTimer: number | null = null;
let chatCursor = 0;
let chatEtag: string | null = null;
let chatPollDelay = 1000;
let chatMessageList: HTMLElement | null = null;
let chatEmptyState: HTMLElement | null = null;
let chatInput: HTMLTextAreaElement | null = null;
let selectedChatMessageId: number | null = null;
const chatMessagesById = new Map<number, ChatMessage>();
let chatReplyHint: HTMLElement | null = null;
let chatCancelReply: HTMLButtonElement | null = null;
let chatReplyParent: { id: number; name: string } | null = null;
let issueQuickAddEscapePending = false;
let issueQuickAddReturnFocus: HTMLElement | null = null;
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

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && path !== '/auth/login') {
    const csrf = cookie('tangent_csrf');
    if (csrf !== null) headers.set('X-CSRF-Token', csrf);
  }

  const response = await fetch(`/api/v1${path}`, {
    ...init,
    method,
    headers,
    credentials: 'same-origin',
  });
  if (response.status === 204) return undefined as T;

  const payload = await response.json() as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new ApiFailure(payload.error?.message ?? 'The request could not be completed.', response.status);
  }
  return payload;
}

function cookie(name: string): string | null {
  const entry = document.cookie.split(';').map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  return entry === undefined ? null : decodeURIComponent(entry.slice(name.length + 1));
}

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
  if (!guestShell.hidden) {
    guestStatus.textContent = message;
    guestStatus.classList.toggle('error', isError);
    return;
  }
  if (statusMessageTimer !== null) window.clearTimeout(statusMessageTimer);
  statusMessageTimer = null;
  const target = workspacePanel.hidden ? loginStatusMessage : statusMessage;
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

function showSignedOut(): void {
  workspaceViewHistory.length = 0;
  projectReturnFocusId = null;
  resetPendingWorkspaceSwitch();
  stopChatPolling();
  activeUser = null;
  activeProject = null;
  activeProjectMembers = [];
  selectedIssue = null;
  activeWorkspaces = [];
  workspaceSwitcherLabel.textContent = 'Choose workspace';
  workspaceSwitcher.setAttribute('aria-label', 'Choose workspace');
  workspaceSwitcher.disabled = true;
  loginShell.hidden = false;
  loginPanel.hidden = false;
  workspacePanel.hidden = true;
  accountBar.hidden = true;
  keyboardHints.hidden = true;
  projectKeyboardHints.hidden = true;
  clearGoPrefix();
  document.body.classList.remove('is-project-view', 'is-guest');
  guestShell.hidden = true;
  inboxTab = 'assigned';
  inboxEvents = [];
  projectList.replaceChildren();
  projectSidebarList.replaceChildren();
  issueList.replaceChildren();
  chatView.replaceChildren();
  report('');
}

function showSignedIn(user: User): void {
  workspaceViewHistory.length = 0;
  projectReturnFocusId = null;
  activeProject = null;
  activeUser = user;
  resetPendingWorkspaceSwitch();
  if (user.role === 'guest') {
    showGuestShell(user);
    return;
  }
  guestShell.hidden = true;
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
  try {
    const result = await api<{ user: User; workspace: Workspace }>(`/workspaces/${workspaceId}/switch`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    showSignedIn(result.user);
    if (result.user.role === 'guest') return;
    await loadWorkspaces();
    await loadProjects();
    report(`Switched to ${result.workspace.name}.`);
  } catch (error) {
    renderWorkspaceSwitcher();
    report(error instanceof Error ? error.message : 'Could not switch workspace.', true);
  } finally {
    renderWorkspaceSwitcher();
    if (restoreSwitcherFocus && !workspaceSwitcher.disabled) workspaceSwitcher.focus();
  }
}

function renderWorkspaceSwitcher(): void {
  const currentName = activeWorkspaces.find((workspace) => workspace.id === activeUser?.workspace_id)?.name
    ?? 'Choose workspace';
  workspaceSwitcherLabel.textContent = currentName;
  workspaceSwitcher.setAttribute('aria-label', `Choose workspace. Current workspace: ${currentName}.`);
  workspaceSwitcher.disabled = activeWorkspaces.length === 0;
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
  if (activeUser === null || activeWorkspaces.length === 0) return;
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

function showWorkspaceView(view: 'projects' | 'inbox' | 'admin' | 'project'): void {
  if (view !== 'project') {
    if (activeProject !== null) projectReturnFocusId = activeProject.id;
    stopChatPolling();
    activeProject = null;
    activeProjectMembers = [];
    selectedIssue = null;
    issueDetailEditForm.hidden = true;
    issueDetailDisplay.hidden = false;
  }
  projectsView.hidden = view !== 'projects';
  inboxView.hidden = view !== 'inbox';
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
    : view === 'admin' ? 'Administration' : view === 'inbox' ? 'Inbox' : 'Projects';
  document.body.classList.toggle('is-project-view', view === 'project');
  projectsNavButton.classList.toggle('is-active', view === 'projects');
  inboxNavButton.classList.toggle('is-active', view === 'inbox');
  adminNavButton.classList.toggle('is-active', view === 'admin');
  projectSidebarList.querySelectorAll<HTMLButtonElement>('.project-sidebar-link').forEach((button) => {
    button.classList.toggle('is-active', view === 'project' && button.dataset.projectId === String(activeProject?.id));
  });
  if (view === 'projects') {
    projectsNavButton.setAttribute('aria-current', 'page');
    inboxNavButton.removeAttribute('aria-current');
    adminNavButton.removeAttribute('aria-current');
  } else if (view === 'inbox') {
    inboxNavButton.setAttribute('aria-current', 'page');
    projectsNavButton.removeAttribute('aria-current');
    adminNavButton.removeAttribute('aria-current');
  } else if (view === 'admin') {
    adminNavButton.setAttribute('aria-current', 'page');
    projectsNavButton.removeAttribute('aria-current');
    inboxNavButton.removeAttribute('aria-current');
  } else {
    projectsNavButton.removeAttribute('aria-current');
    inboxNavButton.removeAttribute('aria-current');
    adminNavButton.removeAttribute('aria-current');
  }
  if (view === 'projects' && projectReturnFocusId !== null) {
    const projectId = projectReturnFocusId;
    projectReturnFocusId = null;
    if (!focusProjectOpenButton(projectId)) projectsNavButton.focus();
  }
}

function openWorkspaceAdmin(): void {
  const currentLocation = currentWorkspaceLocation();
  if (currentLocation.view !== 'admin') workspaceViewHistory.push(currentLocation);
  showWorkspaceView('admin');
  adminHeading.focus();
}

function currentWorkspaceLocation(): WorkspaceLocation {
  if (!projectView.hidden && activeProject !== null) {
    return {
      view: 'project',
      projectId: activeProject.id,
      tab: membersView.hidden ? 'issues' : 'members',
    };
  }
  if (!inboxView.hidden) return { view: 'inbox' };
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
  return left.view === right.view;
}

function goToProjects(): void {
  workspaceViewHistory.length = 0;
  showWorkspaceView('projects');
}

function goToInbox(): void {
  const currentLocation = currentWorkspaceLocation();
  if (currentLocation.view !== 'inbox') workspaceViewHistory.push(currentLocation);
  showWorkspaceView('inbox');
  inboxHeading.focus();
  void loadInboxIssues();
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
  activeChatProjectId = null;
  if (chatPollTimer !== null) window.clearTimeout(chatPollTimer);
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
  return Array.from(inboxIssueList.querySelectorAll<HTMLButtonElement>('.issue-title-button'));
}

function selectedInboxIssueButton(): HTMLButtonElement | null {
  const focused = document.activeElement;
  if (focused instanceof HTMLElement) {
    const focusedRow = focused.closest<HTMLElement>('.inbox-issue-card');
    if (focusedRow !== null) return focusedRow.querySelector<HTMLButtonElement>('.issue-title-button');
  }
  return inboxIssueList.querySelector<HTMLButtonElement>('.inbox-issue-card.is-keyboard-selected .issue-title-button');
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

function chatMessageElements(): HTMLElement[] {
  if (chatMessageList === null) return [];
  return Array.from(chatMessageList.querySelectorAll<HTMLElement>('.chat-message'))
    .filter((message) => Number(message.dataset.messageId) > 0);
}

function selectChatMessage(id: number, focus = true): void {
  const item = chatMessageList?.querySelector<HTMLElement>(`.chat-message[data-message-id="${id}"]`);
  if (item === null || item === undefined) return;
  selectedChatMessageId = id;
  chatMessageList?.querySelectorAll<HTMLElement>('.chat-message').forEach((message) => {
    message.classList.toggle('is-keyboard-selected', message === item);
  });
  if (focus) item.focus();
}

function moveChatMessageSelection(direction: -1 | 1): void {
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
  if (next !== undefined) selectChatMessage(Number(next.dataset.messageId));
}

function moveChatMessageSelectionToBoundary(edge: 'first' | 'last'): void {
  const messages = chatMessageElements();
  const target = messages[edge === 'first' ? 0 : messages.length - 1];
  if (target !== undefined) selectChatMessage(Number(target.dataset.messageId));
}

function moveChatMessageSelectionByPage(direction: -1 | 1): void {
  const messages = chatMessageElements();
  if (messages.length === 0 || chatMessageList === null) return;
  const currentIndex = messages.findIndex((message) => Number(message.dataset.messageId) === selectedChatMessageId);
  const pageSize = Math.max(1, visibleRowsInViewport(messages, chatMessageList, '.chat-message') - 1);
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
  const message = chatMessagesById.get(selectedChatMessageId);
  if (message !== undefined) setChatReplyParent(message);
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
    canAdmin: activeUser?.role === 'admin',
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
    chatMessagesFocused: document.activeElement instanceof HTMLElement
      && document.activeElement.matches('.chat-message'),
    hasSelectedChatMessage: selectedChatMessageId !== null && selectedChatMessageId > 0
      && chatMessagesById.has(selectedChatMessageId),
    textInputFocused: shouldBlurOnEscape(target),
    modalOpen: commandPalette.open || shortcutHelp.open || issueStatusPicker.open || issueDeleteConfirmation.open || memberRemovalConfirmation.open || workspacePicker.open,
    canDismiss: commandPalette.open || shortcutHelp.open || (!workspacePanel.hidden && (
      pendingWorkspaceId !== null
      || (!projectView.hidden && (!issueDetailView.hidden || !issueDetailEditForm.hidden
        || issueQuickAddEscapePending || chatReplyParent !== null))
      || (!projectsView.hidden && !projectFormPanel.hidden)
      || !projectView.hidden || !inboxView.hidden || !adminView.hidden
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
  if (document.activeElement instanceof HTMLElement && document.activeElement.matches('.chat-message')) {
    moveChatMessageSelectionByPage(direction);
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

function getPaletteCommands(): PaletteCommand[] {
  const commands: PaletteCommand[] = [
    { label: 'Go to Projects', detail: 'Open the project list', shortcut: 'g p', run: goToProjects },
    { label: 'Open Inbox', detail: 'Review open issues assigned to you', shortcut: 'g n', run: goToInbox },
    { label: 'Switch workspace', detail: 'Choose a workspace; Enter switches, Escape cancels', shortcut: 'g w', run: openWorkspacePicker },
    { label: 'Show keyboard shortcuts', detail: 'View key bindings', shortcut: '?', run: showShortcutHelp },
  ];
  for (const workspace of activeWorkspaces) {
    if (workspace.id === activeUser?.workspace_id) continue;
    commands.splice(1, 0, {
      label: `Switch to ${workspace.name}`,
      detail: `Review and confirm switching to ${workspace.name}`,
      shortcut: '',
      run: () => openWorkspacePicker(workspace.id),
    });
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
  if (activeUser?.role === 'admin') {
    commands.unshift({
      label: 'Create workspace',
      detail: 'Create a separate workspace for another client',
      shortcut: '',
      run: () => {
        openWorkspaceAdmin();
        createWorkspaceForm.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
      },
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
    );
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
  if (workspacePicker.open) resetPendingWorkspaceSwitch();
  if (milestoneManagerDialog.open) closeMilestoneManager();
  if (issueStatusPicker.open) closeIssueStatusPicker();
  if (issueDeleteConfirmation.open) closeIssueDeleteConfirmation();
  if (memberRemovalConfirmation.open) closeMemberRemovalConfirmation();
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
  if (workspacePicker.open) resetPendingWorkspaceSwitch();
  if (milestoneManagerDialog.open) closeMilestoneManager();
  if (issueStatusPicker.open) closeIssueStatusPicker();
  if (issueDeleteConfirmation.open) closeIssueDeleteConfirmation();
  if (memberRemovalConfirmation.open) closeMemberRemovalConfirmation();
  if (commandPalette.open) closeCommandPalette();
  if (shortcutHelp.open) {
    shortcutHelp.close();
    return;
  }
  shortcutHelp.showModal();
  shortcutHelpClose.focus();
}

function dismissCurrentView(): void {
  if (workspacePicker.open) {
    resetPendingWorkspaceSwitch();
  } else if (milestoneManagerDialog.open) {
    closeMilestoneManager();
  } else if (issueDeleteConfirmation.open) {
    closeIssueDeleteConfirmation();
  } else if (memberRemovalConfirmation.open) {
    closeMemberRemovalConfirmation();
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
  } else if (!workspacePanel.hidden && !projectView.hidden && issueQuickAddEscapePending) {
    issueForm.reset();
    issueDescriptionDetails.open = false;
    issueQuickAddEscapePending = false;
    focusIssueQuickAddReturnTarget();
  } else if (!workspacePanel.hidden && !projectView.hidden && chatReplyParent !== null) {
    clearChatReplyParent();
  } else if (!workspacePanel.hidden && (!projectView.hidden || !inboxView.hidden || !adminView.hidden)) {
    goBackWorkspaceView();
  }
}

function focusIssueQuickAddReturnTarget(): void {
  const target = issueQuickAddReturnFocus;
  const dialog = target?.closest('dialog') ?? null;
  if (target !== null && target.isConnected && target.closest('[hidden]') === null
    && (dialog === null || dialog.open)) {
    target.focus();
  } else {
    issuesTabButton.focus();
  }
}

function issueQuickAddHasDraft(): boolean {
  const description = issueForm.querySelector<HTMLTextAreaElement>('textarea[name="description"]');
  return issueQuickAddTitle.value.trim() !== '' || (description?.value.trim() ?? '') !== '';
}

function closeProjectForm(): void {
  projectForm.reset();
  projectFormPanel.hidden = true;
  toggleProjectFormButton.focus();
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
      focusIssueQuickAddReturnTarget();
    }
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
    case 'await-projects-key': startGoPrefix(); break;
    case 'projects': clearGoPrefix(); goToProjects(); break;
    case 'inbox': goToInbox(); break;
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
    case 'focus-chat-composer': chatInput?.focus(); break;
    case 'reply-to-chat-message': replyToSelectedChatMessage(); break;
    case 'issue-from-selected-chat-message': createIssueFromSelectedChatMessage(); break;
    case 'blur-text-input': blurTextInput(); break;
    case 'dismiss': dismissCurrentView(); break;
  }
}

function handleKeyboardShortcut(event: KeyboardEvent): void {
  if ((commandPalette.open || shortcutHelp.open || issueStatusPicker.open || issueDeleteConfirmation.open || memberRemovalConfirmation.open || milestoneManagerDialog.open || workspacePicker.open)
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

async function pollProjectChat(projectId: number): Promise<void> {
  if (activeChatProjectId !== projectId) return;
  if (document.hidden) {
    chatPollDelay = Math.min(10_000, Math.max(5_000, chatPollDelay * 1.5));
    scheduleChatPoll();
    return;
  }

  const headers = new Headers();
  if (chatEtag !== null) headers.set('If-None-Match', chatEtag);
  const cursor = `?since=${chatCursor}`;
  try {
    const response = await fetch(`/api/v1/events${cursor}`, {
      headers,
      credentials: 'same-origin',
    });
    if (activeChatProjectId !== projectId) return;
    if (response.status === 304) {
      chatPollDelay = Math.min(10_000, chatPollDelay * 1.5);
    } else {
      const payload = await response.json() as { events?: ChatEvent[]; error?: { message?: string } };
      if (activeChatProjectId !== projectId) return;
      if (!response.ok) throw new ApiFailure(payload.error?.message ?? 'Could not load project chat.', response.status);
      chatEtag = response.headers.get('ETag');
      const received = payload.events ?? [];
      for (const event of received) {
        chatCursor = Math.max(chatCursor, event.id);
        if (event.project_id === projectId) appendChatMessage(event);
      }
      if (received.length > 0) {
        chatPollDelay = 1000;
      } else {
        chatPollDelay = Math.min(10_000, chatPollDelay * 1.5);
      }
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

function appendChatMessage(message: ChatMessage): void {
  if (chatMessageList === null) return;
  if (chatMessageList.querySelector(`[data-message-id="${message.id}"]`)) return;
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
  authorDetails.append(author);
  if (message.author_role === 'guest') authorDetails.append(chatMessageMarker('client'));
  if (message.is_client_visible) authorDetails.append(chatMessageMarker('visible'));
  authorDetails.append(time);
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
    if (projectId === undefined || activeChatProjectId !== projectId) return;
    createIssue.disabled = true;
    createIssue.textContent = 'Creating…';
    try {
      const result = await api<{ issue: Issue }>(`/messages/${message.id}/issue`, { method: 'POST' });
      if (activeProject?.id !== projectId) return;
      createIssue.textContent = 'Created';
      report(`Created issue: ${result.issue.title}`);
      selectedIssue = null;
      switchProjectTab('issues');
    } catch (error) {
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
    const existingId = Number((child as HTMLElement).dataset.messageId);
    return Number.isFinite(existingId) && existingId > message.id;
  });
  chatMessageList.insertBefore(item, followingMessage ?? null);
  chatEmptyState!.hidden = true;
  chatCursor = Math.max(chatCursor, message.id);
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
  chatReplyParent = { id: message.id, name: message.author_name };
  if (chatReplyHint !== null) {
    chatReplyHint.textContent = clientVisible
      ? `Replying to ${message.author_name}. Your reply will be visible to the guest.`
      : `Replying to ${message.author_name}`;
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

function createProjectChat(projectId: number): HTMLElement {
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
      body,
      created_at: new Date().toISOString(),
    };
    if (activeChatProjectId === projectId) appendChatMessage(optimisticMessage);
    send.disabled = true;
    try {
      const result = await api<{ message: ChatMessage }>(`/projects/${projectId}/messages`, {
        method: 'POST',
        body: JSON.stringify(messageBody),
      });
      if (activeChatProjectId === projectId) {
        chatMessageList?.querySelector(`[data-message-id="${optimisticId}"]`)?.remove();
        appendChatMessage(result.message);
        selectChatMessage(result.message.id, false);
        chatInput!.value = '';
        clearChatReplyParent();
        chatEtag = null;
        chatPollDelay = 1000;
        scheduleChatPoll(0);
      }
    } catch (error) {
      if (activeChatProjectId === projectId) {
        chatMessageList?.querySelector(`[data-message-id="${optimisticId}"]`)?.remove();
        report(error instanceof Error ? error.message : 'Could not send the message.', true);
      }
    } finally {
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
inboxNavButton.addEventListener('click', goToInbox);
adminNavButton.addEventListener('click', openWorkspaceAdmin);
breadcrumbProjectsButton.addEventListener('click', goToProjects);
manageMilestonesButton.addEventListener('click', openMilestoneManager);
milestoneManagerClose.addEventListener('click', closeMilestoneManager);
milestoneForm.addEventListener('submit', (event) => void saveMilestone(event));
milestoneFormCancel.addEventListener('click', () => {
  resetMilestoneForm();
  milestoneNameInput.focus();
});
milestoneManagerDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeMilestoneManager();
});
milestoneManagerDialog.addEventListener('close', () => {
  resetMilestoneForm();
  if (!projectView.hidden && activeProject !== null && !commandPalette.open && !shortcutHelp.open && !workspacePicker.open) {
    manageMilestonesButton.focus();
  }
});
issuesTabButton.addEventListener('click', () => switchProjectTab('issues'));
membersTabButton.addEventListener('click', () => switchProjectTab('members'));
projectTabs.addEventListener('keydown', (event) => {
  const tabs = [issuesTabButton, membersTabButton];
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
issueQuickAddTitle.addEventListener('focus', rememberIssueQuickAddOpener);
issueDescriptionInput?.addEventListener('focus', rememberIssueQuickAddOpener);
projectForm.querySelector<HTMLTextAreaElement>('textarea[name="description"]')
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
  projectForm.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
});
cancelProjectFormButton.addEventListener('click', closeProjectForm);

issueForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (activeProject === null) return;
  const projectId = activeProject.id;
  const values = new FormData(issueForm);
  const assigneeValue = values.get('assignee_id');
  try {
    await api(`/projects/${projectId}/issues`, {
      method: 'POST',
      body: JSON.stringify({
        title: values.get('title'),
        description: values.get('description'),
        type: values.get('type'),
        assignee_id: typeof assigneeValue === 'string' && assigneeValue !== '' ? Number(assigneeValue) : null,
      }),
    });
    issueForm.reset();
    issueDescriptionDetails.open = false;
    issueQuickAddEscapePending = false;
    report('Issue created.');
    await loadProjectIssues(projectId);
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

async function loadProjects(): Promise<void> {
  const result = await api<{ projects: Project[] }>('/projects');
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

async function loadInboxIssues(): Promise<void> {
  renderInboxTabs();
  if (inboxTab !== 'assigned') {
    await loadInboxEvents();
    return;
  }
  try {
    const result = await api<{ issues: InboxIssue[] }>('/inbox');
    if (inboxView.hidden || workspacePanel.hidden) return;
    inboxIssues = result.issues;
    renderInboxIssues();
  } catch (error) {
    if (error instanceof ApiFailure && error.status === 401) {
      showSignedOut();
      return;
    }
    if (!inboxView.hidden) {
      report(error instanceof Error ? error.message : 'Could not load your inbox.', true);
    }
  }
}

function renderInboxTabs(): void {
  inboxTabsElement.replaceChildren(...INBOX_TABS.map((tab) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = `inbox-tab-${tab.id}`;
    button.className = `inbox-tab${tab.id === inboxTab ? ' is-active' : ''}`;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(tab.id === inboxTab));
    const count = tabCount(inboxEvents, tab.id);
    button.textContent = count === null || count === 0 ? tab.label : `${tab.label} ${count}`;
    button.addEventListener('click', () => selectInboxTab(tab.id));
    return button;
  }));
  inboxMarkAllReadButton.hidden = inboxTab === 'assigned' || inboxTab === 'done';
}

function selectInboxTab(tab: InboxTab): void {
  inboxTab = tab;
  renderInboxTabs();
  if (tab === 'assigned') {
    renderInboxIssues();
  } else {
    void loadInboxEvents();
  }
}

async function loadInboxEvents(): Promise<void> {
  try {
    const result = await api<{ events: InboxEvent[] }>('/inbox/events');
    if (inboxView.hidden || inboxTab === 'assigned') return;
    inboxEvents = result.events;
    renderInboxTabs();
    renderInboxEvents();
  } catch (error) {
    if (inboxView.hidden) return;
    inboxEvents = [];
    renderInboxTabs();
    inboxIssueList.replaceChildren();
    inboxEmptyState.hidden = false;
    inboxEmptyState.textContent = 'Could not load your events.';
    report(error instanceof Error ? error.message : 'Could not load your events.', true);
  }
}

function renderInboxEvents(): void {
  const events = eventsForTab(inboxEvents, inboxTab);
  const unread = inboxEvents.filter((event) => !event.done && !event.read).length;
  inboxSummary.textContent = `${unread} unread ${unread === 1 ? 'event' : 'events'}.`;
  inboxIssueList.replaceChildren(...events.map((event) => createEventRow(event, {
    open: (target) => void openInboxEvent(target),
    toggleRead: (target) => void updateInboxEvent(target, { read: !target.read }),
    toggleDone: (target) => void updateInboxEvent(target, { done: !target.done, read: true }),
  })));
  inboxEmptyState.textContent = 'Nothing here.';
  inboxEmptyState.hidden = events.length > 0;
}

async function updateInboxEvent(event: InboxEvent, change: { read?: boolean; done?: boolean }): Promise<void> {
  try {
    const result = await api<{ event: InboxEvent }>(`/inbox/events/${event.id}`, {
      method: 'PATCH',
      body: JSON.stringify(change),
    });
    inboxEvents = inboxEvents.map((candidate) => (candidate.id === event.id ? result.event : candidate));
    renderInboxTabs();
    renderInboxEvents();
  } catch (error) {
    report(error instanceof Error ? error.message : 'Could not update the event.', true);
  }
}

async function markAllInboxEventsRead(): Promise<void> {
  try {
    await api('/inbox/events/read-all', { method: 'POST' });
    inboxEvents = inboxEvents.map((event) => ({ ...event, read: true }));
    renderInboxTabs();
    renderInboxEvents();
  } catch (error) {
    report(error instanceof Error ? error.message : 'Could not mark events as read.', true);
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
  inboxSummary.textContent = inboxIssues.length === 0
    ? 'Open issues assigned to you across your projects.'
    : `${inboxIssues.length} open ${inboxIssues.length === 1 ? 'issue' : 'issues'} assigned to you in ${projectCount} ${projectCount === 1 ? 'project' : 'projects'}.`;
  inboxIssueList.replaceChildren(...inboxIssues.map(createInboxIssueRow));
  inboxEmptyState.textContent = 'You have no open issues assigned to you.';
  inboxEmptyState.hidden = inboxIssues.length > 0;
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
  const projectName = document.createElement('span');
  projectName.className = 'inbox-project-name';
  projectName.textContent = issue.project_name;
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
  const type = document.createElement('span');
  type.className = 'issue-type-tag';
  type.textContent = issueTypeLabel(issue.type);
  const status = document.createElement('span');
  status.className = `inbox-issue-status is-${issue.status}`;
  status.textContent = issueStatusLabel(issue.status);
  metadata.append(type, status);
  primary.append(title, metadata);
  mainline.append(key, primary);
  content.append(projectName, mainline);
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

function resetMilestoneForm(): void {
  milestoneForm.reset();
  editingMilestoneId = null;
  milestoneFormHeading.textContent = 'Add a milestone';
  milestoneFormSubmit.textContent = 'Add milestone';
  milestoneFormCancel.hidden = true;
  milestoneFormError.textContent = '';
  milestoneFormError.hidden = true;
}

function renderMilestoneList(): void {
  milestoneList.replaceChildren();
  milestoneListEmpty.hidden = projectMilestones.length > 0;
  for (const milestone of projectMilestones) {
    const row = document.createElement('li');
    row.className = 'milestone-row';
    const info = document.createElement('div');
    info.className = 'milestone-row-info';
    const name = document.createElement('strong');
    name.textContent = milestone.name;
    const dueDate = document.createElement('span');
    dueDate.textContent = milestone.due_date === null ? 'No due date' : `Due ${milestone.due_date}`;
    const milestoneIssues = projectIssues.filter((issue) => issue.milestone_id === milestone.id);
    const progress = milestoneProgress(milestoneIssues);
    const progressLabel = document.createElement('span');
    progressLabel.className = `milestone-row-progress${progress.complete ? ' is-complete' : ''}`;
    if (progress.active === 0) {
      progressLabel.textContent = progress.cancelled > 0
        ? `No active issues · ${progress.cancelled} cancelled`
        : 'No issues yet';
    } else {
      const completion = progress.complete ? '✓ Complete · ' : '';
      const cancelled = progress.cancelled > 0 ? ` · ${progress.cancelled} cancelled` : '';
      progressLabel.textContent = `${completion}${progress.done}/${progress.active} issues done${cancelled}`;
    }
    info.append(name, dueDate, progressLabel);

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'button button-quiet';
    edit.textContent = 'Edit';
    edit.setAttribute('aria-label', `Edit milestone: ${milestone.name}`);
    edit.addEventListener('click', () => {
      editingMilestoneId = milestone.id;
      milestoneNameInput.value = milestone.name;
      milestoneDueDateInput.value = milestone.due_date ?? '';
      milestoneFormHeading.textContent = 'Edit milestone';
      milestoneFormSubmit.textContent = 'Save milestone';
      milestoneFormCancel.hidden = false;
      milestoneFormError.textContent = '';
      milestoneFormError.hidden = true;
      milestoneNameInput.focus();
    });
    row.append(info, edit);
    milestoneList.append(row);
  }
}

function openMilestoneManager(): void {
  if (activeProject === null) return;
  resetMilestoneForm();
  renderMilestoneList();
  milestoneManagerDialog.showModal();
  milestoneNameInput.focus();
}

function closeMilestoneManager(): void {
  if (milestoneManagerDialog.open) milestoneManagerDialog.close();
}

async function saveMilestone(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const projectId = activeProject?.id;
  if (projectId === undefined) return;
  const editingId = editingMilestoneId;
  const path = editingId === null
    ? `/projects/${projectId}/milestones`
    : `/projects/${projectId}/milestones/${editingId}`;
  const payload = {
    name: milestoneNameInput.value.trim(),
    due_date: milestoneDueDateInput.value === '' ? null : milestoneDueDateInput.value,
  };
  milestoneFormError.textContent = '';
  milestoneFormError.hidden = true;
  milestoneFormSubmit.disabled = true;
  milestoneFormCancel.disabled = true;
  milestoneManagerClose.disabled = true;
  milestoneNameInput.disabled = true;
  milestoneDueDateInput.disabled = true;
  try {
    await api<{ milestone: Milestone }>(path, {
      method: editingId === null ? 'POST' : 'PATCH',
      body: JSON.stringify(payload),
    });
    const result = await api<{ milestones: Milestone[] }>(`/projects/${projectId}/milestones`);
    if (activeProject?.id !== projectId) return;
    projectMilestones = result.milestones;
    renderMilestoneList();
    if (selectedIssue !== null) renderIssueDetail();
    populateIssueMilestoneSelect(issueDetailMilestoneInput, selectedIssue?.milestone_id ?? null);
    resetMilestoneForm();
    report(editingId === null ? 'Milestone created.' : 'Milestone updated.');
    if (milestoneManagerDialog.open) milestoneNameInput.focus();
  } catch (error) {
    if (error instanceof ApiFailure && error.status === 401) {
      closeMilestoneManager();
      showSignedOut();
      return;
    }
    milestoneFormError.textContent = error instanceof Error ? error.message : 'Could not save the milestone.';
    milestoneFormError.hidden = false;
    if (milestoneManagerDialog.open) milestoneNameInput.focus();
  } finally {
    milestoneFormSubmit.disabled = false;
    milestoneFormCancel.disabled = false;
    milestoneManagerClose.disabled = false;
    milestoneNameInput.disabled = false;
    milestoneDueDateInput.disabled = false;
  }
}

async function loadProjectDetail(
  projectId: number,
  tab: 'issues' | 'members' = 'issues',
  recordHistory = true,
): Promise<void> {
  const previousLocation = currentWorkspaceLocation();
  if (milestoneManagerDialog.open) closeMilestoneManager();
  stopChatPolling();
  selectedIssue = null;
  issueDetailEditForm.hidden = true;
  issueDetailDisplay.hidden = false;
  try {
    const [result, milestoneResult] = await Promise.all([
      api<{ project: Project; members: Member[] }>(`/projects/${projectId}`),
      api<{ milestones: Milestone[] }>(`/projects/${projectId}/milestones`),
    ]);
    const nextLocation: WorkspaceLocation = { view: 'project', projectId, tab };
    if (recordHistory && !sameWorkspaceLocation(previousLocation, nextLocation)) {
      workspaceViewHistory.push(previousLocation);
    }
    activeProject = result.project;
    activeProjectMembers = result.members;
    projectMilestones = milestoneResult.milestones;
    populateIssueAssigneeSelect(issueQuickAddAssignee, null);
    populateIssueAssigneeSelect(issueDetailAssigneeInput, null);
    projectSidebarList.querySelectorAll<HTMLButtonElement>('.project-sidebar-link').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.projectId === String(result.project.id));
    });
    projectDescription.textContent = result.project.description;
    projectDescription.hidden = result.project.description.trim() === '';
    projectState.textContent = result.project.status;
    projectIssues = [];
    deletedProjectIssues = [];
    issueFilter.value = '';
    issueOrder.value = 'updated';
    issueDescriptionDetails.open = false;
    renderProjectIssueBoard();
    showWorkspaceView('project');
    chatView.replaceChildren(createProjectChat(projectId));
    switchProjectTab(tab);
    (tab === 'issues' ? issuesTabButton : membersTabButton).focus();
  } catch (error) {
    workspaceViewHistory.length = 0;
    report(error instanceof Error ? error.message : 'Could not load the project.', true);
    showWorkspaceView('projects');
  }
}

function switchProjectTab(tab: 'issues' | 'members', returnFocusIssueId?: number, loadIssues = true): void {
  if (activeProject === null) return;
  const showingIssueDetail = tab === 'issues' && selectedIssue !== null;
  issuesView.hidden = tab !== 'issues' || showingIssueDetail;
  issueDetailView.hidden = !showingIssueDetail;
  membersView.hidden = tab !== 'members';
  issuesTabButton.classList.toggle('is-active', tab === 'issues');
  membersTabButton.classList.toggle('is-active', tab === 'members');
  issuesTabButton.setAttribute('aria-selected', String(tab === 'issues'));
  membersTabButton.setAttribute('aria-selected', String(tab === 'members'));
  issuesTabButton.tabIndex = tab === 'issues' ? 0 : -1;
  membersTabButton.tabIndex = tab === 'members' ? 0 : -1;
  if (tab === 'issues') {
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

  void loadProjectMembers(activeProject.id);
}

async function loadProjectIssues(projectId: number): Promise<void> {
  try {
    const [result, deletedResult] = await Promise.all([
      api<{ issues: Issue[] }>(`/projects/${projectId}/issues`),
      api<{ issues: Issue[] }>(`/projects/${projectId}/issues/deleted`),
    ]);
    if (activeProject?.id !== projectId || issuesView.hidden) return;
    projectIssues = result.issues;
    deletedProjectIssues = deletedResult.issues;
    renderProjectIssueBoard();
  } catch (error) {
    if (error instanceof ApiFailure && error.status === 401) {
      showSignedOut();
      return;
    }
    report(error instanceof Error ? error.message : 'Could not load project issues.', true);
  }
}

function renderProjectIssueBoard(): void {
  const total = projectIssues.length;
  const completed = projectIssues.filter((issue) => issue.status === 'done').length;
  const cancelled = projectIssues.filter((issue) => issue.status === 'cancelled').length;
  const progressTotal = total - cancelled;
  const open = progressTotal - completed;
  issueProgress.max = Math.max(progressTotal, 1);
  issueProgress.value = completed;
  issueProgress.classList.toggle('is-complete', progressTotal > 0 && completed === progressTotal);
  issueProgressLabel.textContent = cancelled > 0
    ? `${completed} of ${progressTotal} non-cancelled issues done · ${cancelled} cancelled`
    : `${completed} of ${total} issues done`;
  issueCountSummary.textContent = cancelled > 0
    ? `${open} open · ${completed} done · ${cancelled} cancelled`
    : `${open} open · ${completed} done`;

  const searchableIssues = projectIssues.map((issue) => ({
    ...issue,
    assignee_name: issueAssigneeLabel(issue.assignee_id),
    milestone_name: projectMilestones.find((milestone) => milestone.id === issue.milestone_id)?.name ?? null,
    milestone_due_date: projectMilestones.find((milestone) => milestone.id === issue.milestone_id)?.due_date ?? null,
  }));
  const ordered = sortIssues(searchableIssues, issueOrder.value as IssueSortOrder);
  const nextUpMode = issueOrder.value === 'next_up';
  issueGroupingLabel.textContent = nextUpMode ? 'Group: Milestone' : 'Group: Status';
  const workQueue = nextUpMode ? ordered.filter((issue) => ['backlog', 'todo', 'doing'].includes(issue.status)) : ordered;
  const visible = filterIssues(workQueue, issueFilter.value);
  issueList.replaceChildren();
  emptyIssues.hidden = visible.length > 0;
  emptyIssues.textContent = nextUpMode && workQueue.length === 0
    ? 'No open issues to work on next.'
    : total === 0
    ? deletedProjectIssues.length > 0
      ? 'No active issues. Restore one from Deleted issues or create a new issue.'
      : 'No issues yet. Create the first one.'
    : 'No issues match that filter.';

  deletedIssueCount.textContent = String(deletedProjectIssues.length);
  deletedIssuesDetails.hidden = deletedProjectIssues.length === 0;
  deletedIssueList.replaceChildren(...deletedProjectIssues.map(createDeletedIssueRow));

  if (nextUpMode) {
    renderNextUpIssueBoard(visible, workQueue);
    return;
  }

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
    for (const issue of group.issues) rows.append(createIssueRow(issue));
    details.append(summary, rows);
    issueList.append(details);
  }
}

function renderNextUpIssueBoard(visibleIssues: Issue[], allOpenIssues: Issue[]): void {
  const groups = new Map<string, { milestoneId: number | null; name: string; dueDate: string | null; issues: Issue[] }>();
  for (const issue of visibleIssues) {
    const milestoneId = issue.milestone_id;
    const key = milestoneId === null ? 'none' : String(milestoneId);
    let group = groups.get(key);
    if (group === undefined) {
      const milestone = milestoneId === null ? undefined : projectMilestones.find((candidate) => candidate.id === milestoneId);
      group = {
        milestoneId,
        name: milestone?.name ?? 'No milestone',
        dueDate: milestone?.due_date ?? null,
        issues: [],
      };
      groups.set(key, group);
    }
    group.issues.push(issue);
  }

  for (const group of groups.values()) {
    const container = document.createElement('li');
    container.className = 'next-up-group';
    const heading = document.createElement('h3');
    heading.className = 'next-up-group-heading';
    heading.textContent = group.dueDate === null ? group.name : `${group.name} · due ${group.dueDate}`;
    const rows = document.createElement('ul');
    rows.className = 'issue-group-items';

    const allGroupIssues = allOpenIssues.filter((issue) => issue.milestone_id === group.milestoneId);
    for (const issue of group.issues) {
      const index = allGroupIssues.findIndex((candidate) => candidate.id === issue.id);
      rows.append(createIssueRow(issue, {
        canMoveEarlier: index > 0,
        canMoveLater: index >= 0 && index < allGroupIssues.length - 1,
        showMilestoneTag: false,
      }));
    }
    container.append(heading, rows);
    issueList.append(container);
  }
}

function createDeletedIssueRow(issue: Issue): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'deleted-issue-item';
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
  issueDetailAssignee.textContent = issueAssigneeLabel(selectedIssue.assignee_id);
  issueDetailMilestone.textContent = projectMilestones.find((milestone) => milestone.id === selectedIssue?.milestone_id)?.name ?? 'None';
  issueDetailSharing.textContent = selectedIssue.is_shared ? 'Shared with guest' : 'Internal';
  issueDetailApproval.textContent = selectedIssue.approved_at !== null
    ? 'Approved by guest'
    : selectedIssue.approval_requested_at !== null
      ? 'Guest approval requested'
      : 'No guest approval requested';
  issueDetailDescription.textContent = selectedIssue.description || 'No description yet.';
  issueDetailDescription.classList.toggle('is-empty', selectedIssue.description === '');
  issueDetailStatusLabel.textContent = issueStatusLabel(selectedIssue.status);
  issueDetailStatus.setAttribute('aria-label', `Change status for ${selectedIssue.title}. Current status: ${issueStatusLabel(selectedIssue.status)}.`);
  issueSourceLink.hidden = selectedIssue.source_message_id === null;
  if (selectedIssue.source_message_id !== null) {
    issueSourceLink.dataset.messageId = String(selectedIssue.source_message_id);
  } else {
    delete issueSourceLink.dataset.messageId;
  }
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
  issueDetailEditForm.reset();
  issueDetailEditForm.hidden = true;
  issueDetailDisplay.hidden = false;
  if (!issueDetailView.hidden) issueDetailEditButton.focus();
}

function openIssue(issue: Issue): void {
  selectedIssue = issue;
  issueList.querySelectorAll<HTMLElement>('.issue-card').forEach((row) => {
    row.classList.toggle('is-keyboard-selected', row.dataset.issueId === String(issue.id));
  });
  issueDetailDisplay.hidden = false;
  issueDetailEditForm.hidden = true;
  renderIssueDetail();
  switchProjectTab('issues');
  issueBackButton.focus();
}

function openIssueStatusPicker(issue: Issue, returnFocus: HTMLElement): void {
  if (issueStatusPicker.open) issueStatusPicker.close();
  issueStatusPickerIssue = issue;
  issueStatusPickerReturnFocus = returnFocus;
  issueStatusPickerDescription.textContent = `Choose a status for “${issue.title}”. Current status: ${issueStatusLabel(issue.status)}.`;
  issueStatusPickerOptions.replaceChildren();
  issueStatusPickerOptionIndex = ISSUE_STATUS_OPTIONS.findIndex((option) => option.value === issue.status);
  ISSUE_STATUS_OPTIONS.forEach((option, index) => {
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
      issueDetailEditForm.reset();
      issueDetailEditForm.hidden = true;
      issueDetailDisplay.hidden = false;
      switchProjectTab('issues', issue.id);
    } else {
      await loadProjectIssues(projectId);
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
  issueDetailEditForm.reset();
  issueDetailEditForm.hidden = true;
  issueDetailDisplay.hidden = false;
  switchProjectTab('issues', undefined, false);
  void loadProjectIssues(projectId).then(() => {
    if (activeProject?.id !== projectId || issuesView.hidden || deletedProjectIssues.length === 0) return;
    deletedIssuesDetails.open = true;
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
  const status = ISSUE_STATUS_OPTIONS[issueStatusPickerOptionIndex]?.value;
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
    }
    report('Issue status updated.');
    if (issueDetailView.hidden) await loadProjectIssues(issue.project_id);
  } catch (error) {
    report(error instanceof Error ? error.message : 'Could not update the issue status.', true);
  }
}

function createIssueRow(
  issue: Issue,
  reorder?: { canMoveEarlier: boolean; canMoveLater: boolean; showMilestoneTag?: boolean },
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
  const title = document.createElement('button');
  title.className = 'issue-title issue-title-button';
  title.type = 'button';
  title.textContent = issue.title;
  title.addEventListener('click', () => openIssue(issue));
  mainline.append(indicator, key, title);
  const metadata = document.createElement('div');
  metadata.className = 'issue-metadata';
  const type = document.createElement('span');
  type.className = 'issue-type-tag';
  type.textContent = issueTypeLabel(issue.type);
  const assignee = document.createElement('span');
  assignee.className = 'issue-assignee-label';
  assignee.textContent = `Assignee: ${issueAssigneeLabel(issue.assignee_id)}`;
  metadata.append(type);
  if (issue.is_shared) {
    const shared = document.createElement('span');
    shared.className = 'issue-shared-tag';
    shared.textContent = 'Shared';
    shared.title = 'Shared with guest';
    metadata.append(shared);
  }
  if (issue.milestone_name !== null && issue.milestone_name !== undefined && reorder?.showMilestoneTag !== false) {
    const milestone = document.createElement('span');
    milestone.className = 'issue-milestone-tag';
    milestone.textContent = issue.milestone_name;
    milestone.title = issue.milestone_name;
    metadata.append(milestone);
  }
  metadata.append(assignee);
  content.append(mainline, metadata);
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

  if (reorder === undefined) {
    item.append(content, createIssueStatusButton(issue));
  } else {
    const actions = document.createElement('div');
    actions.className = 'issue-row-actions';
    for (const direction of ['up', 'down'] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button button-quiet issue-order-button';
      button.dataset.moveDirection = direction;
      button.disabled = direction === 'up' ? !reorder.canMoveEarlier : !reorder.canMoveLater;
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
    issueList.querySelector<HTMLButtonElement>(
      `.issue-card[data-issue-id="${issue.id}"] [data-move-direction="${direction}"]`,
    )?.focus();
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

issueDetailEditButton.addEventListener('click', () => {
  if (selectedIssue === null) return;
  issueDetailTitleInput.value = selectedIssue.title;
  issueDetailDescriptionInput.value = selectedIssue.description;
  issueDetailTypeInput.value = selectedIssue.type;
  populateIssueAssigneeSelect(issueDetailAssigneeInput, selectedIssue.assignee_id);
  populateIssueMilestoneSelect(issueDetailMilestoneInput, selectedIssue.milestone_id);
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
  issueDetailEditForm.reset();
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
        type: issueDetailTypeInput.value,
        assignee_id: issueDetailAssigneeInput.value === '' ? null : Number(issueDetailAssigneeInput.value),
        milestone_id: issueDetailMilestoneInput.value === '' ? null : Number(issueDetailMilestoneInput.value),
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

  memberForm.hidden = activeUser?.role !== 'admin';
  updateMembersPanelTabIndex();
  if (memberForm.hidden) return;

  try {
    const result = await api<{ users: User[] }>('/users');
    if (activeProject?.id !== projectId || membersView.hidden) return;
    memberSelect.replaceChildren();
    for (const candidate of result.users.filter(
      (user) => !activeProjectMembers.some((member) => member.id === user.id),
    )) {
      const option = document.createElement('option');
      option.value = String(candidate.id);
      option.textContent = `${candidate.name} · ${candidate.email}`;
      memberSelect.append(option);
    }
    addMemberButton.disabled = memberSelect.options.length === 0;
    updateMembersPanelTabIndex();
  } catch (error) {
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

function updateMembersPanelTabIndex(): void {
  const hasFocusableContent = Array.from(membersView.querySelectorAll<HTMLElement>(
    'a[href], button, input, select, textarea, [tabindex]',
  )).some((element) => element.tabIndex >= 0 && !element.matches(':disabled') && element.closest('[hidden]') === null);
  membersView.tabIndex = hasFocusableContent ? -1 : 0;
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = new FormData(loginForm);
  try {
    const result = await api<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: values.get('email'), password: values.get('password') }),
    });
    showSignedIn(result.user);
    if (result.user.role === 'guest') return;
    await loadWorkspaces();
    await loadProjects();
  } catch (error) {
    report(error instanceof Error ? error.message : 'Could not sign in.', true);
  }
});

workspaceSwitcher.addEventListener('click', () => openWorkspacePicker());
workspacePickerCancel.addEventListener('click', () => resetPendingWorkspaceSwitch());
workspacePickerConfirm.addEventListener('click', commitPendingWorkspaceSwitch);
workspacePicker.addEventListener('close', () => {
  pendingWorkspaceId = null;
  if (!workspacePanel.hidden && !workspaceSwitcher.disabled
    && !commandPalette.open && !shortcutHelp.open && !issueStatusPicker.open) workspaceSwitcher.focus();
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
    await api('/projects', {
      method: 'POST',
      body: JSON.stringify({ name: values.get('name'), description: values.get('description') }),
    });
    closeProjectForm();
    report('Project created.');
    await loadProjects();
  } catch (error) {
    if (!projectFormPanel.hidden) projectForm.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
    report(error instanceof Error ? error.message : 'Could not create project.', true);
  }
});

developerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = new FormData(developerForm);
  const role = values.get('role') === 'guest' ? 'guest' : 'developer';
  try {
    await api('/users', {
      method: 'POST',
      body: JSON.stringify({
        name: values.get('name'),
        email: values.get('email'),
        password: values.get('password'),
        role,
      }),
    });
    developerForm.reset();
    report(role === 'guest'
      ? 'Guest added. Open a project to add them and share the client view.'
      : 'Developer added. Open a project to add them as a member.');
  } catch (error) {
    report(error instanceof Error ? error.message : 'Could not add developer.', true);
  }
});

function showGuestShell(user: User): void {
  loginShell.hidden = true;
  loginPanel.hidden = true;
  workspacePanel.hidden = true;
  accountBar.hidden = true;
  keyboardHints.hidden = true;
  guestShell.hidden = false;
  guestUser.textContent = user.email;
  document.body.classList.add('is-guest');
  void loadGuestProjects();
}

async function loadGuestProjects(): Promise<void> {
  try {
    const result = await api<{ projects: GuestProject[] }>('/projects');
    guestProjectSelect.replaceChildren(...result.projects.map((project) => {
      const option = document.createElement('option');
      option.value = String(project.id);
      option.textContent = project.name;
      return option;
    }));
    guestProjectLabel.hidden = result.projects.length < 2;
    if (result.projects.length === 0) {
      renderClientEmptyState(guestMain, 'No projects have been shared with you yet.');
      return;
    }
    await loadClientView(result.projects[0].id);
  } catch (error) {
    if (error instanceof ApiFailure && error.status === 401) { showSignedOut(); return; }
    report(error instanceof Error ? error.message : 'Could not load your projects.', true);
  }
}

async function loadClientView(projectId: number): Promise<void> {
  try {
    const view = await api<ClientView>(`/projects/${projectId}/client-view`);
    guestTitle.textContent = 'Client portal';
    renderClientView(guestMain, view, {
      userId: activeUser?.id ?? 0,
      approve: async (approvalId) => {
        await api(`/approvals/${approvalId}/approve`, { method: 'POST' });
        await loadClientView(projectId);
      },
      comment: async (body) => {
        await api(`/projects/${projectId}/client-comments`, { method: 'POST', body: JSON.stringify({ body }) });
        await loadClientView(projectId);
      },
    });
  } catch (error) {
    if (error instanceof ApiFailure && error.status === 401) { showSignedOut(); return; }
    report(error instanceof Error ? error.message : 'Could not load the client view.', true);
  }
}

guestProjectSelect.addEventListener('change', () => { void loadClientView(Number(guestProjectSelect.value)); });
guestLogoutButton.addEventListener('click', () => { void signOut(); });
inboxMarkAllReadButton.addEventListener('click', () => { void markAllInboxEventsRead(); });

async function signOut(): Promise<void> {
  try {
    await api('/auth/logout', { method: 'POST' });
  } finally {
    showSignedOut();
  }
}

logoutButton.addEventListener('click', () => { void signOut(); });

async function start(): Promise<void> {
  try {
    const result = await api<{ user: User }>('/auth/me');
    showSignedIn(result.user);
    if (result.user.role === 'guest') return;
    await loadWorkspaces();
    await loadProjects();
  } catch (error) {
    showSignedOut();
    if (error instanceof ApiFailure && error.status !== 401) {
      report(error.message, true);
    }
  }
}

void start();
