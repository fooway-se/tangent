import {
  INBOX_TABS, createEventRow, eventsForTab, tabCount, type InboxEvent, type InboxTab,
} from './inbox-events.js';
import {
  diffInboxCollections,
  nextInboxPollDelay,
  shouldDeferInboxUpdates,
} from './inbox-polling.js';
import { renderClientEmptyState, renderClientView, type ClientView } from './guest-view.js';
import { resolveShortcut, shouldSubmitOnEnter, type ShortcutAction } from './shortcuts.js';
import { parseQuickIssueInput } from './quick-issue.js';
import {
  filterIssues,
  groupIssues,
  groupIssuesByMilestone,
  milestoneProgress,
  sortIssues,
  type BoardIssue,
  type IssueSortOrder,
  type IssueStatus,
} from './issue-board.js';
import {
  diffIssueCollections,
  nextIssuePollDelay,
  shouldDeferIssueUpdates,
} from './issue-polling.js';

type Role = 'admin' | 'developer' | 'guest';
type IssueType = 'task' | 'bug' | 'feature' | 'research' | 'maintenance';
type IssueGrouping = 'status' | 'milestone';

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

interface WorkspaceMember extends User {
  is_active: boolean;
  created_at: string;
}

interface WorkspaceInvite {
  id: number;
  email: string;
  name: string;
  role: 'developer' | 'guest';
  project_ids: number[];
  expires_at: string;
  created_at: string;
}

interface InvitePreview {
  name: string;
  email: string;
  workspace_name: string;
  role: 'developer' | 'guest';
  project_ids: number[];
  password_required: boolean;
}

type CredentialFragment = { type: 'invite' | 'reset'; token: string };

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

interface ConditionalIssueList {
  issues: Issue[] | null;
  etag: string | null;
}

interface ConditionalInboxCollection<T> {
  items: T[] | null;
  etag: string | null;
}

interface IssueStatusTransition {
  id: number;
  from_status: IssueStatus | null;
  to_status: IssueStatus;
  actor_name: string;
  created_at: string;
}

