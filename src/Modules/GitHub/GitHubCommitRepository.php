<?php

declare(strict_types=1);

namespace Tangent\Modules\GitHub;

use PDO;

final class GitHubCommitRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function listForIssue(int $workspaceId, int $issueId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, repository_full_name, sha, message, html_url, author_login, committed_at
             FROM issue_commits
             WHERE workspace_id = :workspace_id AND issue_id = :issue_id
             ORDER BY committed_at DESC, id DESC
             LIMIT 50'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'issue_id' => $issueId]);
        return array_map(static function (array $commit): array {
            $commit['id'] = (int) $commit['id'];
            return $commit;
        }, $statement->fetchAll(PDO::FETCH_ASSOC));
    }

    public function findTargetForPush(int $repositoryId, int $installationId, int $issueId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT p.workspace_id, p.id AS project_id, i.id AS issue_id,
                    p.github_repository_id, p.github_repository_full_name
             FROM projects p
             INNER JOIN issues i ON i.workspace_id = p.workspace_id AND i.project_id = p.id
             WHERE p.github_repository_id = :repository_id
               AND p.github_installation_id = :installation_id
               AND i.id = :issue_id AND i.deleted_at IS NULL
             LIMIT 1'
        );
        $statement->execute([
            'repository_id' => $repositoryId,
            'installation_id' => $installationId,
            'issue_id' => $issueId,
        ]);
        $target = $statement->fetch(PDO::FETCH_ASSOC);
        if ($target === false) return null;
        foreach (['workspace_id', 'project_id', 'issue_id', 'github_repository_id'] as $field) {
            $target[$field] = (int) $target[$field];
        }
        return $target;
    }

    public function record(
        int $workspaceId,
        int $projectId,
        int $issueId,
        int $repositoryId,
        string $repositoryFullName,
        array $commit,
    ): bool
    {
        $statement = $this->pdo->prepare(
            'INSERT IGNORE INTO issue_commits
                (workspace_id, project_id, issue_id, github_repository_id, repository_full_name, sha, message, html_url, author_login, committed_at)
             VALUES
                (:workspace_id, :project_id, :issue_id, :repository_id, :repository_full_name, :sha, :message, :html_url, :author_login, :committed_at)'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'project_id' => $projectId,
            'issue_id' => $issueId,
            'repository_id' => $repositoryId,
            'repository_full_name' => $repositoryFullName,
            'sha' => $commit['sha'],
            'message' => mb_substr($commit['message'], 0, 500, 'UTF-8'),
            'html_url' => $commit['html_url'],
            'author_login' => mb_substr($commit['author_login'], 0, 100, 'UTF-8'),
            'committed_at' => $commit['committed_at'],
        ]);
        return $statement->rowCount() === 1;
    }
}
