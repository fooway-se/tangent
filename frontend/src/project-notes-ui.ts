import { ApiFailure, api } from './api.js';
import { DEFAULT_PROJECT_NOTES_MODE, renderMarkdown } from './project-notes.js';
import type { Project } from './types.js';

export interface ProjectNotesUi {
  readonly view: HTMLElement;
  reset(): void;
  refreshRepository(): void;
  setMode(mode: 'write' | 'preview'): void;
  setReadOnly(readOnly: boolean): void;
  isLoadedFor(projectId: number): boolean;
  load(projectId: number): Promise<void>;
  dispose(): void;
}

export function initProjectNotesUi(options: {
  getProject: () => Project | null;
  onUnauthorized: () => void;
  copyToClipboard?: (value: string) => Promise<void>;
}): ProjectNotesUi {
  const projectNotesView = document.querySelector<HTMLElement>('#project-notes-view')!;
  const projectNotesForm = document.querySelector<HTMLFormElement>('#project-notes-form')!;
  const projectNotesInput = document.querySelector<HTMLTextAreaElement>('#project-notes-input')!;
  const projectNotesPreview = document.querySelector<HTMLElement>('#project-notes-preview')!;
  const projectNotesStatus = document.querySelector<HTMLElement>('#project-notes-status')!;
  const projectNotesSave = document.querySelector<HTMLButtonElement>('#project-notes-save')!;
  const projectNotesWrite = document.querySelector<HTMLButtonElement>('#project-notes-write')!;
  const projectNotesPreviewToggle = document.querySelector<HTMLButtonElement>('#project-notes-preview-toggle')!;
  const projectRepositoryCard = document.querySelector<HTMLElement>('#project-repository-card')!;
  const projectRepositoryLink = document.querySelector<HTMLAnchorElement>('#project-repository-link')!;
  const projectRepositoryBranchRow = document.querySelector<HTMLElement>('#project-repository-branch-row')!;
  const projectRepositoryDefaultBranch = document.querySelector<HTMLElement>('#project-repository-default-branch')!;
  const projectRepositoryCloneCommand = document.querySelector<HTMLElement>('#project-repository-clone-command')!;
  const projectRepositoryCopy = document.querySelector<HTMLButtonElement>('#project-repository-copy')!;
  const projectRepositoryStatus = document.querySelector<HTMLElement>('#project-repository-status')!;
  const listeners = new AbortController();
  let loadedProjectNotesId: number | null = null;
  let savedProjectNotes = '';
  let cloneCommand = '';
  let projectNotesMode: 'write' | 'preview' = DEFAULT_PROJECT_NOTES_MODE;

  function renderRepository(project: Project | null): void {
    const repository = project?.github_repository ?? null;
    projectRepositoryStatus.textContent = '';
    if (repository === null) {
      projectRepositoryCard.hidden = true;
      projectRepositoryLink.href = '';
      projectRepositoryLink.textContent = '';
      projectRepositoryBranchRow.hidden = true;
      projectRepositoryDefaultBranch.textContent = '';
      projectRepositoryCloneCommand.textContent = '';
      projectRepositoryCopy.disabled = true;
      cloneCommand = '';
      return;
    }

    projectRepositoryCard.hidden = false;
    projectRepositoryLink.href = repository.html_url;
    projectRepositoryLink.textContent = repository.full_name;
    const defaultBranch = repository.default_branch?.trim() ?? '';
    projectRepositoryBranchRow.hidden = defaultBranch === '';
    projectRepositoryDefaultBranch.textContent = defaultBranch;
    cloneCommand = `git clone ${repository.html_url.replace(/\/+$/, '')}.git`;
    projectRepositoryCloneCommand.textContent = cloneCommand;
    projectRepositoryCopy.disabled = false;
  }

  async function copyRepositoryCommand(): Promise<void> {
    if (cloneCommand === '') return;
    try {
      if (options.copyToClipboard !== undefined) {
        await options.copyToClipboard(cloneCommand);
      } else {
        if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') {
          throw new Error('Clipboard access is unavailable.');
        }
        await navigator.clipboard.writeText(cloneCommand);
      }
      projectRepositoryStatus.textContent = 'Clone command copied.';
    } catch {
      projectRepositoryStatus.textContent = 'Could not copy the command. Select and copy it manually.';
    }
  }

  function setMode(mode: 'write' | 'preview'): void {
    projectNotesMode = mode;
    const isWriting = mode === 'write';
    projectNotesWrite.classList.toggle('is-active', isWriting);
    projectNotesPreviewToggle.classList.toggle('is-active', !isWriting);
    projectNotesWrite.setAttribute('aria-pressed', String(isWriting));
    projectNotesPreviewToggle.setAttribute('aria-pressed', String(!isWriting));
    projectNotesInput.hidden = !isWriting;
    projectNotesPreview.hidden = isWriting;
    projectNotesSave.hidden = !isWriting;
    if (!isWriting) {
      const markdown = projectNotesInput.value;
      projectNotesPreview.innerHTML = markdown.trim() === ''
        ? '<p class="markdown-empty">Nothing written yet.</p>'
        : renderMarkdown(markdown);
    }
  }

  function updateDirtyState(): void {
    const changed = projectNotesInput.value !== savedProjectNotes;
    projectNotesSave.disabled = !changed || projectNotesInput.disabled;
    if (loadedProjectNotesId === options.getProject()?.id) {
      projectNotesStatus.textContent = changed
        ? 'Unsaved changes.'
        : savedProjectNotes === ''
          ? 'No notes yet. Notes are private to the internal team.'
          : 'Saved. Notes are private to the internal team.';
    }
    if (projectNotesMode === 'preview') setMode('preview');
  }

  function reset(): void {
    loadedProjectNotesId = null;
    savedProjectNotes = '';
    renderRepository(null);
    projectNotesInput.value = '';
    projectNotesStatus.textContent = 'Notes are private to the internal team.';
    projectNotesSave.disabled = true;
    setMode(DEFAULT_PROJECT_NOTES_MODE);
  }

  function setReadOnly(readOnly: boolean): void {
    projectNotesInput.disabled = readOnly;
    projectNotesWrite.disabled = readOnly;
    projectNotesSave.disabled = readOnly || projectNotesInput.value === savedProjectNotes;
    if (readOnly) setMode('preview');
  }

  async function load(projectId: number): Promise<void> {
    const project = options.getProject();
    renderRepository(project?.id === projectId ? project : null);
    projectNotesStatus.textContent = 'Loading notes…';
    projectNotesInput.disabled = true;
    projectNotesSave.disabled = true;
    try {
      const result = await api<{ notes: string; updated_at: string | null }>(`/projects/${projectId}/notes`);
      const project = options.getProject();
      if (project?.id !== projectId) return;
      projectNotesInput.value = result.notes;
      savedProjectNotes = result.notes;
      loadedProjectNotesId = projectId;
      projectNotesInput.disabled = project.status === 'completed' || project.status === 'archived';
      projectNotesStatus.textContent = result.updated_at === null
        ? 'No notes yet. Notes are private to the internal team.'
        : 'Saved. Notes are private to the internal team.';
      updateDirtyState();
      setMode(projectNotesMode);
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 401) {
        options.onUnauthorized();
        return;
      }
      if (options.getProject()?.id === projectId) {
        projectNotesStatus.textContent = error instanceof Error ? error.message : 'Could not load project notes.';
        projectNotesInput.disabled = true;
      }
    }
  }

  async function save(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const projectId = options.getProject()?.id;
    if (projectId === undefined || loadedProjectNotesId !== projectId || projectNotesInput.disabled) return;
    const notes = projectNotesInput.value;
    projectNotesInput.disabled = true;
    projectNotesSave.disabled = true;
    projectNotesStatus.textContent = 'Saving…';
    try {
      const result = await api<{ notes: string; updated_at: string | null }>(`/projects/${projectId}/notes`, {
        method: 'PUT',
        body: JSON.stringify({ notes }),
      });
      if (options.getProject()?.id !== projectId) return;
      savedProjectNotes = result.notes;
      projectNotesInput.value = result.notes;
      projectNotesStatus.textContent = 'Saved. Notes are private to the internal team.';
      updateDirtyState();
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 401) {
        options.onUnauthorized();
        return;
      }
      if (options.getProject()?.id === projectId) {
        projectNotesStatus.textContent = error instanceof Error ? error.message : 'Could not save project notes.';
      }
    } finally {
      const project = options.getProject();
      if (project?.id === projectId) {
        projectNotesInput.disabled = project.status === 'completed' || project.status === 'archived';
        projectNotesSave.disabled = projectNotesInput.disabled || projectNotesInput.value === savedProjectNotes;
      }
    }
  }

  projectNotesWrite.addEventListener('click', () => setMode('write'), { signal: listeners.signal });
  projectNotesPreviewToggle.addEventListener('click', () => setMode('preview'), { signal: listeners.signal });
  projectRepositoryCopy.addEventListener('click', () => { void copyRepositoryCommand(); }, { signal: listeners.signal });
  projectNotesInput.addEventListener('input', updateDirtyState, { signal: listeners.signal });
  projectNotesForm.addEventListener('submit', (event) => { void save(event); }, { signal: listeners.signal });

  return {
    view: projectNotesView,
    reset,
    refreshRepository: () => renderRepository(options.getProject()),
    setMode,
    setReadOnly,
    isLoadedFor: (projectId) => loadedProjectNotesId === projectId,
    load,
    dispose: () => listeners.abort(),
  };
}
