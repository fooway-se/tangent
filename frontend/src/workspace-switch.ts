export interface WorkspaceSwitchUser {
  role: string;
  workspace_id: number;
}

export interface WorkspaceSwitchResult<User, Workspace> {
  user: User;
  workspace: Workspace;
}

export async function switchWorkspaceMembership<
  User extends WorkspaceSwitchUser,
  Workspace,
>(
  activeUser: User | null,
  workspaceId: number,
  request: (workspaceId: number) => Promise<WorkspaceSwitchResult<User, Workspace>>,
  onSessionChanged: (user: User) => void,
  loadWorkspaces: () => Promise<void>,
  loadProjects: () => Promise<void>,
): Promise<WorkspaceSwitchResult<User, Workspace> | null> {
  if (activeUser === null || workspaceId === activeUser.workspace_id) return null;

  const result = await request(workspaceId);
  onSessionChanged(result.user);
  await loadWorkspaces();
  if (result.user.role !== 'guest') await loadProjects();
  return result;
}
