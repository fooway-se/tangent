<?php

declare(strict_types=1);

namespace Tangent\Modules\Projects;

use PDO;

final class MilestoneRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function list(int $workspaceId, int $projectId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, workspace_id, project_id, name, due_date, created_at FROM milestones
             WHERE workspace_id = :workspace_id AND project_id = :project_id
             ORDER BY due_date IS NULL, due_date, name, id'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'project_id' => $projectId]);
        return array_map(self::normalize(...), $statement->fetchAll(PDO::FETCH_ASSOC));
    }

    public function find(int $workspaceId, int $projectId, int $milestoneId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, workspace_id, project_id, name, due_date, created_at FROM milestones
             WHERE workspace_id = :workspace_id AND project_id = :project_id AND id = :id LIMIT 1'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'project_id' => $projectId, 'id' => $milestoneId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);
        return $row === false ? null : self::normalize($row);
    }

    public function create(int $workspaceId, int $projectId, string $name, ?string $dueDate): array
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO milestones (workspace_id, project_id, name, due_date)
             VALUES (:workspace_id, :project_id, :name, :due_date)'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'project_id' => $projectId, 'name' => $name, 'due_date' => $dueDate]);
        return $this->find($workspaceId, $projectId, (int) $this->pdo->lastInsertId()) ?? [];
    }

    public function update(int $workspaceId, int $projectId, int $milestoneId, string $name, ?string $dueDate): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE milestones SET name = :name, due_date = :due_date
             WHERE workspace_id = :workspace_id AND project_id = :project_id AND id = :id'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'project_id' => $projectId,
            'id' => $milestoneId,
            'name' => $name,
            'due_date' => $dueDate,
        ]);
    }

    public function delete(int $workspaceId, int $projectId, int $milestoneId): void
    {
        $statement = $this->pdo->prepare(
            'DELETE FROM milestones WHERE workspace_id = :workspace_id AND project_id = :project_id AND id = :id'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'project_id' => $projectId, 'id' => $milestoneId]);
    }

    private static function normalize(array $row): array
    {
        foreach (['id', 'workspace_id', 'project_id'] as $field) $row[$field] = (int) $row[$field];
        return $row;
    }
}
