export function parseEmailNotificationLink(url) {
    const hasTarget = url.searchParams.has('workspace_id')
        || url.searchParams.has('project_id')
        || url.searchParams.has('issue_id')
        || url.searchParams.has('conversation_id')
        || url.searchParams.has('admin');
    if (!hasTarget)
        return null;
    const workspaceId = positiveId(url.searchParams.get('workspace_id'));
    if (workspaceId === null)
        return null;
    const projectId = optionalPositiveId(url.searchParams, 'project_id');
    const issueId = optionalPositiveId(url.searchParams, 'issue_id');
    const conversationId = optionalPositiveId(url.searchParams, 'conversation_id');
    const adminNotifications = url.searchParams.get('admin') === 'notifications';
    if (url.searchParams.has('admin')) {
        return adminNotifications && !url.searchParams.has('project_id')
            && !url.searchParams.has('issue_id') && !url.searchParams.has('conversation_id')
            ? { workspaceId, projectId: null, issueId: null, conversationId: null, adminNotifications: true }
            : null;
    }
    if (projectId === null || (issueId === null) === (conversationId === null))
        return null;
    if ((issueId !== null && url.searchParams.has('conversation_id'))
        || (conversationId !== null && url.searchParams.has('issue_id')))
        return null;
    return { workspaceId, projectId, issueId, conversationId, adminNotifications: false };
}
function optionalPositiveId(parameters, key) {
    if (!parameters.has(key))
        return null;
    return positiveId(parameters.get(key));
}
function positiveId(value) {
    if (value === null || !/^[1-9]\d*$/.test(value))
        return null;
    const id = Number(value);
    return Number.isSafeInteger(id) ? id : null;
}