interface IssueBoardGroup {
  key: string;
  name: string;
  className: string;
  issues: Issue[];
  reorderByIssueId?: Map<number, { canMoveEarlier?: boolean; canMoveLater?: boolean; showMilestoneTag?: boolean }>;
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
  parent_author_name?: string | null;
  parent_body?: string | null;
  reply_count?: number;
  first_reply_id?: number | null;
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
const workspaceMembersList = document.querySelector<HTMLUListElement>('#workspace-members-list')!;
const workspaceMembersEmpty = document.querySelector<HTMLElement>('#workspace-members-empty')!;
const inviteForm = document.querySelector<HTMLFormElement>('#invite-form')!;
const generatedCredentialLink = document.querySelector<HTMLElement>('#generated-credential-link')!;
const generatedCredentialHeading = document.querySelector<HTMLElement>('#generated-credential-heading')!;
const generatedCredentialDescription = document.querySelector<HTMLElement>('#generated-credential-description')!;
const generatedCredentialUrl = document.querySelector<HTMLInputElement>('#generated-credential-url')!;
const copyGeneratedCredentialLink = document.querySelector<HTMLButtonElement>('#copy-generated-credential-link')!;
const generatedCredentialCopyStatus = document.querySelector<HTMLElement>('#generated-credential-copy-status')!;
const inviteRoleInput = document.querySelector<HTMLSelectElement>('#invite-role')!;
const inviteProjectSelection = document.querySelector<HTMLElement>('#invite-project-selection')!;
const inviteProjectOptions = document.querySelector<HTMLElement>('#invite-project-options')!;
const workspaceInvitesList = document.querySelector<HTMLUListElement>('#workspace-invites-list')!;
const workspaceInvitesEmpty = document.querySelector<HTMLElement>('#workspace-invites-empty')!;
const loginAdminHelp = document.querySelector<HTMLElement>('#login-admin-help')!;
const credentialFlow = document.querySelector<HTMLElement>('#credential-flow')!;
const credentialFlowHeading = document.querySelector<HTMLHeadingElement>('#credential-flow-heading')!;
const credentialFlowDescription = document.querySelector<HTMLElement>('#credential-flow-description')!;
const credentialFlowError = document.querySelector<HTMLElement>('#credential-flow-error')!;
const credentialForm = document.querySelector<HTMLFormElement>('#credential-form')!;
const credentialPasswordFields = document.querySelector<HTMLElement>('#credential-password-fields')!;
const credentialSubmit = document.querySelector<HTMLButtonElement>('#credential-submit')!;
const credentialCancel = document.querySelector<HTMLButtonElement>('#credential-cancel')!;
const projectForm = document.querySelector<HTMLFormElement>('#project-form')!;
const toggleProjectFormButton = document.querySelector<HTMLButtonElement>('#toggle-project-form')!;
const cancelProjectFormButton = document.querySelector<HTMLButtonElement>('#cancel-project-form')!;
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
const issueQuickAddMilestone = document.querySelector<HTMLSelectElement>('#issue-quick-add-milestone')!;
const issueQuickAddShared = document.querySelector<HTMLInputElement>('#issue-quick-add-shared')!;
const issueQuickAddApproval = document.querySelector<HTMLInputElement>('#issue-quick-add-approval')!;
const issueQuickAddCancelButton = document.querySelector<HTMLButtonElement>('#issue-quick-add-cancel')!;
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
const issueStatusHistory = document.querySelector<HTMLDetailsElement>('#issue-status-history')!;
const issueStatusHistoryCount = document.querySelector<HTMLElement>('#issue-status-history-count')!;
const issueStatusHistoryEmpty = document.querySelector<HTMLElement>('#issue-status-history-empty')!;
const issueStatusHistoryList = document.querySelector<HTMLOListElement>('#issue-status-history-list')!;
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
const issueGrouping = document.querySelector<HTMLSelectElement>('#issue-grouping')!;
const issueOrder = document.querySelector<HTMLSelectElement>('#issue-order')!;
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
let credentialFragment: CredentialFragment | null = null;
let invitePreview: InvitePreview | null = null;
let adminProjects: Project[] = [];
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
let issueGroupingBeforeNextUp: IssueGrouping = 'status';
let issueGroupingForcedByNextUp = false;
let inboxIssues: InboxIssue[] = [];
let inboxEvents: InboxEvent[] = [];
let inboxTab: InboxTab = 'assigned';
let inboxIssuesEtag: string | null = null;
let inboxEventsEtag: string | null = null;
let inboxPollTimer: number | null = null;
let inboxPollDelay = 1000;
let inboxPollInFlight = false;
let inboxPollRequestVersion = 0;
let inboxPollHasDeferredChanges = false;
let inboxMutationPending = 0;
const inboxIssueRowRenderSignatures = new WeakMap<HTMLLIElement, string>();
const inboxEventRowRenderSignatures = new WeakMap<HTMLLIElement, string>();
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
let issuePollTimer: number | null = null;
let issuePollDelay = 1000;
let activeIssuesEtag: string | null = null;
let deletedIssuesEtag: string | null = null;
let issuePollHasDeferredChanges = false;
let issuePollInFlightProjectId: number | null = null;
let issuePollRequestVersion = 0;
let issueStatusHistoryRequestVersion = 0;
const issueRowRenderSignatures = new WeakMap<HTMLLIElement, string>();
const deletedIssueRowRenderSignatures = new WeakMap<HTMLLIElement, string>();
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
  resetAuthForms();
  workspaceViewHistory.length = 0;
  projectReturnFocusId = null;
  issueQuickAddSourceMessageId = null;
  issueQuickAddSourceProjectId = null;
  issueQuickAddReturnFocus = null;
  stopIssuePolling();
  stopInboxPolling();
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
  inboxIssues = [];
  inboxEvents = [];
  inboxIssueList.replaceChildren();
  inboxEmptyState.hidden = false;
  inboxEmptyState.textContent = 'You have no open issues assigned to you.';
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
  if (view !== 'inbox') {
    stopInboxPolling();
    inboxIssues = [];
    inboxEvents = [];
  }
  if (view !== 'project') {
    if (activeProject !== null) projectReturnFocusId = activeProject.id;
    stopChatPolling();
    stopIssuePolling();
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
  void loadWorkspaceAdmin();
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
    adminProjects = projects.projects.filter((project) => project.status === 'active');
    renderWorkspaceMembers(members.users);
    renderWorkspaceInvites(invites.invites);
    renderInviteProjectOptions();
  } catch (error) {
    report(error instanceof Error ? error.message : 'Could not load workspace administration.', true);
  }
}

