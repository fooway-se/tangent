import { ApiFailure, api } from './api.js';
import type { Issue } from './types.js';
import type { IssueStatus } from './issue-board.js';

export interface IssueDeleteUiController {
  isOpen(): boolean;
  open(issue: Issue | null): void;
  close(): void;
  restore(issue: Issue, restoreButton: HTMLButtonElement): Promise<void>;
  dispose(): void;
}

export function initIssueDeleteUi(options: {
  getProjectId: () => number | null;
  statusLabel: (status: IssueStatus) => string;
  onDeleted: (issue: Issue, projectId: number) => Promise<boolean>;
  onRestored: (issue: Issue) => Promise<void>;
  onUnauthorized: () => void;
  report: (message: string, isError?: boolean) => void;
  request?: typeof api;
  doc?: Document;
}): IssueDeleteUiController {
  const doc = options.doc ?? document;
  const request = options.request ?? api;
  const issueDeleteConfirmation = required<HTMLDialogElement>('#issue-delete-confirmation');
  const issueDeleteDescription = required<HTMLElement>('#issue-delete-description');
  const issueDeleteError = required<HTMLElement>('#issue-delete-error');
  const issueDeleteCancel = required<HTMLButtonElement>('#issue-delete-cancel');
  const issueDeleteConfirm = required<HTMLButtonElement>('#issue-delete-confirm');
  const listeners = new AbortController();
  let targetIssue: Issue | null = null;

  function required<T extends Element>(selector: string): T {
    const element = doc.querySelector<T>(selector);
    if (element === null) throw new Error(`Missing issue delete element: ${selector}`);
    return element;
  }

  function clearDialogState(): void {
    targetIssue = null;
    issueDeleteError.textContent = '';
    issueDeleteError.hidden = true;
    issueDeleteConfirm.disabled = false;
  }

  function open(issue: Issue | null): void {
    if (issue === null) return;
    targetIssue = issue;
    issueDeleteDescription.textContent = `“${issue.title}” is currently ${options.statusLabel(issue.status)}. It will be moved to Deleted issues, where you can restore it later.`;
    issueDeleteError.textContent = '';
    issueDeleteError.hidden = true;
    issueDeleteConfirmation.showModal();
    issueDeleteCancel.focus();
  }

  function close(): void {
    if (issueDeleteConfirmation.open) issueDeleteConfirmation.close();
    clearDialogState();
  }

  async function confirmDelete(): Promise<void> {
    const issue = targetIssue;
    const projectId = options.getProjectId();
    if (issue === null || projectId !== issue.project_id) return;
    issueDeleteConfirm.disabled = true;
    issueDeleteError.textContent = '';
    issueDeleteError.hidden = true;
    try {
      await request<void>(`/issues/${issue.id}`, { method: 'DELETE' });
      close();
      if (options.getProjectId() !== projectId) return;
      if (await options.onDeleted(issue, projectId)) {
        options.report('Issue moved to Deleted issues. You can restore it from the issue list.');
      }
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 401) {
        close();
        options.onUnauthorized();
        return;
      }
      issueDeleteError.textContent = error instanceof Error ? error.message : 'Could not delete the issue.';
      issueDeleteError.hidden = false;
      issueDeleteConfirm.focus();
    } finally {
      issueDeleteConfirm.disabled = false;
    }
  }

  async function restore(issue: Issue, restoreButton: HTMLButtonElement): Promise<void> {
    restoreButton.disabled = true;
    try {
      await request<{ issue: Issue }>(`/issues/${issue.id}/restore`, { method: 'POST' });
      await options.onRestored(issue);
      options.report('Issue restored.');
    } catch (error) {
      options.report(error instanceof Error ? error.message : 'Could not restore the issue.', true);
    } finally {
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
