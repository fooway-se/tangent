import { PROJECT_STATUS_LABELS, PROJECT_STATUS_ORDER, } from './types-679ae1beb269.js';
import { parseGitHubRepositorySelection } from './github-repository-selection-0e4af8a24b46.js';
export function initProjectListUi(options) {
    const doc = options.doc ?? document;
    const projectList = required('#project-list');
    const projectSidebarList = required('#project-sidebar-list');
    const emptyProjects = required('#empty-projects');
    const projectSidebarEmpty = required('#project-sidebar-empty');
    const projectForm = required('#project-form');
    const projectFormPanel = required('#project-form-panel');
    const toggleProjectFormButton = required('#toggle-project-form');
    const cancelProjectFormButton = required('#cancel-project-form');
    const githubRepositorySelect = required('#project-github-repository');
    const listeners = new AbortController();
    function required(selector) {
        const element = doc.querySelector(selector);
        if (element === null)
            throw new Error(`Missing project list element: ${selector}`);
        return element;
    }
    function projectStatusLabel(status) {
        return PROJECT_STATUS_LABELS[status];
    }
    function updateEmptyStates(projects) {
        const isEmpty = projects.length === 0;
        const isAdmin = options.getRole() === 'admin';
        emptyProjects.hidden = !isEmpty;
        projectSidebarEmpty.hidden = !isEmpty;
        if (!isEmpty)
            return;
        emptyProjects.textContent = isAdmin
            ? 'No projects yet.'
            : "You're not a member of any projects yet. Ask a workspace admin to add you.";
        projectSidebarEmpty.textContent = isAdmin ? 'No projects yet.' : 'No project access yet.';
    }
    function closeForm() {
        projectForm.reset();
        projectFormPanel.hidden = true;
        toggleProjectFormButton.focus();
    }
    function toggleForm() {
        if (!projectFormPanel.hidden) {
            closeForm();
            return;
        }
        projectFormPanel.hidden = false;
        projectForm.querySelector('input[name="name"]')?.focus();
    }
    async function load() {
        projectList.replaceChildren();
        projectSidebarList.replaceChildren();
        emptyProjects.hidden = false;
        projectSidebarEmpty.hidden = false;
        emptyProjects.textContent = 'Loading projects…';
        projectSidebarEmpty.textContent = 'Loading projects…';
        let result;
        try {
            result = await options.api('/projects');
        }
        catch (error) {
            emptyProjects.textContent = 'Could not load projects.';
            projectSidebarEmpty.textContent = 'Could not load projects.';
            throw error;
        }
        const projects = [...result.projects].sort((left, right) => (PROJECT_STATUS_ORDER[left.status] - PROJECT_STATUS_ORDER[right.status]
            || left.name.localeCompare(right.name)));
        updateEmptyStates(projects);
        for (const project of projects) {
            const item = doc.createElement('li');
            item.className = 'project-card';
            item.dataset.projectId = String(project.id);
            const details = doc.createElement('div');
            details.className = 'project-card-details';
            const name = doc.createElement('p');
            name.className = 'project-name';
            name.textContent = project.name;
            const description = doc.createElement('p');
            description.className = 'project-description';
            description.textContent = project.description || project.slug;
            details.append(name, description);
            const actions = doc.createElement('div');
            actions.className = 'project-card-actions';
            const state = doc.createElement('span');
            state.className = 'project-status';
            state.textContent = projectStatusLabel(project.status);
            state.classList.toggle('is-paused', project.status === 'paused');
            state.classList.toggle('is-read-only', project.status === 'completed' || project.status === 'archived');
            const open = doc.createElement('button');
            open.className = 'button button-quiet';
            open.type = 'button';
            open.textContent = 'Open';
            open.addEventListener('click', () => options.openProject(project.id));
            actions.append(state, open);
            item.append(details, actions);
            projectList.append(item);
            const sidebarItem = doc.createElement('li');
            const sidebarButton = doc.createElement('button');
            sidebarButton.type = 'button';
            sidebarButton.className = 'project-sidebar-link';
            sidebarButton.dataset.projectId = String(project.id);
            sidebarButton.classList.toggle('is-active', options.getActiveProjectId() === project.id);
            sidebarButton.textContent = project.name;
            sidebarButton.setAttribute('aria-label', `${project.name}, ${projectStatusLabel(project.status)}`);
            sidebarButton.addEventListener('click', () => options.openProject(project.id));
            sidebarItem.append(sidebarButton);
            projectSidebarList.append(sidebarItem);
        }
        window.requestAnimationFrame(options.onRendered);
    }
    async function createProject(event) {
        event.preventDefault();
        const values = new FormData(projectForm);
        try {
            const githubRepositorySelection = parseGitHubRepositorySelection(githubRepositorySelect.value);
            await options.api('/projects', {
                method: 'POST',
                body: JSON.stringify({
                    name: values.get('name'),
                    description: values.get('description'),
                    github_installation_id: githubRepositorySelection?.installation_id ?? null,
                    github_repository_id: githubRepositorySelection?.repository_id ?? null,
                    github_repository_owner: githubRepositorySelection?.owner ?? null,
                    github_repository_name: githubRepositorySelection?.name ?? null,
                }),
            });
            closeForm();
            options.report('Project created.');
            await load();
        }
        catch (error) {
            if (!projectFormPanel.hidden)
                projectForm.querySelector('input[name="name"]')?.focus();
            options.report(error instanceof Error ? error.message : 'Could not create project.', true);
        }
    }
    toggleProjectFormButton.addEventListener('click', toggleForm, { signal: listeners.signal });
    cancelProjectFormButton.addEventListener('click', closeForm, { signal: listeners.signal });
    projectForm.addEventListener('submit', (event) => void createProject(event), { signal: listeners.signal });
    return {
        load,
        isFormOpen: () => !projectFormPanel.hidden,
        toggleForm,
        closeForm,
        dispose: () => listeners.abort(),
    };
}
