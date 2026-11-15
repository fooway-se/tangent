<?php

declare(strict_types=1);

namespace Tangent\Modules\Projects;

use PDO;
use PDOException;
use Tangent\Core\ApiException;

final class ProjectRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return list<array<string, mixed>> */
    public function listForWorkspace(int $workspaceId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, workspace_id, name, slug, description, status, created_by, created_at, updated_at
             FROM projects
             WHERE workspace_id = :workspace_id
             ORDER BY name, id'
        );
        $statement->execute(['workspace_id' => $workspaceId]);
        return array_map(self::normalize(...), $statement->fetchAll(PDO::FETCH_ASSOC));
    }

    /** @return array<string, mixed>|null */
    public function find(int $workspaceId, int $projectId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, workspace_id, name, slug, description, status, created_by, created_at, updated_at
             FROM projects
             WHERE workspace_id = :workspace_id AND id = :id
             LIMIT 1'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'id' => $projectId]);
        $project = $statement->fetch(PDO::FETCH_ASSOC);
        return $project === false ? null : self::normalize($project);
    }

    public function isMember(int $workspaceId, int $projectId, int $userId): bool
    {
        $statement = $this->pdo->prepare(
            'SELECT 1 FROM project_memberships
             WHERE workspace_id = :workspace_id AND project_id = :project_id AND user_id = :user_id
             LIMIT 1'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'project_id' => $projectId,
            'user_id' => $userId,
        ]);
        return $statement->fetchColumn() !== false;
    }

    /** @return array<string, mixed> */
    public function create(int $workspaceId, string $name, string $slug, string $description, int $creatorId): array
    {
        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) {
            $this->pdo->beginTransaction();
        }

        try {
            $statement = $this->pdo->prepare(
                'INSERT INTO projects (workspace_id, name, slug, description, status, created_by)
                 VALUES (:workspace_id, :name, :slug, :description, :status, :created_by)'
            );
            $statement->execute([
                'workspace_id' => $workspaceId,
                'name' => $name,
                'slug' => $slug,
                'description' => $description,
                'status' => 'active',
                'created_by' => $creatorId,
            ]);
            $projectId = (int) $this->pdo->lastInsertId();
            $this->addMember($workspaceId, $projectId, $creatorId);
            if ($ownsTransaction) {
                $this->pdo->commit();
            }
        } catch (PDOException $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            if ($exception->getCode() === '23000') {
                throw new ApiException(409, 'project_slug_taken', 'A project with this name already exists.');
            }
            throw $exception;
        } catch (\Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $exception;
        }

        return $this->find($workspaceId, $projectId) ?? [];
    }

    /** @param array{name: string, description: string, status: string} $project */
    public function update(int $workspaceId, int $projectId, array $project): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE projects
             SET name = :name, description = :description, status = :status
             WHERE workspace_id = :workspace_id AND id = :id'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'id' => $projectId,
            'name' => $project['name'],
            'description' => $project['description'],
            'status' => $project['status'],
        ]);
    }

    /** @return list<array<string, mixed>> */
    public function members(int $workspaceId, int $projectId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT u.id, u.workspace_id, u.name, u.email, u.role, pm.created_at AS joined_at
             FROM project_memberships pm
             INNER JOIN users u ON u.workspace_id = pm.workspace_id AND u.id = pm.user_id
             WHERE pm.workspace_id = :workspace_id AND pm.project_id = :project_id
             ORDER BY u.name, u.id'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'project_id' => $projectId]);
        return array_map(static function (array $member): array {
            $member['id'] = (int) $member['id'];
            $member['workspace_id'] = (int) $member['workspace_id'];
            return $member;
        }, $statement->fetchAll(PDO::FETCH_ASSOC));
    }

    public function addMember(int $workspaceId, int $projectId, int $userId): void
    {
        $statement = $this->pdo->prepare(
            'INSERT IGNORE INTO project_memberships (workspace_id, project_id, user_id)
             VALUES (:workspace_id, :project_id, :user_id)'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'project_id' => $projectId,
            'user_id' => $userId,
        ]);
    }

    public function removeMember(int $workspaceId, int $projectId, int $userId): bool
    {
        $statement = $this->pdo->prepare(
            'DELETE FROM project_memberships
             WHERE workspace_id = :workspace_id AND project_id = :project_id AND user_id = :user_id'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'project_id' => $projectId,
            'user_id' => $userId,
        ]);
        return $statement->rowCount() > 0;
    }

    /** @param array<string, mixed> $project @return array<string, mixed> */
    private static function normalize(array $project): array
    {
        foreach (['id', 'workspace_id', 'created_by'] as $field) {
            $project[$field] = (int) $project[$field];
        }
        return $project;
    }
}
