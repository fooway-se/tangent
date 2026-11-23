import type { ChatFeedEvent } from './chat-event-feed.js';
import type { MentionMember } from './chat-mentions.js';
import type { BoardIssue, IssueStatus } from './issue-board.js';

export type Role = 'admin' | 'developer' | 'guest';
export type IssueType = 'task' | 'bug' | 'feature' | 'research' | 'maintenance';
export type IssuePriority = 'low' | 'medium' | 'high' | 'urgent';
export type IssueGrouping = 'status' | 'milestone';
export type AgentCapability = 'issues.read' | 'issues.comment' | 'issues.status.update';

export interface AgentIdentity {
  id: number;
  name: string;
  is_active: boolean;
  project_ids: number[];
  capabilities: AgentCapability[];
  token_expires_at: string | null;
  token_last_used_at: string | null;
}

export type WorkspaceLocation =
  | { view: 'projects'; focusedProjectId?: number }
  | { view: 'roadmap' }
  | { view: 'inbox' }
  | { view: 'lounge' }
  | { view: 'admin' }
  | { view: 'project'; projectId: number; tab: 'issues' | 'members' | 'notes' };

export interface User {
  id: number;
  workspace_id: number;
  name: string;
  email: string;
  role: Role;
}

export interface Workspace {
  id: number;
  name: string;
  slug: string;
  role: Role;
}

export interface Project {
  id: number;
  workspace_id: number;
  name: string;
  slug: string;
  description: string;
  status: 'active' | 'paused' | 'completed' | 'archived';
  archived_from_status: 'active' | 'paused' | 'completed' | null;
  github_repository: GitHubRepository | null;
}

export interface GitHubRepository {
  id: number;
  installation_id: number;
  owner: string;
  name: string;
  full_name: string;
  html_url: string;
}

export type GitHubRepositoryOptionSelection = { installation_id: number; owner: string; name: string } & (
  { id: number } | { repository_id: number }
);

export interface LinkedPullRequest {
  id: number;
  github_repository_id: number;
  repository_full_name: string;
  pull_number: number;
  title: string;
  html_url: string;
  state: 'open' | 'closed' | 'merged';
  is_draft: boolean;
  author_login: string;
  github_updated_at: string;
  linked_at: string;
  check_runs: LinkedPullRequestCheckRun[];
}

export interface LinkedPullRequestCheckRun {
  id: number;
  name: string;
  html_url: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  github_updated_at: string;
}

export interface LinkedCommit {
  id: number;
  repository_full_name: string;
  sha: string;
  message: string;
  html_url: string;
  author_login: string;
  committed_at: string;
}

export const PROJECT_STATUS_LABELS: Record<Project['status'], string> = {
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  archived: 'Archived',
};

export const PROJECT_STATUS_HINTS: Record<Project['status'], string> = {
  active: 'Normal work.',
  paused: 'Temporarily on hold; it can be resumed. The project and its history remain available.',
  completed: 'Finished and read-only. An admin can reopen it. Small follow-up work can stay in this project; a distinct engagement can start a new one.',
  archived: 'A housekeeping state that moves the project out of the active list while keeping its history. Existing members and guests can still view it read-only.',
};

export const PROJECT_STATUS_ORDER: Record<Project['status'], number> = {
  active: 0,
  paused: 1,
  completed: 2,
  archived: 3,
};

export interface WorkspaceMember extends User {
  is_active: boolean;
  created_at: string;
}

export interface WorkspaceInvite {
  id: number;
  email: string;
  name: string;
  role: 'developer' | 'guest';
  project_ids: number[];
  expires_at: string;
  created_at: string;
}

export type InviteDelivery = Pick<WorkspaceInvite, 'id' | 'email' | 'name' | 'role' | 'project_ids' | 'expires_at'>;

export interface InvitePreview {
  name: string;
  email: string;
  workspace_name: string;
  role: 'developer' | 'guest';
  project_ids: number[];
  password_required: boolean;
  password_setup_required: boolean;
  email_verification_required: boolean;
}

export type CredentialFragment = { type: 'invite' | 'reset'; token: string };
export type MyWorkTab = 'inbox' | 'tasks';

export interface GuestProject {
  id: number;
  name: string;
  slug: string;
}

export interface Issue extends BoardIssue {
  type: IssueType;
  priority: IssuePriority;
  due_date: string | null;
  context: string;
  expected_outcome: string;
  acceptance_criteria: string;
  assignee_id: number | null;
  workspace_id: number;
  project_id: number;
  created_by: number;
  source_channel_id: number | null;
  source_message_id: number | null;
  is_shared: boolean;
  is_ongoing: boolean;
  milestone_id: number | null;
  milestone_name?: string | null;
  milestone_due_date?: string | null;
  sort_order: number;
  approval_requested_at: string | null;
  approved_by: number | null;
  approved_at: string | null;
  deleted_at: string | null;
}

export interface ConditionalIssueList {
  issues: Issue[] | null;
  etag: string | null;
}

export interface ConditionalInboxCollection<T> {
  items: T[] | null;
  etag: string | null;
  hasMore?: boolean;
  nextCursor?: number | null;
  counts?: { unread: number; mentions: number };
}

export interface IssueStatusTransition {
  id: number;
  from_status: IssueStatus | null;
  to_status: IssueStatus;
  actor_name: string;
  created_at: string;
}

export interface IssueDiscussionMessage {
  id: number;
  issue_id: number;
  parent_id: number | null;
  author_id: number;
  author_agent_id?: number | null;
  author_name: string;
  parent_author_name: string | null;
  parent_body: string | null;
  body: string;
  created_at: string;
}

export interface IssueBoardGroup {
  key: string;
  name: string;
  className: string;
  issues: Issue[];
  reorderByIssueId?: Map<number, { canMoveEarlier?: boolean; canMoveLater?: boolean; showMilestoneTag?: boolean }>;
  isOngoing?: boolean;
  allowBulkMove?: boolean;
  openByDefault?: boolean;
}

export interface Milestone {
  id: number;
  name: string;
  due_date: string | null;
  archived_at: string | null;
}

export interface InboxIssue extends Issue {
  project_name: string;
  project_slug: string;
}

export const ISSUE_STATUS_OPTIONS: Array<{ value: IssueStatus; label: string }> = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'todo', label: 'Todo' },
  { value: 'doing', label: 'Doing' },
  { value: 'testing', label: 'Testing' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const ISSUE_TYPE_OPTIONS: Array<{ value: IssueType; label: string }> = [
  { value: 'task', label: 'Task' },
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature' },
  { value: 'research', label: 'Research' },
  { value: 'maintenance', label: 'Maintenance' },
];

export interface Member extends User {
  joined_at?: string;
  is_active?: boolean | number;
}

export type LoungeMentionMember = MentionMember;
export type LoungePresenceMember = Pick<LoungeMentionMember, 'id' | 'name'>;

export interface ChatMessage {
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

export interface ChatEvent extends ChatMessage, ChatFeedEvent {
  type: 'message';
}

export interface LoginResponse {
  user: User;
  csrf_token: string;
  expires_at: string;
}
