import { ApiFailure, api } from './api.js';
import { DEFAULT_PROJECT_NOTES_MODE, renderMarkdown } from './project-notes.js';
export function initProjectNotesUi(options) {
    const projectNotesView = document.querySelector('#project-notes-view');
    const projectNotesForm = document.querySelector('#project-notes-form');
    const projectNotesInput = document.querySelector('#project-notes-input');
    const projectNotesPreview = document.querySelector('#project-notes-preview');
    const projectNotesStatus = document.querySelector('#project-notes-status');
    const projectNotesSave = document.querySelector('#project-notes-save');
    const projectNotesWrite = document.querySelector('#project-notes-write');
    const projectNotesPreviewToggle = document.querySelector('#project-notes-preview-toggle');
    const projectRepositoryCard = document.querySelector('#project-repository-card');
    const projectRepositoryLink = document.querySelector('#project-repository-link');
    const projectRepositoryBranchRow = document.querySelector('#project-repository-branch-row');
    const projectRepositoryDefaultBranch = document.querySelector('#project-repository-default-branch');
    const projectRepositoryCloneCommand = document.querySelector('#project-repository-clone-command');
    const projectRepositoryCopy = document.querySelector('#project-repository-copy');
    const projectRepositoryStatus = document.querySelector('#project-repository-status');
    const listeners = new AbortController();
    let loadedProjectNotesId = null;
    let savedProjectNotes = '';
    let cloneCommand = '';
    let projectNotesMode = DEFAULT_PROJECT_NOTES_MODE;
    function renderRepository(project) {
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
    async function copyRepositoryCommand() {
        if (cloneCommand === '')
            return;
        try {
            if (options.copyToClipboard !== undefined) {
                await options.copyToClipboard(cloneCommand);
            }
            else {
                if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') {
                    throw new Error('Clipboard access is unavailable.');
                }
                await navigator.clipboard.writeText(cloneCommand);
            }
            projectRepositoryStatus.textContent = 'Clone command copied.';
        }
        catch {
            projectRepositoryStatus.textContent = 'Could not copy the command. Select and copy it manually.';
        }
    }
    function setMode(mode) {
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
    function updateDirtyState() {
        const changed = projectNotesInput.value !== savedProjectNotes;
        projectNotesSave.disabled = !changed || projectNotesInput.disabled;
        if (loadedProjectNotesId === options.getProject()?.id) {
            projectNotesStatus.textContent = changed
                ? 'Unsaved changes.'
                : savedProjectNotes === ''
                    ? 'No notes yet. Notes are private to the internal team.'
                    : 'Saved. Notes are private to the internal team.';
        }
        if (projectNotesMode === 'preview')
            setMode('preview');
    }
    function reset() {
        loadedProjectNotesId = null;
        savedProjectNotes = '';
        renderRepository(null);
        projectNotesInput.value = '';
        projectNotesStatus.textContent = 'Notes are private to the internal team.';
        projectNotesSave.disabled = true;
        setMode(DEFAULT_PROJECT_NOTES_MODE);
    }
    function setReadOnly(readOnly) {
        projectNotesInput.disabled = readOnly;
        projectNotesWrite.disabled = readOnly;
        projectNotesSave.disabled = readOnly || projectNotesInput.value === savedProjectNotes;
        if (readOnly)
            setMode('preview');
    }
    async function load(projectId) {
        const project = options.getProject();
        renderRepository(project?.id === projectId ? project : null);
        projectNotesStatus.textContent = 'Loading notes…';
        projectNotesInput.disabled = true;
        projectNotesSave.disabled = true;
        try {
            const result = await api(`/projects/${projectId}/notes`);
            const project = options.getProject();
            if (project?.id !== projectId)
                return;
            projectNotesInput.value = result.notes;
            savedProjectNotes = result.notes;
            loadedProjectNotesId = projectId;
            projectNotesInput.disabled = project.status === 'completed' || project.status === 'archived';
            projectNotesStatus.textContent = result.updated_at === null
                ? 'No notes yet. Notes are private to the internal team.'
                : 'Saved. Notes are private to the internal team.';
            updateDirtyState();
            setMode(projectNotesMode);
        }
        catch (error) {
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
    async function save(event) {
        event.preventDefault();
        const projectId = options.getProject()?.id;
        if (projectId === undefined || loadedProjectNotesId !== projectId || projectNotesInput.disabled)
            return;
        const notes = projectNotesInput.value;
        projectNotesInput.disabled = true;
        projectNotesSave.disabled = true;
        projectNotesStatus.textContent = 'Saving…';
        try {
            const result = await api(`/projects/${projectId}/notes`, {
                method: 'PUT',
                body: JSON.stringify({ notes }),
            });
            if (options.getProject()?.id !== projectId)
                return;
            savedProjectNotes = result.notes;
            projectNotesInput.value = result.notes;
            projectNotesStatus.textContent = 'Saved. Notes are private to the internal team.';
            updateDirtyState();
        }
        catch (error) {
            if (error instanceof ApiFailure && error.status === 401) {
                options.onUnauthorized();
                return;
            }
            if (options.getProject()?.id === projectId) {
                projectNotesStatus.textContent = error instanceof Error ? error.message : 'Could not save project notes.';
            }
        }
        finally {
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
