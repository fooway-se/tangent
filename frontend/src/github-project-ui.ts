import {
  type GitHubRepository,
  type GitHubRepositoryOptionSelection,
  type Project,
} from './types.js';
import { githubRepositorySelectionValue, parseGitHubRepositorySelection } from './github-repository-selection.js';

export interface GithubProjectUiController {
  load(): Promise<void>;
  connect(): Promise<void>;
  populateRepositorySelect(
    select: HTMLSelectElement,
    selected: GitHubRepositoryOptionSelection | null,
    unavailableRepository?: GitHubRepository | null,
  ): void;
  reset(): void;
  dispose(): void;
}

export function initGithubProjectUi(options: {
  getRole: () => string | undefined;
  getProject: () => Project | null;
  api: <T>(path: string, init?: RequestInit) => Promise<T>;
  report: (message: string, isError?: boolean) => void;
  doc?: Document;
}): GithubProjectUiController {
  const doc = options.doc ?? document;
  const createRepositorySelect = required<HTMLSelectElement>('#project-github-repository');
  const editRepositorySelect = required<HTMLSelectElement>('#project-edit-github-repository');
  const createStatus = required<HTMLElement>('#github-project-selection-status');
  const editStatus = required<HTMLElement>('#github-project-edit-status');
  const connectCreateButton = required<HTMLButtonElement>('#connect-github-create-button');
  const connectEditButton = required<HTMLButtonElement>('#connect-github-edit-button');
  const listeners = new AbortController();
  let repositories: GitHubRepository[] = [];

  function required<T extends Element>(selector: string): T {
    const element = doc.querySelector<T>(selector);
    if (element === null) throw new Error(`Missing GitHub project element: ${selector}`);
    return element;
  }

  function createOption(label: string, value: string): HTMLOptionElement {
    const option = doc.createElement('option');
    option.textContent = label;
    option.value = value;
    return option;
  }

  function populateRepositorySelect(
    select: HTMLSelectElement,
    selected: GitHubRepositoryOptionSelection | null = null,
    unavailableRepository: GitHubRepository | null = null,
  ): void {
    const selectedRepositoryId = selected === null
      ? null
      : 'id' in selected ? selected.id : selected.repository_id;
    const choices = [createOption('No repository connected', '')];
    for (const repository of repositories) {
      choices.push(createOption(repository.full_name, githubRepositorySelectionValue(repository)));
    }
    if (selected !== null && !repositories.some((repository) =>
      repository.id === selectedRepositoryId && repository.installation_id === selected.installation_id)) {
      if (unavailableRepository?.id === selectedRepositoryId
        && unavailableRepository.installation_id === selected.installation_id) {
        choices.push(createOption(
          `${unavailableRepository.full_name} (access unavailable)`,
          githubRepositorySelectionValue(unavailableRepository),
        ));
      }
    }
    select.replaceChildren(...choices);
    select.value = selected === null ? '' : githubRepositorySelectionValue({
      installation_id: selected.installation_id,
      id: selectedRepositoryId ?? 0,
      owner: selected.owner,
      name: selected.name,
    });
  }

  async function load(): Promise<void> {
    if (options.getRole() !== 'admin') return;
    try {
      const result = await options.api<{
        repositories: GitHubRepository[];
        connected: boolean;
        configured: boolean;
        can_connect: boolean;
      }>('/github/repositories');
      repositories = result.repositories;
      const createSelected = parseGitHubRepositorySelection(createRepositorySelect.value);
      const activeRepository = options.getProject()?.github_repository ?? null;
      const editSelected = activeRepository ?? parseGitHubRepositorySelection(editRepositorySelect.value);
      populateRepositorySelect(createRepositorySelect, createSelected);
      populateRepositorySelect(editRepositorySelect, editSelected, activeRepository);
      const status = !result.configured
        ? 'GitHub App settings are not configured for this Tangent installation.'
        : !result.can_connect && !result.connected
          ? 'Configure GitHub user authorization before connecting an installation.'
          : !result.connected
            ? 'Connect a GitHub App installation to choose a repository.'
            : result.repositories.length === 0
              ? 'No repositories are available. Check which repositories the GitHub App can access.'
              : 'Choose a repository available to this workspace.';
      createStatus.textContent = status;
      editStatus.textContent = status;
      connectCreateButton.hidden = !result.can_connect;
      connectEditButton.hidden = !result.can_connect;
    } catch (error) {
      const status = error instanceof Error ? error.message : 'Could not load GitHub repositories.';
      createStatus.textContent = status;
      editStatus.textContent = status;
      connectCreateButton.hidden = false;
      connectEditButton.hidden = false;
    }
  }

  async function connect(): Promise<void> {
    if (options.getRole() !== 'admin') return;
    const githubWindow = window.open('about:blank', '_blank');
    if (githubWindow === null) {
      options.report('Allow pop-up windows to connect a GitHub installation.', true);
      return;
    }
    githubWindow.opener = null;
    try {
      const result = await options.api<{ url: string }>('/github/install', { method: 'POST', body: '{}' });
      githubWindow.location.assign(result.url);
    } catch (error) {
      githubWindow.close();
      options.report(error instanceof Error ? error.message : 'Could not start GitHub connection.', true);
    }
  }

  function reset(): void {
    repositories = [];
    populateRepositorySelect(createRepositorySelect);
    populateRepositorySelect(editRepositorySelect);
    createStatus.textContent = '';
    editStatus.textContent = '';
    connectCreateButton.hidden = true;
    connectEditButton.hidden = true;
  }

  connectCreateButton.addEventListener('click', () => void connect(), { signal: listeners.signal });
  connectEditButton.addEventListener('click', () => void connect(), { signal: listeners.signal });

  return {
    load,
    connect,
    populateRepositorySelect,
    reset,
    dispose: () => listeners.abort(),
  };
}
