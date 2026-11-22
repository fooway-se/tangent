import {
  PROJECT_STATUS_HINTS,
  PROJECT_STATUS_LABELS,
  type GitHubRepository,
  type GitHubRepositoryOptionSelection,
  type Project,
} from './types.js';
import { parseGitHubRepositorySelection } from './github-repository-selection.js';

export interface ProjectEditUiController {
  open(): void;
  dispose(): void;
}

export function initProjectEditUi(options: {
  getRole: () => string | undefined;
  getProject: () => Project | null;
  isProjectViewVisible: () => boolean;
  populateRepositorySelect: (
    select: HTMLSelectElement,
    selected: GitHubRepositoryOptionSelection | null,
    unavailableRepository?: GitHubRepository | null,
  ) => void;
  api: <T>(path: string, init?: RequestInit) => Promise<T>;
  onUpdated: (project: Project) => void;
  refreshProjects: () => Promise<void>;
  report: (message: string, isError?: boolean) => void;
  doc?: Document;
}): ProjectEditUiController {
  const doc = options.doc ?? document;
  const dialog = required<HTMLDialogElement>('#project-edit-dialog');
  const form = required<HTMLFormElement>('#project-edit-form');
  const closeButton = required<HTMLButtonElement>('#project-edit-close');
  const cancelButton = required<HTMLButtonElement>('#project-edit-cancel');
  const nameInput = required<HTMLInputElement>('#project-edit-name');
  const descriptionInput = required<HTMLTextAreaElement>('#project-edit-description-input');
  const statusSelect = required<HTMLSelectElement>('#project-edit-status');
  const statusHelp = required<HTMLElement>('#project-edit-status-help');
  const message = required<HTMLElement>('#project-edit-message');
  const saveButton = required<HTMLButtonElement>('#project-edit-save');
  const editButton = required<HTMLButtonElement>('#edit-project-button');
  const repositorySelect = required<HTMLSelectElement>('#project-edit-github-repository');
  const listeners = new AbortController();

  function required<T extends Element>(selector: string): T {
    const element = doc.querySelector<T>(selector);
    if (element === null) throw new Error(`Missing project edit element: ${selector}`);
    return element;
  }

  function updateStatusHint(): void {
    const project = options.getProject();
    const status = statusSelect.value as Project['status'];
    let hint = PROJECT_STATUS_HINTS[status];
    const completedLocked = project?.status === 'completed' && !['active', 'paused'].includes(status);
    const archivedLocked = project?.status === 'archived' && status === 'archived';
    nameInput.disabled = completedLocked || archivedLocked;
    descriptionInput.disabled = completedLocked || archivedLocked;
    repositorySelect.disabled = completedLocked || archivedLocked;
    const archivedFromStatus = project?.status === 'archived' ? project.archived_from_status : null;
    if (project?.status === 'archived' && archivedFromStatus !== null && status === 'archived') {
      const previousState = PROJECT_STATUS_LABELS[archivedFromStatus];
      hint += ` This project was ${previousState.toLowerCase()} before archiving; select ${previousState} to restore it.`;
    } else if (project?.status === 'archived' && status !== 'archived') {
      hint += status === archivedFromStatus
        ? ' Saving will restore the previous work state.'
        : ` Saving will unarchive the project as ${PROJECT_STATUS_LABELS[status].toLowerCase()}.`;
    }
    statusHelp.textContent = hint;
  }

  function open(): void {
    const project = options.getProject();
    if (options.getRole() !== 'admin' || project === null) return;
    nameInput.value = project.name;
    descriptionInput.value = project.description;
    statusSelect.value = project.status;
    options.populateRepositorySelect(repositorySelect, project.github_repository, project.github_repository);
    updateStatusHint();
    message.textContent = '';
    message.classList.remove('is-error');
    dialog.showModal();
    nameInput.focus();
  }

  async function save(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const project = options.getProject();
    if (options.getRole() !== 'admin' || project === null) return;
    const projectId = project.id;
    saveButton.disabled = true;
    message.textContent = '';
    message.classList.remove('is-error');
    try {
      const githubRepositorySelection = parseGitHubRepositorySelection(repositorySelect.value);
      const result = await options.api<{ project: Project }>(`/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: nameInput.value,
          description: descriptionInput.value,
          status: statusSelect.value,
          github_installation_id: githubRepositorySelection?.installation_id ?? null,
          github_repository_id: githubRepositorySelection?.repository_id ?? null,
          github_repository_owner: githubRepositorySelection?.owner ?? null,
          github_repository_name: githubRepositorySelection?.name ?? null,
        }),
      });
      if (options.getProject()?.id !== projectId) return;
      options.onUpdated(result.project);
      options.report('Project updated.');
      dialog.close();
      try {
        await options.refreshProjects();
      } catch (error) {
        options.report(error instanceof Error ? error.message : 'Project updated, but the project list could not be refreshed.', true);
      }
    } catch (error) {
      message.textContent = error instanceof Error ? error.message : 'Could not update the project.';
      message.classList.add('is-error');
      nameInput.focus();
    } finally {
      saveButton.disabled = false;
    }
  }

  closeButton.addEventListener('click', () => dialog.close(), { signal: listeners.signal });
  cancelButton.addEventListener('click', () => dialog.close(), { signal: listeners.signal });
  editButton.addEventListener('click', open, { signal: listeners.signal });
  statusSelect.addEventListener('change', updateStatusHint, { signal: listeners.signal });
  form.addEventListener('submit', (event) => void save(event), { signal: listeners.signal });
  dialog.addEventListener('close', () => {
    form.reset();
    message.textContent = '';
    message.classList.remove('is-error');
    saveButton.disabled = false;
    if (options.getRole() === 'admin' && options.isProjectViewVisible()) editButton.focus();
  }, { signal: listeners.signal });

  return { open, dispose: () => listeners.abort() };
}