function renderWorkspaceMembers(members: readonly WorkspaceMember[]): void {
  workspaceMembersList.replaceChildren();
  workspaceMembersEmpty.hidden = members.length > 0;
  for (const member of members) {
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `${member.name} · ${member.email} · ${member.role}${member.is_active ? '' : ' · inactive'}`;
    const resetLinkButton = document.createElement('button');
    resetLinkButton.type = 'button';
    resetLinkButton.className = 'button button-quiet';
    resetLinkButton.textContent = 'Generate reset link';
    resetLinkButton.setAttribute('aria-label', `Generate password reset link for ${member.name}`);
    resetLinkButton.addEventListener('click', () => void generateMemberPasswordResetLink(member));
    item.append(label, resetLinkButton);
    workspaceMembersList.append(item);
  }
}

function renderWorkspaceInvites(invites: readonly WorkspaceInvite[]): void {
  workspaceInvitesList.replaceChildren();
  workspaceInvitesEmpty.hidden = invites.length > 0;
  for (const invite of invites) {
    const item = document.createElement('li');
    item.className = 'workspace-invite-row';
    const details = document.createElement('span');
    details.textContent = `${invite.name} · ${invite.email} · ${invite.role} · Expires ${new Date(`${invite.expires_at}Z`).toLocaleDateString()}`;
    const actions = document.createElement('div');
    actions.className = 'workspace-invite-actions';
    const newLink = document.createElement('button');
    newLink.type = 'button';
    newLink.className = 'button button-quiet';
    newLink.textContent = 'Generate new link';
    newLink.dataset.inviteId = String(invite.id);
    newLink.dataset.inviteAction = 'link';
    newLink.addEventListener('click', () => void generateNewInviteLink(invite.id));
    const revoke = document.createElement('button');
    revoke.type = 'button';
    revoke.className = 'button button-quiet button-danger';
    revoke.textContent = 'Revoke';
    revoke.dataset.inviteId = String(invite.id);
    revoke.dataset.inviteAction = 'revoke';
    revoke.addEventListener('click', () => void revokeWorkspaceInvite(invite.id));
    actions.append(newLink, revoke);
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

function showGeneratedCredentialLink(heading: string, description: string, url: string): void {
  generatedCredentialHeading.textContent = heading;
  generatedCredentialDescription.textContent = description;
  generatedCredentialUrl.value = url;
  generatedCredentialCopyStatus.textContent = '';
  generatedCredentialLink.hidden = false;
  copyGeneratedCredentialLink.focus();
}

async function generateMemberPasswordResetLink(member: WorkspaceMember): Promise<void> {
  generatedCredentialLink.hidden = true;
  try {
    const result = await api<{ reset_url: string }>(`/users/${member.id}/password-reset`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    showGeneratedCredentialLink(
      'Password reset link',
      `Copy this one-hour link and send it to ${member.email}.`,
      result.reset_url,
    );
    report('Password reset link generated.');
  } catch (error) {
    report(error instanceof Error ? error.message : 'Could not generate the password reset link.', true);
  }
}

async function generateNewInviteLink(inviteId: number): Promise<void> {
  generatedCredentialLink.hidden = true;
  try {
    const result = await api<{ invite: WorkspaceInvite & { invite_url: string } }>(`/users/invites/${inviteId}/link`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    showGeneratedCredentialLink(
      'New invite link',
      `Copy this seven-day link and send it to ${result.invite.email}. The previous link no longer works.`,
      result.invite.invite_url,
    );
    report('New invite link generated.');
    await loadWorkspaceAdmin();
    copyGeneratedCredentialLink.focus();
  } catch (error) {
    report(error instanceof Error ? error.message : 'Could not generate a new invite link.', true);
  }
}

copyGeneratedCredentialLink.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(generatedCredentialUrl.value);
    generatedCredentialCopyStatus.textContent = 'Link copied.';
  } catch {
    generatedCredentialUrl.focus();
    generatedCredentialUrl.select();
    generatedCredentialCopyStatus.textContent = 'Link selected. Copy it with Ctrl+C or Command+C.';
  }
});

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
    || memberRemovalConfirmation.open || milestoneManagerDialog.open;
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
  const response = await fetch(`/api/v1/projects/${projectId}/issues${suffix}`, {
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
    const [activeResult, deletedResult] = await Promise.all([
      fetchConditionalIssueList(projectId, false, activeEtag),
      fetchConditionalIssueList(projectId, true, deletedEtag),
    ]);
    if (requestVersion !== issuePollRequestVersion || !issuePollingIsActive(projectId)) return;
    const deferUpdates = deferUpdatesAtStart || issueUpdatesAreDeferred();

    const incomingIssues = activeResult.issues ?? projectIssues;
    const incomingDeletedIssues = deletedResult.issues ?? deletedProjectIssues;
    const activeDiff = diffIssueCollections(projectIssues, incomingIssues);
    const deletedDiff = diffIssueCollections(deletedProjectIssues, incomingDeletedIssues);
    const changedIssueIds = [...activeDiff.added, ...activeDiff.changed, ...activeDiff.removed];
    const changedDeletedIssueIds = [...deletedDiff.added, ...deletedDiff.changed, ...deletedDiff.removed];
    changed = changedIssueIds.length > 0 || changedDeletedIssueIds.length > 0;

    activeIssuesEtag = activeResult.etag;
    deletedIssuesEtag = deletedResult.etag;
    if (deferUpdates && changed) {
      issuePollHasDeferredChanges = true;
    } else if (!deferUpdates) {
      projectIssues = incomingIssues;
      deletedProjectIssues = incomingDeletedIssues;
      issuePollHasDeferredChanges = false;
      if (changed) {
        if (selectedIssue !== null) {
          const selectedIssueId = selectedIssue.id;
          const previousSelectedStatus = selectedIssue.status;
          const refreshedSelectedIssue = projectIssues.find((issue) => issue.id === selectedIssueId);
          if (refreshedSelectedIssue !== undefined) {
            selectedIssue = refreshedSelectedIssue;
            if (activeDiff.added.includes(selectedIssueId) || activeDiff.changed.includes(selectedIssueId)) {
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
    issueGroupFocused: target instanceof HTMLElement && target.closest('.issue-group > summary') !== null,
    statusHistoryFocused: issueStatusHistory.open && issueStatusHistory.contains(document.activeElement),
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
  issueQuickAddSourceMessageId = message.id;
  issueQuickAddSourceProjectId = projectId;
  issueQuickAddReturnFocus = trigger;
  issueQuickAddTitle.value = Array.from(message.body).slice(0, 200).join('');
  issueDescriptionDetails.open = false;
  issueQuickAddEscapePending = false;
  updateIssueQuickAddApproval();
  selectedIssue = null;
  issueDetailEditForm.hidden = true;
  issueDetailDisplay.hidden = false;
  switchProjectTab('issues');
  setIssueQuickAddActive(true);
  issueQuickAddTitle.focus();
  issueQuickAddTitle.setSelectionRange(issueQuickAddTitle.value.length, issueQuickAddTitle.value.length);
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
  } else if (!workspacePanel.hidden && !projectView.hidden
    && (issueQuickAddEscapePending || issueForm.classList.contains('is-active'))) {
    cancelIssueQuickAdd();
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

function cancelIssueQuickAdd(): void {
  issueForm.reset();
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
    || issueQuickAddShared.checked
    || issueQuickAddApproval.checked;
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
      setIssueQuickAddActive(false);
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
    case 'collapse-status-history': issueStatusHistory.open = false; break;
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
  chatCursor = Math.max(chatCursor, message.id);
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

function scrollChatToBottom(): void {
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
issueQuickAddTitle.addEventListener('input', () => issueQuickAddTitle.setCustomValidity(''));
projectForm.querySelector<HTMLTextAreaElement>('textarea[name="description"]')
  ?.addEventListener('keydown', (event) => submitFormOnEnter(event, projectForm));
issueDescriptionInput?.addEventListener('keydown', (event) => submitFormOnEnter(event, issueForm));
issueDetailDescriptionInput.addEventListener('keydown', (event) => submitFormOnEnter(event, issueDetailEditForm));
issueFilter.addEventListener('input', renderProjectIssueBoard);
issueGrouping.addEventListener('change', renderProjectIssueBoard);
issueOrder.addEventListener('change', handleIssueOrderChange);

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
  const parsedIssue = parseQuickIssueInput(String(values.get('title') ?? ''), activeProjectMembers, projectMilestones);
  if (parsedIssue.title === '') {
    issueQuickAddTitle.setCustomValidity('Enter an issue title before the optional fields.');
    issueQuickAddTitle.reportValidity();
    return;
  }
  issueQuickAddTitle.setCustomValidity('');
  const assigneeValue = values.get('assignee_id');
  const milestoneValue = values.get('milestone_id');
  const issueInput: Record<string, unknown> = {
    title: parsedIssue.title,
    description: values.get('description'),
    type: parsedIssue.type ?? values.get('type'),
    assignee_id: parsedIssue.assigneeId
      ?? (typeof assigneeValue === 'string' && assigneeValue !== '' ? Number(assigneeValue) : null),
  };
  if (parsedIssue.milestoneId !== undefined) issueInput.milestone_id = parsedIssue.milestoneId;
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

function loadInboxIssues(): void {
  renderInboxTabs();
  if (!inboxPollingIsActive()) return;
  if (inboxTab === 'assigned') renderInboxIssues();
  else renderInboxEvents();
  inboxPollDelay = 1000;
  scheduleInboxPoll(0);
}

async function fetchConditionalInboxCollection<T extends { id: number }>(
  path: '/inbox' | '/inbox/events',
  key: 'issues' | 'events',
  etag: string | null,
): Promise<ConditionalInboxCollection<T>> {
  const headers = new Headers();
  if (etag !== null) headers.set('If-None-Match', etag);
  const response = await fetch(`/api/v1${path}`, {
    headers,
    credentials: 'same-origin',
  });
  const responseEtag = response.headers.get('ETag') ?? etag;
  if (response.status === 304) return { items: null, etag: responseEtag };

  const payload = await response.json() as Record<string, T[]> & { error?: { message?: string } };
  if (!response.ok) {
    throw new ApiFailure(payload.error?.message ?? 'Could not refresh your inbox.', response.status);
  }
  return { items: payload[key] ?? [], etag: responseEtag };
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
    listFocused: inboxIssueList.contains(document.activeElement),
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
      fetchConditionalInboxCollection<InboxEvent>('/inbox/events', 'events', forceDeferredRefresh ? null : inboxEventsEtag),
    ]);
    if (requestVersion !== inboxPollRequestVersion || !inboxPollingIsActive()) return;

    const incomingIssues = issuesResult.items ?? inboxIssues;
    const incomingEvents = eventsResult.items ?? inboxEvents;
    const issuesDiff = diffInboxCollections(inboxIssues, incomingIssues);
    const eventsDiff = diffInboxCollections(inboxEvents, incomingEvents);
    const issuesChanged = issuesDiff.added.length > 0 || issuesDiff.changed.length > 0
      || issuesDiff.removed.length > 0 || issuesDiff.orderChanged;
    const eventsChanged = eventsDiff.added.length > 0 || eventsDiff.changed.length > 0
      || eventsDiff.removed.length > 0 || eventsDiff.orderChanged;
    changed = issuesChanged || eventsChanged;
    inboxIssuesEtag = issuesResult.etag;
    inboxEventsEtag = eventsResult.etag;

    const deferUpdates = deferUpdatesAtStart || inboxUpdatesAreDeferred();
    if (deferUpdates && changed) {
      inboxPollHasDeferredChanges = true;
    } else if (!deferUpdates) {
      if (issuesChanged) inboxIssues = incomingIssues;
      if (eventsChanged) inboxEvents = incomingEvents;
      inboxPollHasDeferredChanges = false;
      if (issuesChanged && inboxTab === 'assigned') renderInboxIssues();
      if (eventsChanged) {
        renderInboxTabs();
        if (inboxTab !== 'assigned') renderInboxEvents();
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
    const count = tabCount(inboxEvents, tab.id);
    button.textContent = count === null || count === 0 ? tab.label : `${tab.label} ${count}`;
    placeNodeAtPosition(inboxTabsElement, button, index);
    existing.delete(tab.id);
  }
  for (const button of existing.values()) button.remove();
  inboxMarkAllReadButton.hidden = inboxTab === 'assigned' || inboxTab === 'done';
}

function selectInboxTab(tab: InboxTab): void {
  inboxTab = tab;
  renderInboxTabs();
  if (tab === 'assigned') {
    renderInboxIssues();
  } else {
    renderInboxEvents();
  }
  scheduleInboxPoll(0);
}

function reconcileInboxRows<T extends { id: number }>(
  list: HTMLUListElement,
  items: readonly T[],
  dataKey: 'issueId' | 'eventId',
  signatures: WeakMap<HTMLLIElement, string>,
  create: (item: T) => HTMLLIElement,
): void {
  const existingRows = new Map(
    Array.from(list.querySelectorAll<HTMLLIElement>(':scope > .inbox-issue-card'))
      .map((row) => [Number(row.dataset[dataKey]), row]),
  );
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const focusedRow = focused?.closest<HTMLLIElement>('.inbox-issue-card') ?? null;
  const focusedRowId = focusedRow === null ? null : Number(focusedRow.dataset[dataKey]);
  const focusedIndex = focusedRow === null ? -1 : Array.from(list.children).indexOf(focusedRow);
  const focusSelector = focused?.matches('.issue-title-button') ? '.issue-title-button'
    : focused?.matches('.inbox-event-read') ? '.inbox-event-read'
    : focused?.matches('.inbox-event-done') ? '.inbox-event-done'
    : null;
  const expectedIds = new Set<number>();

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
  const events = eventsForTab(inboxEvents, inboxTab);
  const unread = inboxEvents.filter((event) => !event.done && !event.read).length;
  inboxSummary.textContent = `${unread} unread ${unread === 1 ? 'event' : 'events'}.`;
  reconcileInboxRows(inboxIssueList, events, 'eventId', inboxEventRowRenderSignatures, (event) => createEventRow(event, {
    open: (target) => void openInboxEvent(target),
    toggleRead: (target) => void updateInboxEvent(target, { read: !target.read }),
    toggleDone: (target) => void updateInboxEvent(target, { done: !target.done, read: true }),
  }));
  inboxEmptyState.textContent = 'Nothing here.';
  inboxEmptyState.hidden = events.length > 0;
}

async function updateInboxEvent(event: InboxEvent, change: { read?: boolean; done?: boolean }): Promise<void> {
  inboxMutationPending += 1;
  try {
    const result = await api<{ event: InboxEvent }>(`/inbox/events/${event.id}`, {
      method: 'PATCH',
      body: JSON.stringify(change),
    });
    inboxEvents = inboxEvents.map((candidate) => (candidate.id === event.id ? result.event : candidate));
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
  reconcileInboxRows(inboxIssueList, inboxIssues, 'issueId', inboxIssueRowRenderSignatures, createInboxIssueRow);
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
  const quickAddMilestoneId = issueQuickAddMilestone.value === '' ? null : Number(issueQuickAddMilestone.value);
  const detailMilestoneId = issueDetailMilestoneInput.value === '' ? null : Number(issueDetailMilestoneInput.value);
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
    populateIssueMilestoneSelect(issueQuickAddMilestone, quickAddMilestoneId);
    populateIssueMilestoneSelect(
      issueDetailMilestoneInput,
      issueDetailEditForm.hidden ? selectedIssue?.milestone_id ?? null : detailMilestoneId,
    );
    renderProjectIssueBoard();
    if (selectedIssue !== null) renderIssueDetail();
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
  stopIssuePolling();
  if (issueQuickAddSourceProjectId !== null && issueQuickAddSourceProjectId !== projectId) {
    issueForm.reset();
    issueQuickAddSourceMessageId = null;
    issueQuickAddSourceProjectId = null;
    issueQuickAddReturnFocus = null;
    issueQuickAddEscapePending = false;
    issueDescriptionDetails.open = false;
    setIssueQuickAddActive(false);
    updateIssueQuickAddApproval();
  }
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
    populateIssueMilestoneSelect(issueQuickAddMilestone, null);
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
    synchronizeIssueGroupingForOrder();
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
  if (tab !== 'issues') pauseIssuePolling();
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
  pauseIssuePolling();
  try {
    const [result, deletedResult] = await Promise.all([
      fetchConditionalIssueList(projectId, false, null),
      fetchConditionalIssueList(projectId, true, null),
    ]);
    if (activeProject?.id !== projectId || issuesView.hidden) return;
    projectIssues = result.issues ?? [];
    deletedProjectIssues = deletedResult.issues ?? [];
    activeIssuesEtag = result.etag;
    deletedIssuesEtag = deletedResult.etag;
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
  renderProjectIssueBoard();
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
  setTextContentIfChanged(issueProgressLabel, cancelled > 0
    ? `${completed} of ${progressTotal} non-cancelled issues done · ${cancelled} cancelled`
    : `${completed} of ${total} issues done`);
  setTextContentIfChanged(issueCountSummary, cancelled > 0
    ? `${open} open · ${completed} done · ${cancelled} cancelled`
    : `${open} open · ${completed} done`);

  const searchableIssues = projectIssues.map((issue) => ({
    ...issue,
    assignee_name: issueAssigneeLabel(issue.assignee_id),
    milestone_name: projectMilestones.find((milestone) => milestone.id === issue.milestone_id)?.name ?? null,
    milestone_due_date: projectMilestones.find((milestone) => milestone.id === issue.milestone_id)?.due_date ?? null,
  }));
  const ordered = sortIssues(searchableIssues, issueOrder.value as IssueSortOrder);
  const nextUpMode = issueOrder.value === 'next_up';
  const workQueue = nextUpMode ? ordered.filter((issue) => ['backlog', 'todo', 'doing'].includes(issue.status)) : ordered;
  const visible = filterIssues(workQueue, issueFilter.value);
  emptyIssues.hidden = visible.length > 0;
  setTextContentIfChanged(emptyIssues, nextUpMode && workQueue.length === 0
    ? 'No open issues to work on next.'
    : total === 0
    ? deletedProjectIssues.length > 0
      ? 'No active issues. Restore one from Deleted issues or create a new issue.'
      : 'No issues yet. Create the first one.'
      : 'No issues match that filter.');

  setTextContentIfChanged(deletedIssueCount, String(deletedProjectIssues.length));
  deletedIssuesDetails.hidden = deletedProjectIssues.length === 0;
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
  reconcileIssueBoardGroups(groupIssuesByMilestone(visibleIssues, projectMilestones).map((group) => ({
    key: `milestone:${group.milestoneId ?? 'none'}`,
    name: group.dueDate === null ? group.name : `${group.name} · due ${group.dueDate}`,
    className: 'issue-group milestone-issue-group',
    issues: group.issues,
  })));
}

function renderNextUpIssueBoard(visibleIssues: Issue[], allOpenIssues: Issue[]): void {
  const groups = groupIssuesByMilestone(visibleIssues, projectMilestones).map((group) => {
    const allGroupIssues = allOpenIssues.filter((issue) => issue.milestone_id === group.milestoneId);
    const reorderByIssueId = new Map<number, { canMoveEarlier?: boolean; canMoveLater?: boolean; showMilestoneTag?: boolean }>();
    for (const issue of group.issues) {
      const index = allGroupIssues.findIndex((candidate) => candidate.id === issue.id);
      reorderByIssueId.set(issue.id, {
        canMoveEarlier: index > 0,
        canMoveLater: index >= 0 && index < allGroupIssues.length - 1,
        showMilestoneTag: false,
      });
    }
    return {
      key: `milestone:${group.milestoneId ?? 'none'}`,
      name: group.dueDate === null ? group.name : `${group.name} · due ${group.dueDate}`,
      className: 'issue-group milestone-issue-group',
      issues: group.issues,
      reorderByIssueId,
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
      details.open = true;
      details.dataset.groupKey = group.key;
    }
    if (details.className !== group.className) details.className = group.className;
    const summary = details.querySelector<HTMLElement>(':scope > summary') ?? createIssueGroupSummary(group.name, group.issues.length);
    const groupName = summary.querySelector<HTMLElement>('.issue-group-name');
    const groupCount = summary.querySelector<HTMLElement>('.issue-group-count');
    if (groupName !== null) setTextContentIfChanged(groupName, group.name);
    if (groupCount !== null) setTextContentIfChanged(groupCount, String(group.issues.length));
    const rows = details.querySelector<HTMLUListElement>(':scope > .issue-group-items') ?? document.createElement('ul');
    rows.className = 'issue-group-items';
    const expectedIds = new Set<number>();
    for (const [rowIndex, issue] of group.issues.entries()) {
      expectedIds.add(issue.id);
      const reorder = group.reorderByIssueId?.get(issue.id);
      const signature = issueRowSignature(issue, reorder);
      const existing = existingRows.get(issue.id);
      let row: HTMLLIElement;
      if (existing !== undefined && issueRowRenderSignatures.get(existing) === signature) {
        row = existing;
      } else {
        row = createIssueRow(issue, reorder) as HTMLLIElement;
        row.classList.toggle('is-keyboard-selected', selectedIssue?.id === issue.id);
        issueRowRenderSignatures.set(row, signature);
        if (existing !== undefined) replaceIssueRowPreservingFocus(existing, row);
      }
      placeNodeAtPosition(rows, row, rowIndex);
    }
    expectedRowsByGroup.set(group.key, expectedIds);
    placeNodeAtPosition(details, summary, 0);
    placeNodeAtPosition(details, rows, 1);
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
    reorder?.canMoveEarlier,
    reorder?.canMoveLater,
  ]);
}

function replaceIssueRowPreservingFocus(previous: HTMLLIElement, next: HTMLLIElement): void {
  const focused = document.activeElement;
  let focusTarget: string | null = null;
  if (focused instanceof HTMLElement && previous.contains(focused)) {
    if (focused.matches('.issue-title-button')) focusTarget = '.issue-title-button';
    else if (focused.matches('.issue-status-button')) focusTarget = '.issue-status-button';
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
  void loadIssueStatusHistory(issue.id);
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

  const hasReorderActions = reorder?.canMoveEarlier !== undefined || reorder?.canMoveLater !== undefined;
  if (!hasReorderActions) {
    item.append(content, createIssueStatusButton(issue));
  } else {
    const actions = document.createElement('div');
    actions.className = 'issue-row-actions';
    for (const direction of ['up', 'down'] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button button-quiet issue-order-button';
      button.dataset.moveDirection = direction;
      button.disabled = direction === 'up'
        ? reorder?.canMoveEarlier !== true
        : reorder?.canMoveLater !== true;
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
  const password = credentialForm.elements.namedItem('password');
  const confirmation = credentialForm.elements.namedItem('confirmation');
  if (password instanceof HTMLInputElement) password.required = true;
  if (confirmation instanceof HTMLInputElement) confirmation.required = true;
  credentialPasswordFields.hidden = true;
}

function showCredentialFlow(): void {
  loginForm.hidden = true;
  loginAdminHelp.hidden = true;
  credentialFlow.hidden = false;
  credentialFlowError.hidden = true;
  credentialFlowError.textContent = '';
}

async function openCredentialFlow(credential: CredentialFragment): Promise<void> {
  credentialFragment = credential;
  showCredentialFlow();
  if (credential.type === 'reset') {
    credentialFlowHeading.textContent = 'Choose a new password';
    credentialFlowDescription.textContent = 'Your workspace admin provided this one-time reset link. Use at least 15 characters; spaces and Unicode are allowed.';
    credentialPasswordFields.hidden = false;
    credentialSubmit.textContent = 'Reset password';
    const password = credentialForm.elements.namedItem('password');
    const confirmation = credentialForm.elements.namedItem('confirmation');
    if (password instanceof HTMLInputElement) password.required = true;
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
    credentialFlowDescription.textContent = `You’re invited to join “${result.invite.workspace_name}” as a ${result.invite.role}.`;
    credentialPasswordFields.hidden = !result.invite.password_required;
    const password = credentialForm.elements.namedItem('password');
    const confirmation = credentialForm.elements.namedItem('confirmation');
    if (password instanceof HTMLInputElement) password.required = result.invite.password_required;
    if (confirmation instanceof HTMLInputElement) confirmation.required = result.invite.password_required;
    credentialSubmit.textContent = result.invite.password_required ? 'Set password and join' : 'Join workspace';
    credentialSubmit.disabled = false;
    if (result.invite.password_required) credentialForm.querySelector<HTMLInputElement>('input[name="password"]')?.focus();
    else credentialSubmit.focus();
  } catch (error) {
    credentialFlowDescription.textContent = 'This invite link cannot be used.';
    credentialFlowError.textContent = error instanceof Error ? error.message : 'This invite link is invalid or expired.';
    credentialFlowError.hidden = false;
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
  if (!credentialPasswordFields.hidden && password !== confirmation) {
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
        }),
      });
      credentialFragment = null;
      showSignedIn(result.user);
      if (result.user.role !== 'guest') {
        await loadWorkspaces();
        await loadProjects();
      }
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
    if (result.user.role === 'guest') return;
    await loadWorkspaces();
    await loadProjects();
  } catch (error) {
    if (error instanceof ApiFailure && error.status === 429) {
      loginAdminHelp.hidden = false;
    }
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

inviteRoleInput.addEventListener('change', () => {
  inviteProjectSelection.hidden = inviteRoleInput.value !== 'guest';
});

inviteForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  generatedCredentialLink.hidden = true;
  const values = new FormData(inviteForm);
  const role = values.get('role') === 'guest' ? 'guest' : 'developer';
  const projectIds = values.getAll('project_ids').map(Number).filter(Number.isSafeInteger);
  if (role === 'guest' && projectIds.length === 0) {
    report('Choose at least one project for a guest invite.', true);
    inviteProjectOptions.querySelector<HTMLInputElement>('input')?.focus();
    return;
  }
  try {
    const result = await api<{ invite: WorkspaceInvite & { invite_url: string } }>('/users/invites', {
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
    showGeneratedCredentialLink(
      'Invite link',
      `Copy this seven-day link and send it to ${result.invite.email}.`,
      result.invite.invite_url,
    );
    report('Invite link generated. Copy and send it manually.');
    await loadWorkspaceAdmin();
    copyGeneratedCredentialLink.focus();
  } catch (error) {
    report(error instanceof Error ? error.message : 'Could not create the invite link.', true);
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
  const credentialState = consumeCredentialFragment();
  if (credentialState !== null) {
    showSignedOut();
    await openCredentialFlow(credentialState);
    return;
  }
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
