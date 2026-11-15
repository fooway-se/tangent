"use strict";
class ApiFailure extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}
const loginPanel = document.querySelector('#login-panel');
const workspacePanel = document.querySelector('#workspace-panel');
const accountBar = document.querySelector('#account-bar');
const currentUserLabel = document.querySelector('#current-user');
const adminTools = document.querySelector('#admin-tools');
const projectForm = document.querySelector('#project-form');
const developerForm = document.querySelector('#developer-form');
const loginForm = document.querySelector('#login-form');
const projectList = document.querySelector('#project-list');
const emptyProjects = document.querySelector('#empty-projects');
const detailPanel = document.querySelector('#project-detail');
const statusMessage = document.querySelector('#status-message');
const logoutButton = document.querySelector('#logout-button');
let activeUser = null;
async function api(path, init = {}) {
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = new Headers(init.headers);
    if (init.body !== undefined && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && path !== '/auth/login') {
        const csrf = cookie('tangent_csrf');
        if (csrf !== null)
            headers.set('X-CSRF-Token', csrf);
    }
    const response = await fetch(`/api/v1${path}`, {
        ...init,
        method,
        headers,
        credentials: 'same-origin',
    });
    if (response.status === 204)
        return undefined;
    const payload = await response.json();
    if (!response.ok) {
        throw new ApiFailure(payload.error?.message ?? 'The request could not be completed.', response.status);
    }
    return payload;
}
function cookie(name) {
    const entry = document.cookie.split(';').map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
    return entry === undefined ? null : decodeURIComponent(entry.slice(name.length + 1));
}
function report(message, isError = false) {
    statusMessage.textContent = message;
    statusMessage.classList.toggle('error', isError);
}
function showSignedOut() {
    activeUser = null;
    loginPanel.hidden = false;
    workspacePanel.hidden = true;
    accountBar.hidden = true;
    detailPanel.hidden = true;
    projectList.replaceChildren();
    adminTools.hidden = true;
}
function showSignedIn(user) {
    activeUser = user;
    loginPanel.hidden = true;
    workspacePanel.hidden = false;
    accountBar.hidden = false;
    currentUserLabel.textContent = `${user.name} · ${user.role}`;
    adminTools.hidden = user.role !== 'admin';
    report('');
}
async function loadProjects() {
    const result = await api('/projects');
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
async function loadProjectDetail(projectId) {
    try {
        const result = await api(`/projects/${projectId}`);
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
            const userResult = await api('/users');
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
                if (!select.value)
                    return;
                try {
                    await api(`/projects/${projectId}/members/${select.value}`, { method: 'PUT' });
                    report('Member added to the project.');
                    await loadProjectDetail(projectId);
                }
                catch (error) {
                    report(error instanceof Error ? error.message : 'Could not add member.', true);
                }
            });
            detailPanel.append(form);
        }
    }
    catch (error) {
        report(error instanceof Error ? error.message : 'Could not load the project.', true);
    }
}
loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = new FormData(loginForm);
    try {
        const result = await api('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email: values.get('email'), password: values.get('password') }),
        });
        showSignedIn(result.user);
        await loadProjects();
    }
    catch (error) {
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
    }
    catch (error) {
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
    }
    catch (error) {
        report(error instanceof Error ? error.message : 'Could not add developer.', true);
    }
});
logoutButton.addEventListener('click', async () => {
    try {
        await api('/auth/logout', { method: 'POST' });
    }
    finally {
        showSignedOut();
    }
});
async function start() {
    try {
        const result = await api('/auth/me');
        showSignedIn(result.user);
        await loadProjects();
    }
    catch (error) {
        showSignedOut();
        if (error instanceof ApiFailure && error.status !== 401) {
            report(error.message, true);
        }
    }
}
void start();
