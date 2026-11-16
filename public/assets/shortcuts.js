export function resolveShortcut(event, context) {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && !event.altKey && key === 'k')
        return 'command-palette';
    if (event.key === 'Escape' && context.canDismiss)
        return 'dismiss';
    if (event.altKey || event.ctrlKey || event.metaKey || context.targetIsEditable)
        return null;
    if (context.goPrefixPending) {
        return key === 'p' && context.hasWorkspace ? 'projects' : null;
    }
    if (event.key === '?')
        return 'shortcut-help';
    if (key === 'g' && context.hasWorkspace)
        return 'await-projects-key';
    if (context.projectListVisible) {
        if (key === 'j')
            return 'next-project';
        if (key === 'k')
            return 'previous-project';
        if (event.key === 'Enter' && context.hasSelectedProject)
            return 'open-selected-project';
    }
    if (context.issueListVisible || context.issueDetailVisible) {
        if (key === 'j')
            return 'next';
        if (key === 'k')
            return 'previous';
        if (event.key === 'Enter' && context.issueListVisible && context.hasSelectedIssue)
            return 'open-selected';
    }
    if (key === 'c' && context.hasProject)
        return 'create-issue';
    if (key === 'e' && context.hasSelectedIssue)
        return 'edit-selected';
    if (key === 's' && context.hasSelectedIssue)
        return 'focus-status';
    if (key === 'i' && context.hasLatestChatMessage)
        return 'issue-from-latest-message';
    return null;
}
