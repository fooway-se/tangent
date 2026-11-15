<?php

declare(strict_types=1);

namespace Tangent\Modules\Auth;

use PDO;
use PDOException;
use Tangent\Core\ApiException;

final class UserRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return array<string, mixed>|null */
    public function findByEmail(int $workspaceId, string $email): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, workspace_id, name, email, password_hash, role, is_active
             FROM users
             WHERE workspace_id = :workspace_id AND email = :email
             LIMIT 1'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'email' => self::normalizeEmail($email)]);
        $user = $statement->fetch(PDO::FETCH_ASSOC);
        return $user === false ? null : $user;
    }

    /** @return array<string, mixed>|null */
    public function findById(int $workspaceId, int $userId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, workspace_id, name, email, role, is_active, created_at
             FROM users
             WHERE workspace_id = :workspace_id AND id = :id
             LIMIT 1'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'id' => $userId]);
        $user = $statement->fetch(PDO::FETCH_ASSOC);
        return $user === false ? null : $user;
    }

    /** @return list<array<string, mixed>> */
    public function list(int $workspaceId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, workspace_id, name, email, role, is_active, created_at
             FROM users
             WHERE workspace_id = :workspace_id
             ORDER BY name, id'
        );
        $statement->execute(['workspace_id' => $workspaceId]);
        return $statement->fetchAll(PDO::FETCH_ASSOC);
    }

    /** @return array<string, mixed> */
    public function createDeveloper(int $workspaceId, string $name, string $email, string $password): array
    {
        if ($this->findByEmail($workspaceId, $email) !== null) {
            throw new ApiException(409, 'email_taken', 'A user with this email already exists.');
        }

        $statement = $this->pdo->prepare(
            'INSERT INTO users (workspace_id, name, email, password_hash, role, is_active)
             VALUES (:workspace_id, :name, :email, :password_hash, :role, 1)'
        );

        try {
            $statement->execute([
                'workspace_id' => $workspaceId,
                'name' => trim($name),
                'email' => self::normalizeEmail($email),
                'password_hash' => password_hash($password, PASSWORD_DEFAULT),
                'role' => 'developer',
            ]);
        } catch (PDOException $exception) {
            if ($exception->getCode() === '23000') {
                throw new ApiException(409, 'email_taken', 'A user with this email already exists.');
            }
            throw $exception;
        }

        return $this->findById($workspaceId, (int) $this->pdo->lastInsertId()) ?? [];
    }

    /** @return array<string, mixed> */
    public function createAdmin(int $workspaceId, string $name, string $email, string $password): array
    {
        if ($this->findByEmail($workspaceId, $email) !== null) {
            throw new ApiException(409, 'email_taken', 'A user with this email already exists.');
        }

        $statement = $this->pdo->prepare(
            'INSERT INTO users (workspace_id, name, email, password_hash, role, is_active)
             VALUES (:workspace_id, :name, :email, :password_hash, :role, 1)'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'name' => trim($name),
            'email' => self::normalizeEmail($email),
            'password_hash' => password_hash($password, PASSWORD_DEFAULT),
            'role' => 'admin',
        ]);

        return $this->findById($workspaceId, (int) $this->pdo->lastInsertId()) ?? [];
    }

    public static function normalizeEmail(string $email): string
    {
        return mb_strtolower(trim($email), 'UTF-8');
    }
}
