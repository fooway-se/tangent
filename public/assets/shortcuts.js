export function shouldSendChatOnEnter(key, shiftKey, isComposing) {
    return key === 'Enter' && !shiftKey && !isComposing;
}
export function resolveShortcut(event, context) {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && !event.altKey && key === 'k')
        return 'command-palette';
    if (event.key === 'Escape') {
        if (context.modalOpen)
            return 'dismiss';
        if (context.textInputFocused)
            return 'blur-text-input';
        if (context.canDismiss)
            return 'dismiss';
    }
    if (event.altKey || event.ctrlKey || event.metaKey || context.targetIsEditable)
        return null;
    if (context.goPrefixPending) {
        if (key === 'p' && context.hasWorkspace)
            return 'projects';
        if (key === 'w' && context.hasWorkspace)
            return 'workspace-switcher';
        if (key === 'i' && context.hasProject)
            return 'issues';
        if (key === 'c' && context.hasProject)
            return 'chat';
        if (key === 'm' && context.hasProject)
            return 'members';
        if (key === 'a' && context.canAdmin)
            return 'workspace-admin';
        return null;
    }
    if (event.key === '?')
        return 'shortcut-help';
    if (key === 'g' && context.hasWorkspace)
        return 'await-projects-key';
    if (context.chatMessagesFocused && context.hasSelectedChatMessage) {
        if (key === 'j' || key === 'arrowdown')
            return 'next-chat-message';
        if (key === 'k' || key === 'arrowup')
            return 'previous-chat-message';
        if (event.key === 'Enter')
            return 'focus-chat-composer';
        if (key === 'r')
            return 'reply-to-chat-message';
        if (key === 'i')
            return 'issue-from-selected-chat-message';
    }
    if (context.projectListVisible) {
        if (key === 'j' || key === 'arrowdown')
            return 'next-project';
        if (key === 'k' || key === 'arrowup')
            return 'previous-project';
        if (event.key === 'Enter' && context.hasSelectedProject)
            return 'open-selected-project';
    }
    if (context.issueListVisible || context.issueDetailVisible) {
        if (key === 'j' || key === 'arrowdown')
            return 'next';
        if (key === 'k' || key === 'arrowup')
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
