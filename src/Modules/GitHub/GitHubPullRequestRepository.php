<?php

declare(strict_types=1);

namespace Tangent\Modules\GitHub;

use PDO;
use PDOException;
use Tangent\Core\ApiException;

final class GitHubPullRequestRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function create(int $workspaceId, int $projectId, int $issueId, ?int $userId, array $repository, array $pullRequest): array
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO issue_pull_requests
                (workspace_id, project_id, issue_id, github_installation_id, github_repository_id,
                 repository_owner, repository_name, repository_full_name, pull_number, title, html_url,
                 state, is_draft, author_login, github_updated_at, linked_by)
             VALUES
                (:workspace_id, :project_id, :issue_id, :github_installation_id, :github_repository_id,
                 :repository_owner, :repository_name, :repository_full_name, :pull_number, :title, :html_url,
                 :state, :is_draft, :author_login, :github_updated_at, :linked_by)'
        );
        try {
            $statement->execute([
                'workspace_id' => $workspaceId,
                'project_id' => $projectId,
                'issue_id' => $issueId,
                'github_installation_id' => $repository['installation_id'],
                'github_repository_id' => $repository['id'],
                'repository_owner' => $repository['owner'],
                'repository_name' => $repository['name'],
                'repository_full_name' => $repository['full_name'],
                'pull_number' => $pullRequest['number'],
                'title' => mb_substr($pullRequest['title'], 0, 500, 'UTF-8'),
                'html_url' => $pullRequest['html_url'],
                'state' => $pullRequest['state'],
                'is_draft' => $pullRequest['is_draft'] ? 1 : 0,
                'author_login' => mb_substr($pullRequest['author_login'], 0, 100, 'UTF-8'),
                'github_updated_at' => $pullRequest['updated_at'],
                'linked_by' => $userId,
            ]);
        } catch (PDOException $exception) {
            if ($exception->getCode() === '23000') {
                throw new ApiException(409, 'github_pull_request_already_linked', 'This pull request is already linked to a Tangent issue.');
            }
            throw $exception;
        }
        return $this->findById($workspaceId, (int) $this->pdo->lastInsertId()) ?? [];
    }

    public function findAutoLinkTarget(int $repositoryId, int $installationId, int $issueId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT p.workspace_id, p.id AS project_id, p.github_installation_id, p.github_repository_id,
                    p.github_repository_owner AS owner, p.github_repository_name AS name,
                    p.github_repository_full_name AS full_name
             FROM github_installations gi
             INNER JOIN projects p ON p.workspace_id = gi.workspace_id
                                  AND p.github_installation_id = gi.installation_id
             INNER JOIN issues i ON i.workspace_id = p.workspace_id AND i.project_id = p.id
             WHERE gi.installation_id = :installation_id
               AND p.github_repository_id = :repository_id
               AND i.id = :issue_id AND i.deleted_at IS NULL
             LIMIT 1'
        );
        $statement->execute([
            'installation_id' => $installationId,
            'repository_id' => $repositoryId,
            'issue_id' => $issueId,
        ]);
        $target = $statement->fetch(PDO::FETCH_ASSOC);
        if ($target === false) return null;
        foreach (['workspace_id', 'project_id', 'github_installation_id', 'github_repository_id'] as $field) {
            $target[$field] = (int) $target[$field];
        }
        return $target;
    }

    public function createAutomatically(int $workspaceId, int $projectId, int $issueId, array $repository, array $pullRequest): void
    {
        try {
            $this->create($workspaceId, $projectId, $issueId, null, $repository, $pullRequest);
        } catch (ApiException $exception) {
            if ($exception->apiCode !== 'github_pull_request_already_linked') throw $exception;
            $statement = $this->pdo->prepare(
                'SELECT 1 FROM issue_pull_requests
                 WHERE workspace_id = :workspace_id AND github_repository_id = :repository_id AND pull_number = :pull_number
                 LIMIT 1'
            );
            $statement->execute([
                'workspace_id' => $workspaceId,
                'repository_id' => $repository['id'],
                'pull_number' => $pullRequest['number'],
            ]);
            if ($statement->fetchColumn() === false) throw $exception;
        }
    }

    public function listForIssue(int $workspaceId, int $issueId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, github_repository_id, repository_full_name, pull_number, title, html_url,
                    state, is_draft, author_login, github_updated_at, linked_at
             FROM issue_pull_requests
             WHERE workspace_id = :workspace_id AND issue_id = :issue_id
             ORDER BY linked_at, id'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'issue_id' => $issueId]);
        return array_map(self::normalize(...), $statement->fetchAll(PDO::FETCH_ASSOC));
    }

    public function findForWebhook(int $repositoryId, int $pullNumber, int $installationId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT pr.*, p.github_repository_id AS connected_repository_id,
                    p.github_installation_id AS connected_installation_id
             FROM issue_pull_requests pr
             INNER JOIN projects p ON p.workspace_id = pr.workspace_id AND p.id = pr.project_id
             WHERE pr.github_repository_id = :repository_id AND pr.pull_number = :pull_number
               AND pr.github_installation_id = :installation_id
               AND p.github_repository_id = pr.github_repository_id
               AND p.github_installation_id = pr.github_installation_id
             LIMIT 1'
        );
        $statement->execute([
            'repository_id' => $repositoryId,
            'pull_number' => $pullNumber,
            'installation_id' => $installationId,
        ]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);
        if ($row === false) return null;
        $row = self::normalize($row);
        $row['workspace_id'] = (int) $row['workspace_id'];
        $row['project_id'] = (int) $row['project_id'];
        $row['issue_id'] = (int) $row['issue_id'];
        $row['github_installation_id'] = (int) $row['github_installation_id'];
        $row['connected_repository_id'] = $row['connected_repository_id'] === null ? null : (int) $row['connected_repository_id'];
        $row['connected_installation_id'] = $row['connected_installation_id'] === null ? null : (int) $row['connected_installation_id'];
        $row['github_updated_at'] = (string) $row['github_updated_at'];
        return $row;
    }

    public function updateFromWebhook(int $id, array $pullRequest): bool
    {
        $statement = $this->pdo->prepare(
            'UPDATE issue_pull_requests
             SET title = :title, html_url = :html_url, state = :state, is_draft = :is_draft,
                 author_login = :author_login, github_updated_at = :github_updated_at
             WHERE id = :id AND github_updated_at <= :github_updated_at_compare'
        );
        $statement->execute([
            'id' => $id,
            'title' => mb_substr($pullRequest['title'], 0, 500, 'UTF-8'),
            'html_url' => $pullRequest['html_url'],
            'state' => $pullRequest['state'],
            'is_draft' => $pullRequest['is_draft'] ? 1 : 0,
            'author_login' => mb_substr($pullRequest['author_login'], 0, 100, 'UTF-8'),
            'github_updated_at' => $pullRequest['updated_at'],
            'github_updated_at_compare' => $pullRequest['updated_at'],
        ]);

        if ($statement->rowCount() === 1) {
            return true;
        }

        $current = $this->pdo->prepare(
            'SELECT github_updated_at FROM issue_pull_requests WHERE id = :id FOR UPDATE',
        );
        $current->execute(['id' => $id]);
        $currentTimestamp = $current->fetchColumn();

        return $currentTimestamp !== false
            && strtotime((string) $currentTimestamp) <= strtotime((string) $pullRequest['updated_at']);
    }

    public function recordDelivery(string $deliveryId, string $eventType): bool
    {
        $cleanup = $this->pdo->prepare(
            'DELETE FROM github_webhook_deliveries
             WHERE received_at < CURRENT_TIMESTAMP - INTERVAL 30 DAY
             ORDER BY received_at LIMIT 1000'
        );
        $cleanup->execute();

        $statement = $this->pdo->prepare(
            'INSERT IGNORE INTO github_webhook_deliveries (delivery_id, event_type) VALUES (:delivery_id, :event_type)'
        );
        $statement->execute(['delivery_id' => $deliveryId, 'event_type' => $eventType]);
        return $statement->rowCount() === 1;
    }

    public function delete(int $workspaceId, int $issueId, int $id): bool
    {
        $statement = $this->pdo->prepare(
            'DELETE FROM issue_pull_requests WHERE workspace_id = :workspace_id AND issue_id = :issue_id AND id = :id'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'issue_id' => $issueId, 'id' => $id]);
        return $statement->rowCount() === 1;
    }

    private function findById(int $workspaceId, int $id): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, github_repository_id, repository_full_name, pull_number, title, html_url,
                    state, is_draft, author_login, github_updated_at, linked_at
             FROM issue_pull_requests WHERE workspace_id = :workspace_id AND id = :id LIMIT 1'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'id' => $id]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);
        return $row === false ? null : self::normalize($row);
    }

    private static function normalize(array $pullRequest): array
    {
        $pullRequest['id'] = (int) $pullRequest['id'];
        $pullRequest['github_repository_id'] = (int) $pullRequest['github_repository_id'];
        $pullRequest['pull_number'] = (int) $pullRequest['pull_number'];
        $pullRequest['is_draft'] = (bool) $pullRequest['is_draft'];
        return $pullRequest;
    }
}
