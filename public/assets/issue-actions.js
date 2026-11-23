export function initIssueActions(options) {
    async function updateStatus(issue, nextStatus) {
        const selectedIssue = options.getSelectedIssue();
        const previousStatus = selectedIssue?.id === issue.id
            ? selectedIssue.status
            : issue.status;
        if (nextStatus === previousStatus)
            return;
        try {
            const result = await options.api(`/issues/${issue.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ status: nextStatus }),
            });
            if (options.getSelectedIssue()?.id === issue.id) {
                options.setSelectedIssue(result.issue);
                options.setIssues(options.getIssues().map((candidate) => candidate.id === issue.id ? result.issue : candidate));
                options.renderDetail();
                options.renderBoard();
                if (previousStatus !== result.issue.status)
                    void options.loadStatusHistory(issue.id);
            }
            options.report('Issue status updated.');
            if (!options.isIssueDetailVisible())
                await options.reloadIssues(issue.project_id);
        }
        catch (error) {
            options.report(error instanceof Error ? error.message : 'Could not update the issue status.', true);
        }
    }
    async function move(issue, direction, button) {
        const projectId = options.getProjectId();
        if (projectId === null || projectId !== issue.project_id)
            return;
        button.disabled = true;
        try {
            const result = await options.api(`/issues/${issue.id}/move`, {
                method: 'POST',
                body: JSON.stringify({ direction }),
            });
            if (options.getProjectId() !== projectId || !options.isIssueListVisible())
                return;
            options.setIssues(options.getIssues().map((candidate) => candidate.id === issue.id ? result.issue : candidate));
            options.renderBoard();
            const movedIssueRow = options.issueList.querySelector(`.issue-card[data-issue-id="${issue.id}"]`);
            const focusTarget = movedIssueRow?.querySelector(`[data-move-direction="${direction}"]:not(:disabled)`) ?? movedIssueRow?.querySelector('.issue-title-button');
            focusTarget?.focus();
        }
        catch (error) {
            if (options.isUnauthorized(error)) {
                options.onUnauthorized();
                return;
            }
            options.report(error instanceof Error ? error.message : 'Could not reorder the issue.', true);
        }
        finally {
            button.disabled = false;
        }
    }
    return { updateStatus, move };
}
