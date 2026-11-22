export function githubRepositorySelectionValue(repository) {
    return JSON.stringify([repository.installation_id, repository.id, repository.owner, repository.name]);
}
export function parseGitHubRepositorySelection(value) {
    let selection;
    try {
        selection = JSON.parse(value);
    }
    catch {
        return null;
    }
    if (!Array.isArray(selection) || selection.length !== 4)
        return null;
    const [installationId, repositoryId, owner, name] = selection;
    if (typeof installationId !== 'number' || !Number.isSafeInteger(installationId) || installationId < 1
        || typeof repositoryId !== 'number' || !Number.isSafeInteger(repositoryId) || repositoryId < 1
        || typeof owner !== 'string' || owner.trim() === ''
        || typeof name !== 'string' || name.trim() === '')
        return null;
    return {
        installation_id: installationId,
        repository_id: repositoryId,
        owner,
        name,
    };
}
