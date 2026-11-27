import { ApiFailure } from './api-c96a28d6bb6c.js';
export function initIssueBulkActions(options) {
    async function assignSelectedIssues() {
        const projectId = options.getProjectId();
        const issueIds = Array.from(options.getSelectedAssignIssueIds());
        const target = options.getAssignTargetValue();
        const assigneeId = target === 'unassigned' ? null : Number(target);
        if (projectId === null || issueIds.length === 0 || issueIds.length > 500
            || target === '' || (assigneeId !== null && (!Number.isInteger(assigneeId) || assigneeId < 1))
            || options.isActionPending() || options.isMovePending())
            return;
        options.setActionPending(true);
        options.syncAssignControls();
        try {
            const result = await options.api(`/projects/${projectId}/issues/assign`, {
                method: 'POST',
                body: JSON.stringify({ issue_ids: issueIds, assignee_id: assigneeId }),
            });
            if (options.getActiveProjectId() !== projectId) {
                options.setActionPending(false);
                if (options.getActiveProjectId() !== null && options.isIssueViewVisible())
                    options.renderBoard();
                return;
            }
            options.setIssues(options.getIssues().map((issue) => issueIds.includes(issue.id)
                ? { ...issue, assignee_id: assigneeId }
                : issue));
            const selectedIssue = options.getSelectedIssue();
            if (selectedIssue !== null && issueIds.includes(selectedIssue.id)) {
                options.setSelectedIssue({ ...selectedIssue, assignee_id: assigneeId });
                options.renderDetail();
            }
            options.clearAssignSelection();
            options.setActionPending(false);
            options.renderBoard();
            options.focusAssignToggle();
            const description = assigneeId === null
                ? `Unassigned ${result.assigned_count} ${result.assigned_count === 1 ? 'issue' : 'issues'}.`
                : `Assigned ${result.assigned_count} ${result.assigned_count === 1 ? 'issue' : 'issues'} to ${options.issueAssigneeLabel(assigneeId)}.`;
            options.report(description);
            void options.loadProjectIssues(projectId);
        }
        catch (error) {
            options.setActionPending(false);
            if (options.getActiveProjectId() !== projectId) {
                if (options.getActiveProjectId() !== null && options.isIssueViewVisible())
                    options.renderBoard();
                return;
            }
            options.syncAssignControls();
            if (error instanceof ApiFailure && error.status === 401) {
                options.onUnauthorized();
                return;
            }
            options.report(error instanceof Error ? error.message : 'Could not assign the selected issues.', true);
        }
    }
    async function updateSelectedIssuesSharing(isShared) {
        const projectId = options.getProjectId();
        const issueIds = Array.from(options.getSelectedAssignIssueIds());
        if (projectId === null || issueIds.length === 0 || issueIds.length > 500
            || options.isActionPending() || options.isMovePending())
            return;
        options.setActionPending(true);
        options.syncAssignControls();
        try {
            const result = await options.api(`/projects/${projectId}/issues/share`, {
                method: 'POST',
                body: JSON.stringify({ issue_ids: issueIds, is_shared: isShared }),
            });
            if (options.getActiveProjectId() !== projectId) {
                options.setActionPending(false);
                if (options.getActiveProjectId() !== null && options.isIssueViewVisible())
                    options.renderBoard();
                return;
            }
            options.setIssues(options.getIssues().map((issue) => issueIds.includes(issue.id)
                ? { ...issue, is_shared: isShared }
                : issue));
            const selectedIssue = options.getSelectedIssue();
            if (selectedIssue !== null && issueIds.includes(selectedIssue.id)) {
                options.setSelectedIssue({ ...selectedIssue, is_shared: isShared });
                options.renderDetail();
            }
            options.clearAssignSelection();
            options.setActionPending(false);
            options.renderBoard();
            options.focusAssignToggle();
            const count = result.updated_count;
            const description = count === 0
                ? `Selected issues were already ${isShared ? 'shared with guests' : 'internal'}.`
                : isShared
                    ? `Shared ${count} selected ${count === 1 ? 'issue' : 'issues'} with project guests.`
                    : `Made ${count} selected ${count === 1 ? 'issue' : 'issues'} internal.`;
            options.report(description);
            void options.loadProjectIssues(projectId);
        }
        catch (error) {
            options.setActionPending(false);
            if (options.getActiveProjectId() !== projectId) {
                if (options.getActiveProjectId() !== null && options.isIssueViewVisible())
                    options.renderBoard();
                return;
            }
            options.syncAssignControls();
            if (error instanceof ApiFailure && error.status === 401) {
                options.onUnauthorized();
                return;
            }
            options.report(error instanceof Error ? error.message : 'Could not update sharing for selected issues.', true);
        }
    }
    async function moveSelectedIssuesToMilestone() {
        const projectId = options.getProjectId();
        const milestoneId = options.getMoveMilestoneId();
        const issueIds = Array.from(options.getSelectedMoveIssueIds());
        if (projectId === null || milestoneId === null || issueIds.length === 0 || issueIds.length > 500
            || options.isMovePending())
            return;
        options.setMovePending(true);
        options.renderBoard();
        try {
            await options.api(`/projects/${projectId}/issues/move-to-milestone`, {
                method: 'POST',
                body: JSON.stringify({ issue_ids: issueIds, milestone_id: milestoneId }),
            });
            if (options.getActiveProjectId() !== projectId) {
                options.setMovePending(false);
                return;
            }
            const milestone = options.getMilestones().find((candidate) => candidate.id === milestoneId);
            const projectIssues = options.getIssues();
            const nextSortOrder = Math.max(0, ...projectIssues
                .filter((issue) => issue.milestone_id === milestoneId)
                .map((issue) => issue.sort_order)) + 1;
            let sortOrder = nextSortOrder;
            options.setIssues(projectIssues.map((issue) => issueIds.includes(issue.id)
                ? {
                    ...issue,
                    milestone_id: milestoneId,
                    milestone_name: milestone?.name ?? null,
                    milestone_due_date: milestone?.due_date ?? null,
                    sort_order: sortOrder++,
                }
                : issue));
            options.clearMoveSelection();
            options.setMovePending(false);
            options.renderBoard();
            options.focusMilestoneGroup(milestoneId);
            options.report(`Moved ${issueIds.length} ${issueIds.length === 1 ? 'issue' : 'issues'} to ${milestone?.name ?? 'the milestone'}.`);
            void options.loadProjectIssues(projectId);
        }
        catch (error) {
            options.setMovePending(false);
            if (options.getActiveProjectId() !== projectId)
                return;
            options.renderBoard();
            if (error instanceof ApiFailure && error.status === 401) {
                options.onUnauthorized();
                return;
            }
            options.report(error instanceof Error ? error.message : 'Could not move the selected issues.', true);
        }
    }
    return { assignSelectedIssues, updateSelectedIssuesSharing, moveSelectedIssuesToMilestone };
}
