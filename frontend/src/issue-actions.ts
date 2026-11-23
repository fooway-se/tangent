import type { Issue } from './types.js';
import type { IssueStatus } from './issue-board.js';

export interface IssueActionsOptions {
  api: <T>(path: string, init?: RequestInit) => Promise<T>;
  getProjectId: () => number | null;
  isIssueListVisible: () => boolean;
  isIssueDetailVisible: () => boolean;
  getSelectedIssue: () => Issue | null;
  setSelectedIssue: (issue: Issue | null) => void;
  getIssues: () => Issue[];
  setIssues: (issues: Issue[]) => void;
  issueList: HTMLElement;
  renderDetail: () => void;
  renderBoard: () => void;
  loadStatusHistory: (issueId: number) => void | Promise<void>;
  reloadIssues: (projectId: number) => void | Promise<void>;
  isUnauthorized: (error: unknown) => boolean;
  onUnauthorized: () => void;
  report: (message: string, isError?: boolean) => void;
}

export function initIssueActions(options: IssueActionsOptions): {
  updateStatus: (issue: Issue, nextStatus: IssueStatus) => Promise<void>;
  move: (issue: Issue, direction: 'up' | 'down', button: HTMLButtonElement) => Promise<void>;
} {
  async function updateStatus(issue: Issue, nextStatus: IssueStatus): Promise<void> {
    const selectedIssue = options.getSelectedIssue();
    const previousStatus = selectedIssue?.id === issue.id
      ? selectedIssue.status
      : issue.status;
    if (nextStatus === previousStatus) return;
    try {
      const result = await options.api<{ issue: Issue }>(`/issues/${issue.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      if (options.getSelectedIssue()?.id === issue.id) {
        options.setSelectedIssue(result.issue);
        options.setIssues(options.getIssues().map((candidate) => candidate.id === issue.id ? result.issue : candidate));
        options.renderDetail();
        options.renderBoard();
        if (previousStatus !== result.issue.status) void options.loadStatusHistory(issue.id);
      }
      options.report('Issue status updated.');
      if (!options.isIssueDetailVisible()) await options.reloadIssues(issue.project_id);
    } catch (error) {
      options.report(error instanceof Error ? error.message : 'Could not update the issue status.', true);
    }
  }

  async function move(issue: Issue, direction: 'up' | 'down', button: HTMLButtonElement): Promise<void> {
    const projectId = options.getProjectId();
    if (projectId === null || projectId !== issue.project_id) return;
    button.disabled = true;
    try {
      const result = await options.api<{ issue: Issue }>(`/issues/${issue.id}/move`, {
        method: 'POST',
        body: JSON.stringify({ direction }),
      });
      if (options.getProjectId() !== projectId || !options.isIssueListVisible()) return;
      options.setIssues(options.getIssues().map((candidate) => candidate.id === issue.id ? result.issue : candidate));
      options.renderBoard();
      const movedIssueRow = options.issueList.querySelector<HTMLLIElement>(`.issue-card[data-issue-id="${issue.id}"]`);
      const focusTarget = movedIssueRow?.querySelector<HTMLElement>(
        `[data-move-direction="${direction}"]:not(:disabled)`,
      ) ?? movedIssueRow?.querySelector<HTMLElement>('.issue-title-button');
      focusTarget?.focus();
    } catch (error) {
      if (options.isUnauthorized(error)) {
        options.onUnauthorized();
        return;
      }
      options.report(error instanceof Error ? error.message : 'Could not reorder the issue.', true);
    } finally {
      button.disabled = false;
    }
  }

  return { updateStatus, move };
}
