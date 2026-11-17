const statusOrder = ['doing', 'todo', 'backlog', 'done', 'cancelled'];
export function milestoneProgress(issues) {
    const cancelled = issues.filter((issue) => issue.status === 'cancelled').length;
    const active = issues.length - cancelled;
    const done = issues.filter((issue) => issue.status === 'done').length;
    return { done, active, cancelled, complete: active > 0 && done === active };
}
export function filterIssues(issues, query) {
    const normalized = query.trim().toLocaleLowerCase();
    if (normalized === '')
        return [...issues];
    return issues.filter((issue) => `#${issue.id} ${issue.title} ${issue.description} ${issue.status} ${issue.type ?? ''} ${issue.assignee_name ?? ''} ${issue.milestone_name ?? ''}`
        .toLocaleLowerCase()
        .includes(normalized));
}
export function groupIssues(issues) {
    return statusOrder.flatMap((status) => {
        const matches = issues.filter((issue) => issue.status === status);
        return matches.length > 0 ? [{ status, issues: matches }] : [];
    });
}
export function sortIssues(issues, order) {
    return [...issues].sort((a, b) => {
        if (order === 'next_up')
            return compareNextUp(a, b);
        if (order === 'title')
            return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
        if (order === 'oldest')
            return dateValue(a.created_at) - dateValue(b.created_at);
        if (order === 'newest')
            return dateValue(b.created_at) - dateValue(a.created_at);
        return dateValue(b.updated_at) - dateValue(a.updated_at);
    });
}
function compareNextUp(a, b) {
    const aHasMilestone = a.milestone_id !== null && a.milestone_id !== undefined;
    const bHasMilestone = b.milestone_id !== null && b.milestone_id !== undefined;
    if (aHasMilestone !== bHasMilestone)
        return aHasMilestone ? -1 : 1;
    if (aHasMilestone && bHasMilestone) {
        const aDue = a.milestone_due_date ?? '9999-12-31';
        const bDue = b.milestone_due_date ?? '9999-12-31';
        if (aDue !== bDue)
            return aDue.localeCompare(bDue);
        if (a.milestone_id !== b.milestone_id)
            return (a.milestone_id ?? 0) - (b.milestone_id ?? 0);
    }
    return (a.sort_order ?? a.id) - (b.sort_order ?? b.id) || a.id - b.id;
}
function dateValue(value) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
}
