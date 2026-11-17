<?php

declare(strict_types=1);

namespace Tangent\Modules\Issues;

use PDO;

final class IssueRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return list<array<string, mixed>> */
    public function listForProject(int $workspaceId, int $projectId): array
    {
        $statement = $this->pdo->prepare(
            "SELECT id, workspace_id, project_id, title, description, issue_type AS type, assignee_id, status, created_by,
                    source_channel_id, source_message_id, created_at, updated_at, deleted_at
             FROM issues
             WHERE workspace_id = :workspace_id AND project_id = :project_id AND deleted_at IS NULL
             ORDER BY FIELD(status, 'backlog', 'todo', 'doing', 'done', 'cancelled'), id DESC"
        );
        $statement->execute(['workspace_id' => $workspaceId, 'project_id' => $projectId]);
        return array_map(self::normalize(...), $statement->fetchAll(PDO::FETCH_ASSOC));
    }

    /** @param list<int> $projectIds @return list<array<string, mixed>> */
    public function listOpenAssignedToUser(int $workspaceId, int $userId, array $projectIds): array
    {
        if ($projectIds === []) {
            return [];
        }

        $projectPlaceholders = [];
        $parameters = ['workspace_id' => $workspaceId, 'assignee_id' => $userId];
        foreach (array_values($projectIds) as $index => $projectId) {
            $placeholder = 'project_' . $index;
            $projectPlaceholders[] = ':' . $placeholder;
            $parameters[$placeholder] = $projectId;
        }

        $statement = $this->pdo->prepare(
            "SELECT id, workspace_id, project_id, title, description, issue_type AS type, assignee_id, status, created_by,
                    source_channel_id, source_message_id, created_at, updated_at, deleted_at
             FROM issues
             WHERE workspace_id = :workspace_id AND assignee_id = :assignee_id AND deleted_at IS NULL
               AND status IN ('backlog', 'todo', 'doing')
               AND project_id IN (" . implode(', ', $projectPlaceholders) . ")
             ORDER BY updated_at DESC, id DESC"
        );
        $statement->execute($parameters);
        return array_map(self::normalize(...), $statement->fetchAll(PDO::FETCH_ASSOC));
    }

    /** @return list<array<string, mixed>> */
    public function listDeletedForProject(int $workspaceId, int $projectId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, workspace_id, project_id, title, description, issue_type AS type, assignee_id, status, created_by,
                    source_channel_id, source_message_id, created_at, updated_at, deleted_at
             FROM issues
             WHERE workspace_id = :workspace_id AND project_id = :project_id AND deleted_at IS NOT NULL
             ORDER BY deleted_at DESC, id DESC'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'project_id' => $projectId]);
        return array_map(self::normalize(...), $statement->fetchAll(PDO::FETCH_ASSOC));
    }

    /** @return array<string, mixed> */
    public function create(
        int $workspaceId,
        int $projectId,
        string $title,
        string $description,
        int $creatorId,
        ?int $sourceChannelId = null,
        ?int $sourceMessageId = null,
        string $type = 'task',
        ?int $assigneeId = null,
    ): array {
        $statement = $this->pdo->prepare(
            "INSERT INTO issues (
                workspace_id, project_id, title, description, issue_type, status, created_by, assignee_id,
                source_channel_id, source_message_id
             ) VALUES (
                :workspace_id, :project_id, :title, :description, :type, 'backlog', :created_by, :assignee_id,
                :source_channel_id, :source_message_id
             )"
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'project_id' => $projectId,
            'title' => $title,
            'description' => $description,
            'type' => $type,
            'created_by' => $creatorId,
            'assignee_id' => $assigneeId,
            'source_channel_id' => $sourceChannelId,
            'source_message_id' => $sourceMessageId,
        ]);

        return $this->find($workspaceId, (int) $this->pdo->lastInsertId()) ?? [];
    }

    /** @return array<string, mixed>|null */
    public function find(int $workspaceId, int $issueId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, workspace_id, project_id, title, description, issue_type AS type, assignee_id, status, created_by,
                    source_channel_id, source_message_id, created_at, updated_at, deleted_at
             FROM issues WHERE workspace_id = :workspace_id AND id = :id AND deleted_at IS NULL LIMIT 1'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'id' => $issueId]);
        $issue = $statement->fetch(PDO::FETCH_ASSOC);
        return $issue === false ? null : self::normalize($issue);
    }

    /** @return array<string, mixed>|null */
    public function findDeleted(int $workspaceId, int $issueId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, workspace_id, project_id, title, description, issue_type AS type, assignee_id, status, created_by,
                    source_channel_id, source_message_id, created_at, updated_at, deleted_at
             FROM issues WHERE workspace_id = :workspace_id AND id = :id AND deleted_at IS NOT NULL LIMIT 1'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'id' => $issueId]);
        $issue = $statement->fetch(PDO::FETCH_ASSOC);
        return $issue === false ? null : self::normalize($issue);
    }

    /** @param array{title: string, description: string, status: string, type: string, assignee_id: ?int} $issue */
    public function update(int $workspaceId, int $issueId, array $issue): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE issues
             SET title = :title, description = :description, issue_type = :type, assignee_id = :assignee_id, status = :status
             WHERE workspace_id = :workspace_id AND id = :id AND deleted_at IS NULL'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'id' => $issueId,
            'title' => $issue['title'],
            'description' => $issue['description'],
            'type' => $issue['type'],
            'assignee_id' => $issue['assignee_id'],
            'status' => $issue['status'],
        ]);
    }

    public function softDelete(int $workspaceId, int $issueId): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE issues SET deleted_at = CURRENT_TIMESTAMP
             WHERE workspace_id = :workspace_id AND id = :id AND deleted_at IS NULL'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'id' => $issueId]);
    }

    public function restore(int $workspaceId, int $issueId): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE issues SET deleted_at = NULL
             WHERE workspace_id = :workspace_id AND id = :id AND deleted_at IS NOT NULL'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'id' => $issueId]);
    }

    public function unassignMember(int $workspaceId, int $projectId, int $userId): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE issues SET assignee_id = NULL
             WHERE workspace_id = :workspace_id AND project_id = :project_id AND assignee_id = :user_id'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'project_id' => $projectId,
            'user_id' => $userId,
        ]);
    }

    /** @param array<string, mixed> $issue @return array<string, mixed> */
    private static function normalize(array $issue): array
    {
        foreach (['id', 'workspace_id', 'project_id', 'created_by'] as $field) {
            $issue[$field] = (int) $issue[$field];
        }
        $issue['assignee_id'] = $issue['assignee_id'] === null ? null : (int) $issue['assignee_id'];
        foreach (['source_channel_id', 'source_message_id'] as $field) {
            $issue[$field] = $issue[$field] === null ? null : (int) $issue[$field];
        }
        return $issue;
    }
}
