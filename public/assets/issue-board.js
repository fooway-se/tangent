export function discussionIndicatorLabel(count) {
    if (!Number.isSafeInteger(count) || count < 1)
        return null;
    return `${count} discussion ${count === 1 ? 'message' : 'messages'}`;
}
const statusOrder = ['doing', 'testing', 'todo', 'backlog', 'done', 'cancelled'];
export function milestoneProgress(issues) {
    const plannedIssues = issues.filter((issue) => issue.is_ongoing !== true);
    const cancelled = plannedIssues.filter((issue) => issue.status === 'cancelled').length;
    const active = plannedIssues.length - cancelled;
    const done = plannedIssues.filter((issue) => issue.status === 'done').length;
    return { done, active, cancelled, complete: active > 0 && done === active };
}
export function projectProgress(issues) {
    const ongoing = issues.filter((issue) => issue.is_ongoing === true && issue.status !== 'cancelled').length;
    const cancelled = issues.filter((issue) => issue.status === 'cancelled').length;
    const plannedIssues = issues.filter((issue) => issue.is_ongoing !== true && issue.status !== 'cancelled');
    const done = plannedIssues.filter((issue) => issue.status === 'done').length;
    const total = plannedIssues.length;
    return { done, total, ongoing, cancelled, complete: total > 0 && done === total };
}
export function filterIssues(issues, query) {
    const normalized = query.trim().toLocaleLowerCase();
    if (normalized === '')
        return [...issues];
    return issues.filter((issue) => `#${issue.id} ${issue.title} ${issue.description} ${issue.status} ${issue.type ?? ''} ${issue.priority ?? ''} ${issue.due_date ?? ''} ${issue.assignee_name ?? ''} ${issue.milestone_name ?? ''} ${issue.is_ongoing ? 'ongoing' : ''}`
        .toLocaleLowerCase()
        .includes(normalized));
}
export function filterIssuesByMilestoneArchive(issues, milestones, scope) {
    const archivedMilestoneIds = new Set(milestones.filter((milestone) => milestone.archived_at != null).map((milestone) => milestone.id));
    const includeArchived = scope === 'history';
    return issues.filter((issue) => {
        const isArchived = issue.milestone_id != null && archivedMilestoneIds.has(issue.milestone_id);
        return isArchived === includeArchived;
    });
}
export function groupIssues(issues) {
    return statusOrder.flatMap((status) => {
        const matches = issues.filter((issue) => issue.status === status);
        return matches.length > 0 ? [{ status, issues: matches }] : [];
    });
}
export function groupIssuesByMilestone(issues, milestones) {
    const issuesByMilestone = new Map();
    for (const issue of issues) {
        if (issue.is_ongoing === true)
            continue;
        const milestoneId = issue.milestone_id ?? null;
        const matches = issuesByMilestone.get(milestoneId) ?? [];
        matches.push(issue);
        issuesByMilestone.set(milestoneId, matches);
    }
    const milestoneById = new Map(milestones.map((milestone) => [milestone.id, milestone]));
    const groups = [...issuesByMilestone.entries()]
        .filter(([milestoneId]) => milestoneId !== null)
        .map(([milestoneId, groupedIssues]) => {
        const firstIssue = groupedIssues[0];
        const milestone = milestoneById.get(milestoneId);
        return {
            milestoneId,
            name: milestone?.name ?? firstIssue.milestone_name ?? `Milestone ${milestoneId}`,
            dueDate: milestone?.due_date ?? firstIssue.milestone_due_date ?? null,
            issues: groupedIssues,
        };
    })
        .sort((a, b) => {
        if (a.dueDate === null && b.dueDate !== null)
            return 1;
        if (a.dueDate !== null && b.dueDate === null)
            return -1;
        return (a.dueDate ?? '').localeCompare(b.dueDate ?? '')
            || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
    const unassigned = issuesByMilestone.get(null);
    const ongoing = issues.filter((issue) => issue.is_ongoing === true);
    if (ongoing.length > 0)
        groups.push({
            milestoneId: null,
            name: 'Ongoing',
            dueDate: null,
            issues: ongoing,
            isOngoing: true,
        });
    if (unassigned !== undefined)
        groups.push({ milestoneId: null, name: 'No milestone', dueDate: null, issues: unassigned });
    return groups;
}
export function sortIssues(issues, order) {
    return [...issues].sort((a, b) => {
        if (order === 'next_up')
            return compareNextUp(a, b);
        if (order === 'title')
            return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
        if (order === 'priority')
            return priorityRank(a.priority) - priorityRank(b.priority)
                || dateValue(b.updated_at) - dateValue(a.updated_at);
        if (order === 'oldest')
            return dateValue(a.created_at) - dateValue(b.created_at);
        if (order === 'newest')
            return dateValue(b.created_at) - dateValue(a.created_at);
        return dateValue(b.updated_at) - dateValue(a.updated_at);
    });
}
function priorityRank(priority) {
    switch (priority) {
        case 'urgent': return 0;
        case 'high': return 1;
        case 'medium': return 2;
        case 'low': return 3;
        default: return 4;
    }
}
function compareNextUp(a, b) {
    const aDueDate = a.due_date ?? a.milestone_due_date ?? null;
    const bDueDate = b.due_date ?? b.milestone_due_date ?? null;
    if (aDueDate === null && bDueDate !== null)
        return 1;
    if (aDueDate !== null && bDueDate === null)
        return -1;
    if (aDueDate !== null && bDueDate !== null && aDueDate !== bDueDate)
        return aDueDate.localeCompare(bDueDate);
    const aHasMilestone = a.milestone_id !== null && a.milestone_id !== undefined;
    const bHasMilestone = b.milestone_id !== null && b.milestone_id !== undefined;
    if (aHasMilestone !== bHasMilestone)
        return aHasMilestone ? -1 : 1;
    if (aHasMilestone && bHasMilestone) {
        if (a.milestone_id !== b.milestone_id)
            return (a.milestone_id ?? 0) - (b.milestone_id ?? 0);
    }
    return (a.sort_order ?? a.id) - (b.sort_order ?? b.id) || a.id - b.id;
}
function dateValue(value) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
}
