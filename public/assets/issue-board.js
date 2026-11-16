const statusOrder = ['doing', 'todo', 'backlog', 'done'];
export function filterIssues(issues, query) {
    const normalized = query.trim().toLocaleLowerCase();
    if (normalized === '')
        return [...issues];
    return issues.filter((issue) => `#${issue.id} ${issue.title} ${issue.description} ${issue.status}`
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
        if (order === 'title')
            return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
        if (order === 'oldest')
            return dateValue(a.created_at) - dateValue(b.created_at);
        if (order === 'newest')
            return dateValue(b.created_at) - dateValue(a.created_at);
        return dateValue(b.updated_at) - dateValue(a.updated_at);
    });
}
function dateValue(value) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
}
