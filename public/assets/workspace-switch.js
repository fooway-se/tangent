export async function switchWorkspaceMembership(activeUser, workspaceId, request, onSessionChanged, loadWorkspaces, loadProjects) {
    if (activeUser === null || workspaceId === activeUser.workspace_id)
        return null;
    const result = await request(workspaceId);
    onSessionChanged(result.user);
    await loadWorkspaces();
    if (result.user.role !== 'guest')
        await loadProjects();
    return result;
}
