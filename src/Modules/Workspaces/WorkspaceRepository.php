<?php

declare(strict_types=1);

namespace Tangent\Modules\Workspaces;

use PDO;

final class WorkspaceRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return list<array{id: int, name: string, slug: string, role: string}> */
    public function listForAccount(int $accountId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT w.id, w.name, w.slug, u.role
             FROM users u
             INNER JOIN workspaces w ON w.id = u.workspace_id
             WHERE u.account_id = :account_id AND u.is_active = 1
             ORDER BY w.name, w.id'
        );
        $statement->execute(['account_id' => $accountId]);
        return array_map(self::workspace(...), $statement->fetchAll(PDO::FETCH_ASSOC));
    }

    /** @return array{id: int, name: string, slug: string, role: string}|null */
    public function findForAccount(int $workspaceId, int $accountId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT w.id, w.name, w.slug, u.role
             FROM workspaces w
             INNER JOIN users u ON u.workspace_id = w.id
             WHERE w.id = :workspace_id AND u.account_id = :account_id AND u.is_active = 1
             LIMIT 1'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'account_id' => $accountId]);
        $workspace = $statement->fetch(PDO::FETCH_ASSOC);
        return $workspace === false ? null : self::workspace($workspace);
    }

    public function nameById(int $workspaceId): string
    {
        $statement = $this->pdo->prepare('SELECT name FROM workspaces WHERE id = :id LIMIT 1');
        $statement->execute(['id' => $workspaceId]);
        $name = $statement->fetchColumn();
        return is_string($name) ? $name : '';
    }

    /** @return array{id: int, name: string, slug: string} */
    public function create(string $name, string $slug): array
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO workspaces (name, slug) VALUES (:name, :slug)'
        );
        $statement->execute(['name' => $name, 'slug' => $slug]);
        return [
            'id' => (int) $this->pdo->lastInsertId(),
            'name' => $name,
            'slug' => $slug,
        ];
    }

    /** @param array<string, mixed> $row @return array{id: int, name: string, slug: string, role: string} */
    private static function workspace(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'name' => (string) $row['name'],
            'slug' => (string) $row['slug'],
            'role' => (string) $row['role'],
        ];
    }
}
