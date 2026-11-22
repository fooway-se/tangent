export function githubRepositorySelectionValue(repository) {
    return `${repository.installation_id}:${repository.id}`;
}
export function parseGitHubRepositorySelection(value) {
    const match = /^([1-9]\d*):([1-9]\d*)$/.exec(value);
    if (match === null)
        return null;
    const installationId = Number(match[1]);
    const repositoryId = Number(match[2]);
    if (!Number.isSafeInteger(installationId) || !Number.isSafeInteger(repositoryId))
        return null;
    return { installation_id: installationId, repository_id: repositoryId };
}
