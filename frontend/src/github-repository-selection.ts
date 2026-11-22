export interface GitHubRepositorySelection {
  installation_id: number;
  repository_id: number;
  owner: string;
  name: string;
}

export function githubRepositorySelectionValue(repository: {
  installation_id: number;
  id: number;
  owner: string;
  name: string;
}): string {
  return JSON.stringify([repository.installation_id, repository.id, repository.owner, repository.name]);
}

export function parseGitHubRepositorySelection(value: string): GitHubRepositorySelection | null {
  let selection: unknown;
  try {
    selection = JSON.parse(value);
  } catch {
    return null;
  }
  if (!Array.isArray(selection) || selection.length !== 4) return null;
  const [installationId, repositoryId, owner, name] = selection as unknown[];
  if (typeof installationId !== 'number' || !Number.isSafeInteger(installationId) || installationId < 1
    || typeof repositoryId !== 'number' || !Number.isSafeInteger(repositoryId) || repositoryId < 1
    || typeof owner !== 'string' || owner.trim() === ''
    || typeof name !== 'string' || name.trim() === '') return null;
  return {
    installation_id: installationId,
    repository_id: repositoryId,
    owner,
    name,
  };
}
