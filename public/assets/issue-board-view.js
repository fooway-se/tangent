import { filterIssues, filterIssuesByMilestoneArchive, groupIssues, groupIssuesByMilestone, projectProgress, sortIssues, } from './issue-board.js';
export function initIssueBoardView(options) {
    function renderMilestoneIssueBoard(visibleIssues) {
        const milestones = options.milestones();
        const hasActiveMilestones = milestones.some((milestone) => milestone.archived_at === null);
        if (!hasActiveMilestones)
            options.clearBulkMoveSelection();
        const visibleUnassignedIssueIds = new Set(visibleIssues
            .filter((issue) => issue.milestone_id === null && !issue.is_ongoing)
            .map((issue) => issue.id));
        const selectedBulkMoveIssueIds = options.getSelectedBulkMoveIssueIds();
        for (const issueId of selectedBulkMoveIssueIds) {
            if (!visibleUnassignedIssueIds.has(issueId))
                selectedBulkMoveIssueIds.delete(issueId);
        }
        options.issueBoardUi.render(groupIssuesByMilestone(visibleIssues, milestones).map((group) => ({
            key: group.isOngoing ? 'milestone:ongoing' : `milestone:${group.milestoneId ?? 'none'}`,
            name: group.dueDate === null ? group.name : `${group.name} · due ${group.dueDate}`,
            className: 'issue-group milestone-issue-group',
            issues: group.issues,
            isOngoing: group.isOngoing,
            allowBulkMove: group.milestoneId === null && group.isOngoing !== true && hasActiveMilestones,
            openByDefault: options.scope() !== 'history',
        })));
    }
    function renderNextUpIssueBoard(visibleIssues, allOpenIssues) {
        const milestones = options.milestones();
        const groups = groupIssuesByMilestone(visibleIssues, milestones).map((group) => {
            const allGroupIssues = allOpenIssues.filter((issue) => group.isOngoing
                ? issue.is_ongoing
                : !issue.is_ongoing && issue.milestone_id === group.milestoneId);
            const reorderByIssueId = new Map();
            for (const issue of group.isOngoing ? [] : group.issues) {
                const index = allGroupIssues.findIndex((candidate) => candidate.id === issue.id);
                reorderByIssueId.set(issue.id, {
                    canMoveEarlier: index > 0,
                    canMoveLater: index >= 0 && index < allGroupIssues.length - 1,
                    showMilestoneTag: false,
                });
            }
            return {
                key: group.isOngoing ? 'milestone:ongoing' : `milestone:${group.milestoneId ?? 'none'}`,
                name: group.dueDate === null ? group.name : `${group.name} · due ${group.dueDate}`,
                className: 'issue-group milestone-issue-group',
                issues: group.issues,
                reorderByIssueId,
                isOngoing: group.isOngoing,
            };
        });
        options.issueBoardUi.render(groups);
    }
    function render() {
        const projectIssues = options.issues();
        const deletedIssues = options.deletedIssues();
        const milestones = options.milestones();
        const scope = options.scope();
        const order = options.order();
        const projectIssueProgress = projectProgress(projectIssues);
        options.issueProgress.max = Math.max(projectIssueProgress.total, 1);
        options.issueProgress.value = projectIssueProgress.done;
        options.issueProgress.classList.toggle('is-complete', projectIssueProgress.complete);
        const progressUnit = projectIssueProgress.ongoing > 0
            ? 'planned issues'
            : projectIssueProgress.cancelled > 0 ? 'non-cancelled issues' : 'issues';
        const progressExtras = [
            projectIssueProgress.ongoing > 0 ? `${projectIssueProgress.ongoing} ongoing` : '',
            projectIssueProgress.cancelled > 0 ? `${projectIssueProgress.cancelled} cancelled` : '',
        ].filter(Boolean);
        options.setTextContentIfChanged(options.issueProgressLabel, `${projectIssueProgress.done} of ${projectIssueProgress.total} ${progressUnit} done${progressExtras.length > 0 ? ` · ${progressExtras.join(' · ')}` : ''}`);
        const boardIssues = filterIssuesByMilestoneArchive(projectIssues, milestones, scope);
        const total = boardIssues.length;
        const completed = boardIssues.filter((issue) => issue.status === 'done').length;
        const cancelled = boardIssues.filter((issue) => issue.status === 'cancelled').length;
        const ongoing = boardIssues.filter((issue) => issue.is_ongoing && issue.status !== 'cancelled').length;
        const open = total - completed - cancelled - ongoing;
        options.setTextContentIfChanged(options.issueCountSummary, scope === 'history'
            ? `${total} ${total === 1 ? 'issue' : 'issues'} in History`
            : [
                `${open} open`,
                `${completed} done`,
                ongoing > 0 ? `${ongoing} ongoing` : '',
                cancelled > 0 ? `${cancelled} cancelled` : '',
            ].filter(Boolean).join(' · '));
        const searchableIssues = boardIssues.map((issue) => ({
            ...issue,
            assignee_name: options.issueAssigneeLabel(issue.assignee_id),
            milestone_name: milestones.find((milestone) => milestone.id === issue.milestone_id)?.name ?? null,
            milestone_due_date: milestones.find((milestone) => milestone.id === issue.milestone_id)?.due_date ?? null,
        }));
        const ordered = sortIssues(searchableIssues, order);
        const nextUpMode = scope === 'active' && order === 'next_up';
        const workQueue = nextUpMode ? ordered.filter((issue) => ['backlog', 'todo', 'doing', 'testing'].includes(issue.status)) : ordered;
        const visible = filterIssues(workQueue, options.filter());
        const visibleBulkAssignIssueIds = new Set(visible.map((issue) => issue.id));
        options.setVisibleBulkAssignIssueIds(visibleBulkAssignIssueIds);
        const selectedBulkAssignIssueIds = options.getSelectedBulkAssignIssueIds();
        for (const issueId of selectedBulkAssignIssueIds) {
            if (!visibleBulkAssignIssueIds.has(issueId))
                selectedBulkAssignIssueIds.delete(issueId);
        }
        options.syncBulkAssignControls();
        options.emptyIssues.hidden = visible.length > 0;
        options.setTextContentIfChanged(options.emptyIssues, nextUpMode && workQueue.length === 0
            ? 'No open issues to work on next.'
            : total === 0
                ? scope === 'history'
                    ? 'No archived milestone issues. Archive a milestone to move its issues into History.'
                    : projectIssues.length > 0
                        ? 'No issues in Current work. View History or create a new issue.'
                        : deletedIssues.length > 0
                            ? 'No active issues. Restore one from Deleted issues or create a new issue.'
                            : 'No issues yet. Create the first one.'
                : 'No issues match that filter.');
        options.setTextContentIfChanged(options.deletedIssueCount, String(deletedIssues.length));
        options.deletedIssuesDetails.hidden = false;
        options.reconcileDeletedIssueRows();
        if (nextUpMode) {
            renderNextUpIssueBoard(visible, workQueue);
            return;
        }
        if (options.grouping() === 'milestone') {
            renderMilestoneIssueBoard(visible);
            return;
        }
        options.issueBoardUi.render(groupIssues(visible).map((group) => ({
            key: `status:${group.status}`,
            name: group.status,
            className: 'issue-group',
            issues: group.issues,
        })));
    }
    return { render };
}
