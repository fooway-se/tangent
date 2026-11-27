import { PROJECT_STATUS_HINTS, PROJECT_STATUS_LABELS, } from './types-679ae1beb269.js';
import { parseGitHubRepositorySelection } from './github-repository-selection-0e4af8a24b46.js';
export function initProjectEditUi(options) {
    const doc = options.doc ?? document;
    const dialog = required('#project-edit-dialog');
    const form = required('#project-edit-form');
    const closeButton = required('#project-edit-close');
    const cancelButton = required('#project-edit-cancel');
    const nameInput = required('#project-edit-name');
    const descriptionInput = required('#project-edit-description-input');
    const statusSelect = required('#project-edit-status');
    const statusHelp = required('#project-edit-status-help');
    const message = required('#project-edit-message');
    const saveButton = required('#project-edit-save');
    const editButton = required('#edit-project-button');
    const repositorySelect = required('#project-edit-github-repository');
    const listeners = new AbortController();
    function required(selector) {
        const element = doc.querySelector(selector);
        if (element === null)
            throw new Error(`Missing project edit element: ${selector}`);
        return element;
    }
    function updateStatusHint() {
        const project = options.getProject();
        const status = statusSelect.value;
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
        }
        else if (project?.status === 'archived' && status !== 'archived') {
            hint += status === archivedFromStatus
                ? ' Saving will restore the previous work state.'
                : ` Saving will unarchive the project as ${PROJECT_STATUS_LABELS[status].toLowerCase()}.`;
        }
        statusHelp.textContent = hint;
    }
    function open() {
        const project = options.getProject();
        if (options.getRole() !== 'admin' || project === null)
            return;
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
    async function save(event) {
        event.preventDefault();
        const project = options.getProject();
        if (options.getRole() !== 'admin' || project === null)
            return;
        const projectId = project.id;
        saveButton.disabled = true;
        message.textContent = '';
        message.classList.remove('is-error');
        try {
            const githubRepositorySelection = parseGitHubRepositorySelection(repositorySelect.value);
            const result = await options.api(`/projects/${projectId}`, {
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
            if (options.getProject()?.id !== projectId)
                return;
            options.onUpdated(result.project);
            options.report('Project updated.');
            dialog.close();
            try {
                await options.refreshProjects();
            }
            catch (error) {
                options.report(error instanceof Error ? error.message : 'Project updated, but the project list could not be refreshed.', true);
            }
        }
        catch (error) {
            message.textContent = error instanceof Error ? error.message : 'Could not update the project.';
            message.classList.add('is-error');
            nameInput.focus();
        }
        finally {
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
        if (options.getRole() === 'admin' && options.isProjectViewVisible())
            editButton.focus();
    }, { signal: listeners.signal });
    return { open, dispose: () => listeners.abort() };
}
