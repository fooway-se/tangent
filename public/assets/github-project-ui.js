import { githubRepositorySelectionValue, parseGitHubRepositorySelection } from './github-repository-selection.js';
export function initGithubProjectUi(options) {
    const doc = options.doc ?? document;
    const createRepositorySelect = required('#project-github-repository');
    const editRepositorySelect = required('#project-edit-github-repository');
    const createStatus = required('#github-project-selection-status');
    const editStatus = required('#github-project-edit-status');
    const connectCreateButton = required('#connect-github-create-button');
    const connectEditButton = required('#connect-github-edit-button');
    const listeners = new AbortController();
    let repositories = [];
    function required(selector) {
        const element = doc.querySelector(selector);
        if (element === null)
            throw new Error(`Missing GitHub project element: ${selector}`);
        return element;
    }
    function createOption(label, value) {
        const option = doc.createElement('option');
        option.textContent = label;
        option.value = value;
        return option;
    }
    function populateRepositorySelect(select, selected = null, unavailableRepository = null) {
        const selectedRepositoryId = selected === null
            ? null
            : 'id' in selected ? selected.id : selected.repository_id;
        const choices = [createOption('No repository connected', '')];
        for (const repository of repositories) {
            choices.push(createOption(repository.full_name, githubRepositorySelectionValue(repository)));
        }
        if (selected !== null && !repositories.some((repository) => repository.id === selectedRepositoryId && repository.installation_id === selected.installation_id)) {
            if (unavailableRepository?.id === selectedRepositoryId
                && unavailableRepository.installation_id === selected.installation_id) {
                choices.push(createOption(`${unavailableRepository.full_name} (access unavailable)`, githubRepositorySelectionValue(unavailableRepository)));
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
    async function load() {
        if (options.getRole() !== 'admin')
            return;
        try {
            const result = await options.api('/github/repositories');
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
        }
        catch (error) {
            const status = error instanceof Error ? error.message : 'Could not load GitHub repositories.';
            createStatus.textContent = status;
            editStatus.textContent = status;
            connectCreateButton.hidden = false;
            connectEditButton.hidden = false;
        }
    }
    async function connect() {
        if (options.getRole() !== 'admin')
            return;
        const githubWindow = window.open('about:blank', '_blank');
        if (githubWindow === null) {
            options.report('Allow pop-up windows to connect a GitHub installation.', true);
            return;
        }
        githubWindow.opener = null;
        try {
            const result = await options.api('/github/install', { method: 'POST', body: '{}' });
            githubWindow.location.assign(result.url);
        }
        catch (error) {
            githubWindow.close();
            options.report(error instanceof Error ? error.message : 'Could not start GitHub connection.', true);
        }
    }
    function reset() {
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
