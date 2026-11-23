import { ApiFailure, api } from './api.js';
import { renderClientEmptyState, renderClientView, type ClientView } from './guest-view.js';
import type { GuestProject, Member, Project, User } from './types.js';

export interface GuestUiController {
  showGuestShell(user: User): Promise<void>;
  openPreview(): Promise<void>;
  closePreview(): void;
  reset(): void;
  isPreviewActive(): boolean;
  isShellVisible(): boolean;
  setStatus(message: string, isError?: boolean): void;
  dispose(): void;
}

export function initGuestUi(options: {
  getUser: () => User | null;
  getProject: () => Project | null;
  getProjectMembers: () => Member[];
  getProjectHeading: () => HTMLElement;
  onGuestMode: () => void;
  onPreviewOpened: () => void;
  onPreviewClosed: () => void;
  onUnauthorized: () => void;
  report: (message: string, isError?: boolean) => void;
  request?: typeof api;
  renderView?: typeof renderClientView;
  renderEmptyState?: typeof renderClientEmptyState;
  doc?: Document;
}): GuestUiController {
  const doc = options.doc ?? document;
  const request = options.request ?? api;
  const renderView = options.renderView ?? renderClientView;
  const renderEmptyState = options.renderEmptyState ?? renderClientEmptyState;
  const guestShell = doc.querySelector<HTMLElement>('#guest-shell')!;
  const guestStatus = doc.querySelector<HTMLElement>('#guest-status')!;
  const guestMain = doc.querySelector<HTMLElement>('#guest-main')!;
  const guestTitle = doc.querySelector<HTMLElement>('#guest-title')!;
  const guestUser = doc.querySelector<HTMLElement>('#guest-user')!;
  const guestCap = doc.querySelector<HTMLElement>('#guest-cap')!;
  const guestProjectLabel = doc.querySelector<HTMLElement>('#guest-project-label')!;
  const guestProjectSelect = doc.querySelector<HTMLSelectElement>('#guest-project-select')!;
  const guestPreviewMemberLabel = doc.querySelector<HTMLElement>('#guest-preview-member-label')!;
  const guestPreviewMemberSelect = doc.querySelector<HTMLSelectElement>('#guest-preview-member-select')!;
  const guestPreviewReturnButton = doc.querySelector<HTMLButtonElement>('#guest-preview-return-button')!;
  const listeners = new AbortController();
  let previewActive = false;
  let previewReturnFocus: HTMLElement | null = null;
  let previewProjectId: number | null = null;
  let previewMembers: Member[] = [];
  let viewRequestVersion = 0;
  let guestModeVersion = 0;

  function resetPreviewState(): void {
    previewActive = false;
    previewReturnFocus = null;
    previewProjectId = null;
    previewMembers = [];
  }

  function reset(): void {
    guestModeVersion += 1;
    viewRequestVersion += 1;
    resetPreviewState();
    guestShell.hidden = true;
    guestPreviewMemberLabel.hidden = true;
    guestPreviewMemberSelect.replaceChildren();
    guestPreviewReturnButton.hidden = true;
    guestProjectLabel.hidden = true;
    guestProjectSelect.replaceChildren();
    guestCap.textContent = 'Read-only · guest';
    guestUser.textContent = '';
    guestStatus.textContent = '';
    guestStatus.classList.remove('error');
  }

  async function showGuestShell(user: User): Promise<void> {
    guestModeVersion += 1;
    resetPreviewState();
    guestPreviewMemberLabel.hidden = true;
    guestPreviewReturnButton.hidden = true;
    guestCap.textContent = 'Read-only · guest';
    guestStatus.textContent = 'Loading projects…';
    guestStatus.classList.remove('error');
    guestUser.textContent = user.email;
    guestShell.hidden = false;
    options.onGuestMode();
    await loadGuestProjects(guestModeVersion);
  }

  async function openPreview(): Promise<void> {
    const user = options.getUser();
    const project = options.getProject();
    if (user?.role !== 'admin' || project === null) return;

    guestModeVersion += 1;
    const activeElement = doc.activeElement;
    previewReturnFocus = activeElement instanceof HTMLElement && activeElement !== doc.body
      ? activeElement
      : options.getProjectHeading();
    previewActive = true;
    previewProjectId = project.id;
    previewMembers = options.getProjectMembers().filter((member) =>
      member.role === 'guest' && member.is_active !== false && member.is_active !== 0);
    guestPreviewMemberSelect.replaceChildren(...previewMembers.map((member) =>
      new Option(`${member.name} · ${member.email}`, String(member.id))));
    guestPreviewMemberLabel.hidden = previewMembers.length < 2;
    guestPreviewMemberSelect.value = previewMembers[0] === undefined ? '' : String(previewMembers[0].id);
    guestProjectSelect.replaceChildren();
    guestProjectLabel.hidden = true;
    guestTitle.textContent = 'Client portal';
    guestCap.textContent = 'Admin preview · read-only';
    guestUser.textContent = previewMembers[0]?.email ?? 'No guest access';
    guestStatus.classList.remove('error');
    guestStatus.textContent = previewMembers.length === 0
      ? 'No guest currently has access to this project.'
      : '';
    guestPreviewReturnButton.hidden = false;
    guestShell.hidden = false;
    options.onPreviewOpened();
    guestPreviewReturnButton.focus();

    await loadClientView(project.id, true, previewMembers[0]?.id ?? 0);
  }

  function closePreview(): void {
    if (!previewActive) return;

    const returnFocus = previewReturnFocus ?? options.getProjectHeading();
    resetPreviewState();
    guestModeVersion += 1;
    viewRequestVersion += 1;
    guestPreviewMemberSelect.replaceChildren();
    guestPreviewMemberLabel.hidden = true;
    guestProjectSelect.replaceChildren();
    guestProjectLabel.hidden = true;
    guestCap.textContent = 'Read-only · guest';
    guestUser.textContent = '';
    guestStatus.textContent = '';
    guestStatus.classList.remove('error');
    guestPreviewReturnButton.hidden = true;
    guestShell.hidden = true;
    options.onPreviewClosed();
    returnFocus.focus();
  }

  async function loadGuestProjects(requestVersion: number): Promise<void> {
    try {
      const result = await request<{ projects: GuestProject[] }>('/projects');
      if (requestVersion !== guestModeVersion || previewActive) return;
      guestStatus.textContent = '';
      guestProjectSelect.replaceChildren(...result.projects.map((project) => {
        const option = doc.createElement('option');
        option.value = String(project.id);
        option.textContent = project.name;
        return option;
      }));
      guestProjectLabel.hidden = result.projects.length < 2;
      if (result.projects.length === 0) {
        renderEmptyState(guestMain, 'No projects have been shared with you yet.');
        return;
      }
      await loadClientView(result.projects[0]!.id);
    } catch (error) {
      if (requestVersion !== guestModeVersion) return;
      if (error instanceof ApiFailure && error.status === 401) {
        options.onUnauthorized();
        return;
      }
      guestStatus.textContent = 'Could not load projects.';
      options.report(error instanceof Error ? error.message : 'Could not load your projects.', true);
    }
  }

  async function loadClientView(
    projectId: number,
    previewMode = false,
    viewerUserId = options.getUser()?.id ?? 0,
  ): Promise<void> {
    const requestVersion = ++viewRequestVersion;
    if (!previewMode) guestStatus.textContent = 'Loading project…';
    try {
      const view = await request<ClientView>(`/projects/${projectId}/client-view`);
      if (requestVersion !== viewRequestVersion || (previewMode && !previewActive)) return;
      if (!previewMode) guestStatus.textContent = '';
      guestTitle.textContent = 'Client portal';
      renderView(guestMain, view, {
        userId: viewerUserId,
        approve: async (approvalId) => {
          if (previewMode) return;
          await request(`/approvals/${approvalId}/approve`, { method: 'POST' });
          await loadClientView(projectId);
        },
        comment: async (body) => {
          if (previewMode) return;
          await request(`/projects/${projectId}/client-comments`, { method: 'POST', body: JSON.stringify({ body }) });
          await loadClientView(projectId);
        },
      }, { previewMode });
    } catch (error) {
      if (requestVersion !== viewRequestVersion || (previewMode && !previewActive)) return;
      if (error instanceof ApiFailure && error.status === 401) {
        options.onUnauthorized();
        return;
      }
      if (!previewMode) guestStatus.textContent = 'Could not load the project view.';
      options.report(error instanceof Error ? error.message : 'Could not load the client view.', true);
    }
  }

  guestProjectSelect.addEventListener('change', () => {
    if (!previewActive) void loadClientView(Number(guestProjectSelect.value));
  }, { signal: listeners.signal });
  guestPreviewMemberSelect.addEventListener('change', () => {
    if (!previewActive || previewProjectId === null) return;
    const viewer = previewMembers.find((member) => member.id === Number(guestPreviewMemberSelect.value));
    if (viewer === undefined) return;
    guestUser.textContent = viewer.email;
    void loadClientView(previewProjectId, true, viewer.id);
  }, { signal: listeners.signal });
  guestPreviewReturnButton.addEventListener('click', closePreview, { signal: listeners.signal });

  return {
    showGuestShell,
    openPreview,
    closePreview,
    reset,
    isPreviewActive: () => previewActive,
    isShellVisible: () => !guestShell.hidden,
    setStatus: (message, isError = false) => {
      guestStatus.textContent = message;
      guestStatus.classList.toggle('error', isError);
    },
    dispose: () => listeners.abort(),
  };
}
