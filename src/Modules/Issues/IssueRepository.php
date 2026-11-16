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
            "SELECT id, workspace_id, project_id, title, description, status, created_by,
                    source_channel_id, source_message_id, created_at, updated_at
             FROM issues
             WHERE workspace_id = :workspace_id AND project_id = :project_id
             ORDER BY FIELD(status, 'backlog', 'todo', 'doing', 'done'), id DESC"
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
    ): array {
        $statement = $this->pdo->prepare(
            "INSERT INTO issues (
                workspace_id, project_id, title, description, status, created_by, source_channel_id, source_message_id
             ) VALUES (
                :workspace_id, :project_id, :title, :description, 'backlog', :created_by,
                :source_channel_id, :source_message_id
             )"
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'project_id' => $projectId,
            'title' => $title,
            'description' => $description,
            'created_by' => $creatorId,
            'source_channel_id' => $sourceChannelId,
            'source_message_id' => $sourceMessageId,
        ]);

        return $this->find($workspaceId, (int) $this->pdo->lastInsertId()) ?? [];
    }

    /** @return array<string, mixed>|null */
    public function find(int $workspaceId, int $issueId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, workspace_id, project_id, title, description, status, created_by,
                    source_channel_id, source_message_id, created_at, updated_at
             FROM issues WHERE workspace_id = :workspace_id AND id = :id LIMIT 1'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'id' => $issueId]);
        $issue = $statement->fetch(PDO::FETCH_ASSOC);
        return $issue === false ? null : self::normalize($issue);
    }

    /** @param array{title: string, description: string, status: string} $issue */
    public function update(int $workspaceId, int $issueId, array $issue): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE issues
             SET title = :title, description = :description, status = :status
             WHERE workspace_id = :workspace_id AND id = :id'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'id' => $issueId,
            'title' => $issue['title'],
            'description' => $issue['description'],
            'status' => $issue['status'],
        ]);
    }

    /** @param array<string, mixed> $issue @return array<string, mixed> */
    private static function normalize(array $issue): array
    {
        foreach (['id', 'workspace_id', 'project_id', 'created_by'] as $field) {
            $issue[$field] = (int) $issue[$field];
        }
        foreach (['source_channel_id', 'source_message_id'] as $field) {
            $issue[$field] = $issue[$field] === null ? null : (int) $issue[$field];
        }
        return $issue;
    }
}
