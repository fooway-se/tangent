import { api, ApiFailure } from './api.js';
export function initScratchpadUi(options) {
    const doc = options.doc ?? document;
    const dialog = required('#scratchpad-dialog');
    const closeButton = required('#scratchpad-close');
    const body = required('#scratchpad-body');
    const status = required('#scratchpad-status');
    const convertButton = required('#scratchpad-convert-button');
    const convertForm = required('#scratchpad-convert-form');
    const projectSelect = required('#scratchpad-project');
    const convertSubmit = required('#scratchpad-convert-submit');
    const convertCancel = required('#scratchpad-convert-cancel');
    const listeners = new AbortController();
    const schedule = options.setTimeout ?? ((callback, delay) => window.setTimeout(callback, delay));
    const cancel = options.clearTimeout ?? ((timer) => window.clearTimeout(timer));
    let savedBody = '';
    let saveTimer = null;
    let saving = null;
    let loading = null;
    let editRevision = 0;
    let openRevision = 0;
    function required(selector) {
        const element = doc.querySelector(selector);
        if (element === null)
            throw new Error(`Missing scratchpad element: ${selector}`);
        return element;
    }
    function reportError(error, fallback) {
        if (error instanceof ApiFailure && error.status === 401) {
            options.onUnauthorized();
            return;
        }
        status.textContent = error instanceof Error ? error.message : fallback;
    }
    function cancelSave() {
        if (saveTimer !== null)
            cancel(saveTimer);
        saveTimer = null;
    }
    async function saveCurrent() {
        cancelSave();
        if (loading !== null)
            await loading;
        while (body.value !== savedBody) {
            if (saving !== null) {
                if (!(await saving))
                    return false;
                continue;
            }
            const currentBody = body.value;
            status.textContent = 'Saving…';
            saving = api('/scratchpad', {
                method: 'PUT',
                body: JSON.stringify({ body: currentBody }),
            }).then((result) => {
                savedBody = result.body;
                if (body.value === savedBody)
                    status.textContent = 'Saved.';
                return true;
            }).catch((error) => {
                reportError(error, 'Could not save the scratchpad.');
                return false;
            }).finally(() => {
                saving = null;
            });
            if (!(await saving))
                return false;
        }
        return true;
    }
    function scheduleSave() {
        editRevision += 1;
        cancelSave();
        status.textContent = 'Saving automatically…';
        saveTimer = schedule(() => {
            saveTimer = null;
            void saveCurrent();
        }, 600);
    }
    async function loadNote(revision) {
        const revisionAtStart = editRevision;
        status.textContent = 'Loading…';
        try {
            const note = await api('/scratchpad');
            if (revision !== openRevision)
                return;
            savedBody = note.body;
            if (editRevision === revisionAtStart)
                body.value = note.body;
            status.textContent = editRevision === revisionAtStart ? 'Saved automatically.' : 'Saving automatically…';
            if (editRevision !== revisionAtStart && saveTimer === null) {
                saveTimer = schedule(() => {
                    saveTimer = null;
                    void saveCurrent();
                }, 600);
            }
        }
        catch (error) {
            if (revision === openRevision)
                reportError(error, 'Could not load the scratchpad.');
        }
    }
    async function loadProjects() {
        status.textContent = 'Loading projects…';
        convertButton.disabled = true;
        try {
            const result = await api('/projects');
            const writableProjects = result.projects.filter((project) => !['completed', 'archived'].includes(project.status));
            if (writableProjects.length === 0) {
                status.textContent = result.projects.length === 0
                    ? 'You need access to a project before creating an issue.'
                    : 'All your projects are read-only. Reopen one before creating an issue.';
                return;
            }
            const placeholder = doc.createElement('option');
            placeholder.value = '';
            placeholder.textContent = 'Choose a project';
            projectSelect.replaceChildren(placeholder);
            for (const project of writableProjects) {
                const option = doc.createElement('option');
                option.value = String(project.id);
                option.textContent = project.name;
                projectSelect.append(option);
            }
            convertForm.hidden = false;
            status.textContent = '';
            projectSelect.focus();
        }
        catch (error) {
            reportError(error, 'Could not load projects.');
        }
        finally {
            convertButton.disabled = false;
        }
    }
    async function convertToIssue(event) {
        event.preventDefault();
        const projectId = Number(projectSelect.value);
        if (!Number.isSafeInteger(projectId) || projectId < 1) {
            status.textContent = 'Choose a project first.';
            projectSelect.focus();
            return;
        }
        if (body.value.trim() === '') {
            status.textContent = 'Write something in the scratchpad first.';
            body.focus();
            return;
        }
        if (!(await saveCurrent()))
            return;
        convertSubmit.disabled = true;
        status.textContent = 'Creating issue…';
        try {
            const result = await api('/scratchpad/issue', {
                method: 'POST',
                body: JSON.stringify({ project_id: projectId }),
            });
            body.value = '';
            savedBody = '';
            editRevision += 1;
            convertForm.hidden = true;
            status.textContent = `Created issue: ${result.issue.title}`;
            close(false);
            options.onIssueCreated?.(result.issue);
        }
        catch (error) {
            reportError(error, 'Could not create the issue.');
        }
        finally {
            convertSubmit.disabled = false;
        }
    }
    async function open() {
        if (!dialog.open)
            dialog.showModal();
        convertForm.hidden = true;
        body.focus();
        const revision = ++openRevision;
        const request = loadNote(revision);
        loading = request;
        await request;
        if (loading === request)
            loading = null;
    }
    function close(persist = true) {
        cancelSave();
        if (persist && body.value !== savedBody)
            void saveCurrent();
        convertForm.hidden = true;
        if (dialog.open)
            dialog.close();
    }
    closeButton.addEventListener('click', () => close(), { signal: listeners.signal });
    body.addEventListener('input', scheduleSave, { signal: listeners.signal });
    convertButton.addEventListener('click', () => { void loadProjects(); }, { signal: listeners.signal });
    convertForm.addEventListener('submit', (event) => { void convertToIssue(event); }, { signal: listeners.signal });
    convertCancel.addEventListener('click', () => {
        convertForm.hidden = true;
        status.textContent = '';
        body.focus();
    }, { signal: listeners.signal });
    return {
        open,
        close,
        isOpen: () => dialog.open,
        dispose: () => {
            cancelSave();
            listeners.abort();
        },
    };
}
