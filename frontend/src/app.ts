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

interface Member extends User {
  joined_at?: string;
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
const workspacePanel = document.querySelector<HTMLElement>('#workspace-panel')!;
const accountBar = document.querySelector<HTMLElement>('#account-bar')!;
const currentUserLabel = document.querySelector<HTMLElement>('#current-user')!;
const adminTools = document.querySelector<HTMLElement>('#admin-tools')!;
const projectForm = document.querySelector<HTMLFormElement>('#project-form')!;
const developerForm = document.querySelector<HTMLFormElement>('#developer-form')!;
const loginForm = document.querySelector<HTMLFormElement>('#login-form')!;
const projectList = document.querySelector<HTMLUListElement>('#project-list')!;
const emptyProjects = document.querySelector<HTMLElement>('#empty-projects')!;
const detailPanel = document.querySelector<HTMLElement>('#project-detail')!;
const statusMessage = document.querySelector<HTMLElement>('#status-message')!;
const logoutButton = document.querySelector<HTMLButtonElement>('#logout-button')!;

let activeUser: User | null = null;

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
  statusMessage.textContent = message;
  statusMessage.classList.toggle('error', isError);
}

function showSignedOut(): void {
  activeUser = null;
  loginPanel.hidden = false;
  workspacePanel.hidden = true;
  accountBar.hidden = true;
  detailPanel.hidden = true;
  projectList.replaceChildren();
  adminTools.hidden = true;
}

function showSignedIn(user: User): void {
  activeUser = user;
  loginPanel.hidden = true;
  workspacePanel.hidden = false;
  accountBar.hidden = false;
  currentUserLabel.textContent = `${user.name} · ${user.role}`;
  adminTools.hidden = user.role !== 'admin';
  report('');
}

async function loadProjects(): Promise<void> {
  const result = await api<{ projects: Project[] }>('/projects');
  projectList.replaceChildren();
  emptyProjects.hidden = result.projects.length > 0;

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
  }
}

async function loadProjectDetail(projectId: number): Promise<void> {
  try {
    const result = await api<{ project: Project; members: Member[] }>(`/projects/${projectId}`);
    detailPanel.replaceChildren();
    detailPanel.hidden = false;

    const heading = document.createElement('h2');
    heading.textContent = result.project.name;
    const description = document.createElement('p');
    description.className = 'detail-description';
    description.textContent = result.project.description || 'No description yet.';
    const memberHeading = document.createElement('h3');
    memberHeading.textContent = 'Members';
    const members = document.createElement('ul');
    members.className = 'member-list';
    for (const member of result.members) {
      const item = document.createElement('li');
      item.textContent = `${member.name} · ${member.role}`;
      members.append(item);
    }
    detailPanel.append(heading, description, memberHeading, members);

    if (activeUser?.role === 'admin') {
      const userResult = await api<{ users: User[] }>('/users');
      const form = document.createElement('form');
      form.className = 'member-form';
      const label = document.createElement('label');
      label.textContent = 'Add a developer';
      const select = document.createElement('select');
      select.name = 'user_id';
      for (const candidate of userResult.users.filter((user) => !result.members.some((member) => member.id === user.id))) {
        const option = document.createElement('option');
        option.value = String(candidate.id);
        option.textContent = `${candidate.name} · ${candidate.email}`;
        select.append(option);
      }
      label.append(select);
      const addButton = document.createElement('button');
      addButton.className = 'button button-secondary';
      addButton.type = 'submit';
      addButton.textContent = 'Add to project';
      addButton.disabled = select.options.length === 0;
      form.append(label, addButton);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!select.value) return;
        try {
          await api(`/projects/${projectId}/members/${select.value}`, { method: 'PUT' });
          report('Member added to the project.');
          await loadProjectDetail(projectId);
        } catch (error) {
          report(error instanceof Error ? error.message : 'Could not add member.', true);
        }
      });
      detailPanel.append(form);
    }
  } catch (error) {
    report(error instanceof Error ? error.message : 'Could not load the project.', true);
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
