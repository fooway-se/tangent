type Role = 'admin' | 'developer';

interface User {
  id: number;
  workspace_id: number;
  name: string;
  email: string;
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

type IssueStatus = 'backlog' | 'todo' | 'doing' | 'done';

interface Issue {
  id: number;
  workspace_id: number;
  project_id: number;
  title: string;
  description: string;
  status: IssueStatus;
  created_by: number;
  source_channel_id: number | null;
  source_message_id: number | null;
  created_at: string;
  updated_at: string;
}

interface Member extends User {
  joined_at?: string;
}

interface ChatMessage {
  id: number;
  channel_id: number;
  parent_id: number | null;
  author_id: number;
  author_name: string;
  body: string;
  created_at: string;
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

const loginPanel = document.querySelector<HTMLElement>('#login-panel')!;
const loginShell = document.querySelector<HTMLElement>('#login-shell')!;
const workspacePanel = document.querySelector<HTMLElement>('#workspace-panel')!;
const accountBar = document.querySelector<HTMLElement>('#account-bar')!;
const currentUserLabel = document.querySelector<HTMLElement>('#current-user')!;
const workspaceNav = document.querySelector<HTMLElement>('#workspace-nav')!;
const breadcrumbProjectsButton = document.querySelector<HTMLButtonElement>('#breadcrumb-projects')!;
const breadcrumbDivider = document.querySelector<HTMLElement>('#breadcrumb-divider')!;
const breadcrumbCurrent = document.querySelector<HTMLElement>('#breadcrumb-current')!;
const projectsNavButton = document.querySelector<HTMLButtonElement>('#projects-nav')!;
const adminNavButton = document.querySelector<HTMLButtonElement>('#admin-nav')!;
const projectsView = document.querySelector<HTMLElement>('#projects-view')!;
const projectView = document.querySelector<HTMLElement>('#project-view')!;
const adminView = document.querySelector<HTMLElement>('#admin-view')!;
const projectForm = document.querySelector<HTMLFormElement>('#project-form')!;
const toggleProjectFormButton = document.querySelector<HTMLButtonElement>('#toggle-project-form')!;
const cancelProjectFormButton = document.querySelector<HTMLButtonElement>('#cancel-project-form')!;
const developerForm = document.querySelector<HTMLFormElement>('#developer-form')!;
const loginForm = document.querySelector<HTMLFormElement>('#login-form')!;
const projectList = document.querySelector<HTMLUListElement>('#project-list')!;
const emptyProjects = document.querySelector<HTMLElement>('#empty-projects')!;
const projectFormPanel = document.querySelector<HTMLElement>('#project-form-panel')!;
const projectTitle = document.querySelector<HTMLElement>('#project-title')!;
const projectDescription = document.querySelector<HTMLElement>('#project-description')!;
const projectState = document.querySelector<HTMLElement>('#project-state')!;
const chatView = document.querySelector<HTMLElement>('#chat-view')!;
const projectSidebarList = document.querySelector<HTMLUListElement>('#project-sidebar-list')!;
const issuesView = document.querySelector<HTMLElement>('#issues-view')!;
const membersView = document.querySelector<HTMLElement>('#members-view')!;
const membersTabButton = document.querySelector<HTMLButtonElement>('#members-tab')!;
const issuesTabButton = document.querySelector<HTMLButtonElement>('#issues-tab')!;
const issueForm = document.querySelector<HTMLFormElement>('#issue-form')!;
const issueFormPanel = document.querySelector<HTMLElement>('#issue-form-panel')!;
const issueList = document.querySelector<HTMLUListElement>('#issue-list')!;
const emptyIssues = document.querySelector<HTMLElement>('#empty-issues')!;
const toggleIssueFormButton = document.querySelector<HTMLButtonElement>('#toggle-issue-form')!;
const cancelIssueFormButton = document.querySelector<HTMLButtonElement>('#cancel-issue-form')!;
const memberList = document.querySelector<HTMLUListElement>('#member-list')!;
const memberForm = document.querySelector<HTMLFormElement>('#member-form')!;
const memberSelect = document.querySelector<HTMLSelectElement>('#member-select')!;
const addMemberButton = document.querySelector<HTMLButtonElement>('#add-member-button')!;
const statusMessage = document.querySelector<HTMLElement>('#status-message')!;
const loginStatusMessage = document.querySelector<HTMLElement>('#login-status-message')!;
const logoutButton = document.querySelector<HTMLButtonElement>('#logout-button')!;

let activeUser: User | null = null;
let activeProject: Project | null = null;
let activeProjectMembers: Member[] = [];
let activeChatProjectId: number | null = null;
let chatPollTimer: number | null = null;
let chatCursor = 0;
let chatEtag: string | null = null;
let chatPollDelay = 1000;
let chatMessageList: HTMLElement | null = null;
let chatEmptyState: HTMLElement | null = null;
let chatInput: HTMLTextAreaElement | null = null;
let chatReplyHint: HTMLElement | null = null;
let chatCancelReply: HTMLButtonElement | null = null;
let chatReplyParent: { id: number; name: string } | null = null;

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

function report(message: string, isError = false): void {
  const target = workspacePanel.hidden ? loginStatusMessage : statusMessage;
  target.textContent = message;
  target.classList.toggle('error', isError);
}

function showSignedOut(): void {
  stopChatPolling();
  activeUser = null;
  activeProject = null;
  activeProjectMembers = [];
  loginShell.hidden = false;
  loginPanel.hidden = false;
  workspacePanel.hidden = true;
  accountBar.hidden = true;
  document.body.classList.remove('is-project-view');
  projectList.replaceChildren();
  projectSidebarList.replaceChildren();
  issueList.replaceChildren();
  chatView.replaceChildren();
  report('');
}

function showSignedIn(user: User): void {
  activeUser = user;
  loginShell.hidden = true;
  loginPanel.hidden = true;
  workspacePanel.hidden = false;
  accountBar.hidden = false;
  currentUserLabel.textContent = `${user.name} · ${user.role}`;
  adminNavButton.hidden = user.role !== 'admin';
  toggleProjectFormButton.hidden = user.role !== 'admin';
  showWorkspaceView('projects');
  report('');
}

function showWorkspaceView(view: 'projects' | 'admin' | 'project'): void {
  if (view !== 'project') {
    stopChatPolling();
    activeProject = null;
    activeProjectMembers = [];
  }
  projectsView.hidden = view !== 'projects';
  adminView.hidden = view !== 'admin';
  projectView.hidden = view !== 'project';
  workspaceNav.hidden = false;
  breadcrumbProjectsButton.hidden = view === 'projects';
  breadcrumbDivider.hidden = view === 'projects';
  breadcrumbCurrent.textContent = view === 'project'
    ? activeProject?.name ?? 'Project'
    : view === 'admin' ? 'Administration' : 'Projects';
  document.body.classList.toggle('is-project-view', view === 'project');
  projectsNavButton.classList.toggle('is-active', view === 'projects');
  adminNavButton.classList.toggle('is-active', view === 'admin');
  projectSidebarList.querySelectorAll<HTMLButtonElement>('.project-sidebar-link').forEach((button) => {
    button.classList.toggle('is-active', view === 'project' && button.dataset.projectId === String(activeProject?.id));
  });
  if (view === 'projects') {
    projectsNavButton.setAttribute('aria-current', 'page');
    adminNavButton.removeAttribute('aria-current');
  } else if (view === 'admin') {
    adminNavButton.setAttribute('aria-current', 'page');
    projectsNavButton.removeAttribute('aria-current');
  } else {
    projectsNavButton.removeAttribute('aria-current');
    adminNavButton.removeAttribute('aria-current');
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
}

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

  const item = document.createElement('article');
  item.className = message.parent_id === null ? 'chat-message' : 'chat-message chat-reply';
  item.dataset.messageId = String(message.id);

  const heading = document.createElement('div');
  heading.className = 'chat-message-heading';
  const author = document.createElement('strong');
  author.textContent = message.author_name;
  const reply = document.createElement('button');
  reply.className = 'button button-quiet chat-reply-button';
  reply.type = 'button';
  reply.textContent = 'Reply';
  reply.addEventListener('click', () => setChatReplyParent(message));
  const createIssue = document.createElement('button');
  createIssue.className = 'button button-quiet chat-create-issue-button';
  createIssue.type = 'button';
  createIssue.textContent = 'Create issue';
  createIssue.addEventListener('click', async () => {
    const projectId = activeProject?.id;
    if (projectId === undefined || activeChatProjectId !== projectId) return;
    createIssue.disabled = true;
    createIssue.textContent = 'Creating…';
    try {
      const result = await api<{ issue: Issue }>(`/messages/${message.id}/issue`, { method: 'POST' });
      if (activeProject?.id !== projectId) return;
      createIssue.textContent = 'Created';
      report(`Created issue: ${result.issue.title}`);
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
  heading.append(author, actions);

  const body = document.createElement('p');
  body.className = 'chat-message-body';
  body.textContent = message.body;
  item.append(heading, body);
  chatMessageList.append(item);
  chatEmptyState!.hidden = true;
  chatCursor = Math.max(chatCursor, message.id);
}

function setChatReplyParent(message: ChatMessage): void {
  chatReplyParent = { id: message.id, name: message.author_name };
  if (chatReplyHint !== null) {
    chatReplyHint.textContent = `Replying to ${message.author_name}`;
    chatReplyHint.hidden = false;
  }
  if (chatCancelReply !== null) chatCancelReply.hidden = false;
  chatInput?.focus();
}

function clearChatReplyParent(): void {
  chatReplyParent = null;
  if (chatReplyHint !== null) chatReplyHint.hidden = true;
  if (chatCancelReply !== null) chatCancelReply.hidden = true;
}

function createProjectChat(projectId: number): HTMLElement {
  const section = document.createElement('section');
  section.className = 'project-chat';

  const heading = document.createElement('h3');
  heading.className = 'chat-heading';
  heading.textContent = 'Project chat';

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
  chatInput.placeholder = 'Write a message…';
  chatInput.setAttribute('aria-label', 'Message');
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

projectsNavButton.addEventListener('click', () => showWorkspaceView('projects'));
adminNavButton.addEventListener('click', () => showWorkspaceView('admin'));
breadcrumbProjectsButton.addEventListener('click', () => showWorkspaceView('projects'));
issuesTabButton.addEventListener('click', () => switchProjectTab('issues'));
membersTabButton.addEventListener('click', () => switchProjectTab('members'));

toggleProjectFormButton.addEventListener('click', () => {
  projectFormPanel.hidden = !projectFormPanel.hidden;
  if (!projectFormPanel.hidden) projectForm.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
});
cancelProjectFormButton.addEventListener('click', () => {
  projectForm.reset();
  projectFormPanel.hidden = true;
});

toggleIssueFormButton.addEventListener('click', () => {
  issueFormPanel.hidden = !issueFormPanel.hidden;
  if (!issueFormPanel.hidden) issueForm.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
});
cancelIssueFormButton.addEventListener('click', () => {
  issueForm.reset();
  issueFormPanel.hidden = true;
});

issueForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (activeProject === null) return;
  const projectId = activeProject.id;
  const values = new FormData(issueForm);
  try {
    await api(`/projects/${projectId}/issues`, {
      method: 'POST',
      body: JSON.stringify({ title: values.get('title'), description: values.get('description') }),
    });
    issueForm.reset();
    issueFormPanel.hidden = true;
    report('Issue created.');
    await loadProjectIssues(projectId);
  } catch (error) {
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

async function loadProjectDetail(projectId: number, tab: 'issues' | 'members' = 'issues'): Promise<void> {
  stopChatPolling();
  try {
    const result = await api<{ project: Project; members: Member[] }>(`/projects/${projectId}`);
    activeProject = result.project;
    activeProjectMembers = result.members;
    projectSidebarList.querySelectorAll<HTMLButtonElement>('.project-sidebar-link').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.projectId === String(result.project.id));
    });
    projectTitle.textContent = result.project.name;
    projectDescription.textContent = result.project.description || 'No description yet.';
    projectState.textContent = result.project.status;
    showWorkspaceView('project');
    chatView.replaceChildren(createProjectChat(projectId));
    switchProjectTab(tab);
  } catch (error) {
    report(error instanceof Error ? error.message : 'Could not load the project.', true);
    showWorkspaceView('projects');
  }
}

function switchProjectTab(tab: 'issues' | 'members'): void {
  if (activeProject === null) return;
  issuesView.hidden = tab !== 'issues';
  membersView.hidden = tab !== 'members';
  issuesTabButton.classList.toggle('is-active', tab === 'issues');
  membersTabButton.classList.toggle('is-active', tab === 'members');
  if (tab === 'issues') {
    issuesTabButton.setAttribute('aria-current', 'page');
    membersTabButton.removeAttribute('aria-current');
    void loadProjectIssues(activeProject.id);
    return;
  }

  membersTabButton.setAttribute('aria-current', 'page');
  issuesTabButton.removeAttribute('aria-current');
  void loadProjectMembers(activeProject.id);
}

async function loadProjectIssues(projectId: number): Promise<void> {
  try {
    const result = await api<{ issues: Issue[] }>(`/projects/${projectId}/issues`);
    if (activeProject?.id !== projectId || issuesView.hidden) return;
    issueList.replaceChildren();
    emptyIssues.hidden = result.issues.length > 0;
    for (const issue of result.issues) issueList.append(createIssueRow(issue));
  } catch (error) {
    if (error instanceof ApiFailure && error.status === 401) {
      showSignedOut();
      return;
    }
    report(error instanceof Error ? error.message : 'Could not load project issues.', true);
  }
}

function createIssueRow(issue: Issue): HTMLElement {
  const item = document.createElement('li');
  item.className = 'issue-card';
  item.dataset.issueId = String(issue.id);

  const content = document.createElement('div');
  content.className = 'issue-content';
  const title = document.createElement('strong');
  title.className = 'issue-title';
  title.textContent = issue.title;
  content.append(title);
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

  const status = document.createElement('select');
  status.className = 'issue-status';
  status.setAttribute('aria-label', `Status for ${issue.title}`);
  const statuses: Array<{ value: IssueStatus; label: string }> = [
    { value: 'backlog', label: 'Backlog' },
    { value: 'todo', label: 'Todo' },
    { value: 'doing', label: 'Doing' },
    { value: 'done', label: 'Done' },
  ];
  for (const entry of statuses) {
    const option = document.createElement('option');
    option.value = entry.value;
    option.textContent = entry.label;
    option.selected = entry.value === issue.status;
    status.append(option);
  }
  status.addEventListener('change', async () => {
    const newStatus = status.value as IssueStatus;
    try {
      await api(`/issues/${issue.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      report('Issue status updated.');
      await loadProjectIssues(issue.project_id);
    } catch (error) {
      status.value = issue.status;
      report(error instanceof Error ? error.message : 'Could not update issue status.', true);
    }
  });

  item.append(content, status);
  return item;
}

async function loadProjectMembers(projectId: number): Promise<void> {
  memberList.replaceChildren();
  for (const member of activeProjectMembers) {
    const item = document.createElement('li');
    item.textContent = `${member.name} · ${member.role}`;
    memberList.append(item);
  }

  memberForm.hidden = activeUser?.role !== 'admin';
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
  } catch (error) {
    report(error instanceof Error ? error.message : 'Could not load workspace users.', true);
  }
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
    await loadProjects();
  } catch (error) {
    report(error instanceof Error ? error.message : 'Could not sign in.', true);
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
    projectForm.reset();
    projectFormPanel.hidden = true;
    report('Project created.');
    await loadProjects();
  } catch (error) {
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
  } catch (error) {
    report(error instanceof Error ? error.message : 'Could not add developer.', true);
  }
});

logoutButton.addEventListener('click', async () => {
  try {
    await api('/auth/logout', { method: 'POST' });
  } finally {
    showSignedOut();
  }
});

async function start(): Promise<void> {
  try {
    const result = await api<{ user: User }>('/auth/me');
    showSignedIn(result.user);
    await loadProjects();
  } catch (error) {
    showSignedOut();
    if (error instanceof ApiFailure && error.status !== 401) {
      report(error.message, true);
    }
  }
}

void start();
