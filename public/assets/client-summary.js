function formatDate(value) {
    if (value === null)
        return '';
    const dateValue = value.length === 10 ? value + 'T00:00:00Z' : value;
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime()))
        return value;
    return new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(date);
}
function projectStatusLabel(status) {
    return status.charAt(0).toLocaleUpperCase() + status.slice(1);
}
export function generateClientSummary(view, activity, from, to) {
    const lines = [
        'Project summary: ' + view.project.name,
        'Period: ' + formatDate(from) + ' – ' + formatDate(to),
        '',
        'Project status: ' + projectStatusLabel(view.project.status),
        view.progress.total === 0
            ? 'Progress: No shared items yet.'
            : 'Progress: ' + view.progress.done + ' of ' + view.progress.total + ' shared items complete (' + view.progress.percent + '%).',
    ];
    if (view.next_milestone !== null) {
        const milestone = view.milestones.find((item) => item.name === view.next_milestone?.name);
        const milestoneProgress = milestone === undefined ? '' : ', ' + milestone.done + ' of ' + milestone.total + ' complete';
        const dueDate = view.next_milestone.due_date === null
            ? ''
            : ', due ' + formatDate(view.next_milestone.due_date);
        lines.push('Next milestone: ' + view.next_milestone.name + milestoneProgress + dueDate + '.');
    }
    lines.push('', 'Client-visible updates:');
    const visibleUpdates = activity.updates.slice(0, 5);
    if (activity.total_count === 0 || visibleUpdates.length === 0) {
        lines.push('No client-visible issue status changes in this period.');
    }
    else {
        for (const update of visibleUpdates) {
            lines.push('- ' + formatDate(update.created_at) + ': ' + update.text);
        }
        const totalCount = Math.max(activity.total_count, visibleUpdates.length);
        const remaining = totalCount - visibleUpdates.length;
        if (remaining > 0)
            lines.push('- ' + remaining + ' more client-visible updates in this period.');
    }
    if (view.approvals.length > 0) {
        lines.push('', 'Awaiting client input:');
        for (const approval of view.approvals) {
            lines.push('- Approval requested: ' + approval.title);
        }
    }
    return lines.join('\n');
}
