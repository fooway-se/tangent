import { ApiFailure, api } from './api-c96a28d6bb6c.js';
export function initIssueDeleteUi(options) {
    const doc = options.doc ?? document;
    const request = options.request ?? api;
    const issueDeleteConfirmation = required('#issue-delete-confirmation');
    const issueDeleteDescription = required('#issue-delete-description');
    const issueDeleteError = required('#issue-delete-error');
    const issueDeleteCancel = required('#issue-delete-cancel');
    const issueDeleteConfirm = required('#issue-delete-confirm');
    const listeners = new AbortController();
    let targetIssue = null;
    function required(selector) {
        const element = doc.querySelector(selector);
        if (element === null)
            throw new Error(`Missing issue delete element: ${selector}`);
        return element;
    }
    function clearDialogState() {
        targetIssue = null;
        issueDeleteError.textContent = '';
        issueDeleteError.hidden = true;
        issueDeleteConfirm.disabled = false;
    }
    function open(issue) {
        if (issue === null)
            return;
        targetIssue = issue;
        issueDeleteDescription.textContent = `“${issue.title}” is currently ${options.statusLabel(issue.status)}. It will be moved to Deleted issues, where you can restore it later.`;
        issueDeleteError.textContent = '';
        issueDeleteError.hidden = true;
        issueDeleteConfirmation.showModal();
        issueDeleteCancel.focus();
    }
    function close() {
        if (issueDeleteConfirmation.open)
            issueDeleteConfirmation.close();
        clearDialogState();
    }
    async function confirmDelete() {
        const issue = targetIssue;
        const projectId = options.getProjectId();
        if (issue === null || projectId !== issue.project_id)
            return;
        issueDeleteConfirm.disabled = true;
        issueDeleteError.textContent = '';
        issueDeleteError.hidden = true;
        try {
            await request(`/issues/${issue.id}`, { method: 'DELETE' });
            close();
            if (options.getProjectId() !== projectId)
                return;
            if (await options.onDeleted(issue, projectId)) {
                options.report('Issue moved to Deleted issues. You can restore it from the issue list.');
            }
        }
        catch (error) {
            if (error instanceof ApiFailure && error.status === 401) {
                close();
                options.onUnauthorized();
                return;
            }
            issueDeleteError.textContent = error instanceof Error ? error.message : 'Could not delete the issue.';
            issueDeleteError.hidden = false;
            issueDeleteConfirm.focus();
        }
        finally {
            issueDeleteConfirm.disabled = false;
        }
    }
    async function restore(issue, restoreButton) {
        restoreButton.disabled = true;
        try {
            await request(`/issues/${issue.id}/restore`, { method: 'POST' });
            await options.onRestored(issue);
            options.report('Issue restored.');
        }
        catch (error) {
            options.report(error instanceof Error ? error.message : 'Could not restore the issue.', true);
        }
        finally {
            restoreButton.disabled = false;
        }
    }
    issueDeleteCancel.addEventListener('click', close, { signal: listeners.signal });
    issueDeleteConfirm.addEventListener('click', () => void confirmDelete(), { signal: listeners.signal });
    issueDeleteConfirmation.addEventListener('close', clearDialogState, { signal: listeners.signal });
    return {
        isOpen: () => issueDeleteConfirmation.open,
        open,
        close,
        restore,
        dispose: () => listeners.abort(),
    };
}
