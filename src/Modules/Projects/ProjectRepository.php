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

    public function listForWorkspace(int $workspaceId, ?int $membershipUserId = null): array
    {
        $membership = $membershipUserId === null ? '' : ', pm.user_id IS NOT NULL AS is_member';
        $membershipJoin = $membershipUserId === null
            ? ''
            : ' LEFT JOIN project_memberships pm
                  ON pm.workspace_id = p.workspace_id AND pm.project_id = p.id AND pm.user_id = :user_id';
        $statement = $this->pdo->prepare(
            'SELECT p.id, p.workspace_id, p.name, p.slug, p.description, p.status, p.archived_from_status,
                    p.github_installation_id, p.github_repository_id, p.github_repository_owner, p.github_repository_name,
                    p.github_repository_full_name, p.github_repository_url, p.created_by, p.created_at, p.updated_at'
            . $membership . '
             FROM projects p' . $membershipJoin . '
             WHERE p.workspace_id = :workspace_id
             ORDER BY p.name, p.id'
        );
        $parameters = ['workspace_id' => $workspaceId];
        if ($membershipUserId !== null) $parameters['user_id'] = $membershipUserId;
        $statement->execute($parameters);
        return array_map(static function (array $project) use ($membershipUserId): array {
            if ($membershipUserId !== null) $project['is_member'] = (bool) $project['is_member'];
            return self::normalize($project);
        }, $statement->fetchAll(PDO::FETCH_ASSOC));
    }

    public function find(int $workspaceId, int $projectId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, workspace_id, name, slug, description, status, archived_from_status,
                    github_installation_id, github_repository_id, github_repository_owner, github_repository_name,
                    github_repository_full_name, github_repository_url, created_by, created_at, updated_at
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

    public function assignableProjectIdsForMember(int $workspaceId, int $userId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT pm.project_id
             FROM project_memberships pm
             INNER JOIN projects p ON p.workspace_id = pm.workspace_id AND p.id = pm.project_id
             WHERE pm.workspace_id = :workspace_id AND pm.user_id = :user_id AND p.status IN (\'active\', \'paused\')
             ORDER BY p.name, p.id'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'user_id' => $userId]);
        return array_map('intval', $statement->fetchAll(PDO::FETCH_COLUMN));
    }

    public function visibilityForUser(int $workspaceId, int $userId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT p.id, pm.user_id IS NOT NULL AS is_member
             FROM projects p
             LEFT JOIN project_memberships pm
               ON pm.workspace_id = p.workspace_id AND pm.project_id = p.id AND pm.user_id = :user_id
             WHERE p.workspace_id = :workspace_id
             ORDER BY p.id'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'user_id' => $userId]);
        return array_map(static fn (array $row): array => [
            'id' => (int) $row['id'],
            'is_member' => (bool) $row['is_member'],
        ], $statement->fetchAll(PDO::FETCH_ASSOC));
    }

    public function create(
        int $workspaceId,
        string $name,
        string $slug,
        string $description,
        int $creatorId,
        ?array $githubRepository = null,
    ): array
    {
        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) {
            $this->pdo->beginTransaction();
        }

        try {
            $statement = $this->pdo->prepare(
                'INSERT INTO projects
                    (workspace_id, name, slug, description, status, github_installation_id, github_repository_id,
                     github_repository_owner, github_repository_name, github_repository_full_name, github_repository_url, created_by)
                 VALUES
                    (:workspace_id, :name, :slug, :description, :status, :github_installation_id, :github_repository_id,
                     :github_repository_owner, :github_repository_name, :github_repository_full_name, :github_repository_url, :created_by)'
            );
            $statement->execute([
                'workspace_id' => $workspaceId,
                'name' => $name,
                'slug' => $slug,
                'description' => $description,
                'status' => 'active',
                'github_installation_id' => $githubRepository['installation_id'] ?? null,
                'github_repository_id' => $githubRepository['id'] ?? null,
                'github_repository_owner' => $githubRepository['owner'] ?? null,
                'github_repository_name' => $githubRepository['name'] ?? null,
                'github_repository_full_name' => $githubRepository['full_name'] ?? null,
                'github_repository_url' => $githubRepository['html_url'] ?? null,
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

    public function update(int $workspaceId, int $projectId, array $project): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE projects
             SET name = :name, description = :description, status = :status,
                 archived_from_status = :archived_from_status,
                 github_installation_id = :github_installation_id, github_repository_id = :github_repository_id,
                 github_repository_owner = :github_repository_owner, github_repository_name = :github_repository_name,
                 github_repository_full_name = :github_repository_full_name, github_repository_url = :github_repository_url
             WHERE workspace_id = :workspace_id AND id = :id'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'id' => $projectId,
            'name' => $project['name'],
            'description' => $project['description'],
            'status' => $project['status'],
            'archived_from_status' => $project['archived_from_status'],
            'github_installation_id' => $project['github_repository']['installation_id'] ?? null,
            'github_repository_id' => $project['github_repository']['id'] ?? null,
            'github_repository_owner' => $project['github_repository']['owner'] ?? null,
            'github_repository_name' => $project['github_repository']['name'] ?? null,
            'github_repository_full_name' => $project['github_repository']['full_name'] ?? null,
            'github_repository_url' => $project['github_repository']['html_url'] ?? null,
        ]);
    }

    public function notes(int $workspaceId, int $projectId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT content, updated_at
             FROM project_notes
             WHERE workspace_id = :workspace_id AND project_id = :project_id
             LIMIT 1'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'project_id' => $projectId]);
        $notes = $statement->fetch(PDO::FETCH_ASSOC);
        return $notes === false ? ['notes' => '', 'updated_at' => null] : [
            'notes' => $notes['content'],
            'updated_at' => $notes['updated_at'],
        ];
    }

    public function saveNotes(int $workspaceId, int $projectId, int $userId, string $content): array
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO project_notes (workspace_id, project_id, content, updated_by)
             VALUES (:workspace_id, :project_id, :content, :updated_by)
             ON DUPLICATE KEY UPDATE content = VALUES(content), updated_by = VALUES(updated_by),
                updated_at = CURRENT_TIMESTAMP'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'project_id' => $projectId,
            'content' => $content,
            'updated_by' => $userId,
        ]);
        return $this->notes($workspaceId, $projectId);
    }

    public function members(int $workspaceId, int $projectId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT u.id, u.workspace_id, u.name, u.email, u.role, u.is_active, pm.created_at AS joined_at
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

    private static function normalize(array $project): array
    {
        foreach (['id', 'workspace_id', 'created_by'] as $field) {
            $project[$field] = (int) $project[$field];
        }
        if ($project['github_repository_id'] === null) {
            $project['github_repository'] = null;
        } else {
            $project['github_repository'] = [
                'id' => (int) $project['github_repository_id'],
                'installation_id' => (int) $project['github_installation_id'],
                'owner' => $project['github_repository_owner'],
                'name' => $project['github_repository_name'],
                'full_name' => $project['github_repository_full_name'],
                'html_url' => $project['github_repository_url'],
            ];
        }
        unset(
            $project['github_installation_id'],
            $project['github_repository_id'],
            $project['github_repository_owner'],
            $project['github_repository_name'],
            $project['github_repository_full_name'],
            $project['github_repository_url'],
        );
        return $project;
    }
}
