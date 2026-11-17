<?php

declare(strict_types=1);

namespace Tangent\Modules\Auth;

use PDO;
use PDOException;
use Tangent\Core\ApiException;

final class UserRepository
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly PasswordSecurity $passwords,
    ) {
    }

    /** @return array<string, mixed>|null */
    public function findByEmail(int $workspaceId, string $email): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT u.id, u.workspace_id, u.account_id, u.name, ua.email, ua.password_hash, u.role, u.is_active
             FROM users u
             INNER JOIN user_accounts ua ON ua.id = u.account_id
             WHERE u.workspace_id = :workspace_id AND ua.email = :email
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
            'SELECT u.id, u.workspace_id, u.account_id, u.name, ua.email, u.role, u.is_active, u.created_at
             FROM users u
             INNER JOIN user_accounts ua ON ua.id = u.account_id
             WHERE u.workspace_id = :workspace_id AND u.id = :id
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
            'SELECT u.id, u.workspace_id, u.name, ua.email, u.role, u.is_active, u.created_at
             FROM users u
             INNER JOIN user_accounts ua ON ua.id = u.account_id
             WHERE u.workspace_id = :workspace_id
             ORDER BY u.name, u.id'
        );
        $statement->execute(['workspace_id' => $workspaceId]);
        return $statement->fetchAll(PDO::FETCH_ASSOC);
    }

    /** @return array<string, mixed>|null */
    public function findAccountByEmail(string $email): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT id AS account_id, email, password_hash
             FROM user_accounts
             WHERE email = :email
             LIMIT 1'
        );
        $statement->execute(['email' => self::normalizeEmail($email)]);
        $account = $statement->fetch(PDO::FETCH_ASSOC);
        return $account === false ? null : $account;
    }

    /** @return array<string, mixed>|null */
    public function findAccountMember(int $workspaceId, int $accountId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT u.id, u.workspace_id, u.account_id, u.name, ua.email, u.role, u.is_active
             FROM users u
             INNER JOIN user_accounts ua ON ua.id = u.account_id
             WHERE u.workspace_id = :workspace_id AND u.account_id = :account_id
             LIMIT 1'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'account_id' => $accountId]);
        $user = $statement->fetch(PDO::FETCH_ASSOC);
        return $user === false ? null : $user;
    }

    public function copyAdminMembership(int $sourceWorkspaceId, int $sourceUserId, int $targetWorkspaceId, int $accountId): int
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO users (workspace_id, account_id, name, email, role, is_active)
             SELECT :target_workspace_id, u.account_id, u.name, ua.email, :role, u.is_active
             FROM users u
             INNER JOIN user_accounts ua ON ua.id = u.account_id
             WHERE u.workspace_id = :source_workspace_id AND u.id = :source_user_id
               AND u.account_id = :account_id AND u.is_active = 1'
        );
        $statement->execute([
            'target_workspace_id' => $targetWorkspaceId,
            'role' => 'admin',
            'source_workspace_id' => $sourceWorkspaceId,
            'source_user_id' => $sourceUserId,
            'account_id' => $accountId,
        ]);
        if ($statement->rowCount() !== 1) {
            throw new ApiException(404, 'not_found', 'The workspace member was not found.');
        }
        return (int) $this->pdo->lastInsertId();
    }

    /** @return array<string, mixed> */
    public function createWorkspaceUser(int $workspaceId, string $name, string $email, string $password, string $role): array
    {
        if (!in_array($role, ['developer', 'guest'], true)) {
            throw new ApiException(422, 'validation_failed', 'Workspace users can only be developers or guests.');
        }
        if ($this->findAccountByEmail($email) !== null) {
            throw new ApiException(409, 'account_exists', 'This email already has an account. Invite the existing account to this workspace.');
        }

        return $this->createAccountAndMembership($workspaceId, $name, $email, $password, $role);
    }

    /** @return array<string, mixed> */
    public function createAdmin(int $workspaceId, string $name, string $email, string $password): array
    {
        return $this->createAccountAndMembership($workspaceId, $name, $email, $password, 'admin');
    }

    /** @return array<string, mixed> */
    public function createMembershipForAccount(int $workspaceId, int $accountId, string $name, string $email, string $role): array
    {
        $account = $this->findAccountByEmail($email);
        if ($account === null || (int) $account['account_id'] !== $accountId) {
            throw new ApiException(409, 'account_changed', 'The invited account is no longer available.');
        }
        $statement = $this->pdo->prepare(
            'INSERT INTO users (workspace_id, account_id, name, email, role, is_active)
             VALUES (:workspace_id, :account_id, :name, :email, :role, 1)'
        );
        try {
            $statement->execute([
                'workspace_id' => $workspaceId,
                'account_id' => $accountId,
                'name' => trim($name),
                'email' => self::normalizeEmail($email),
                'role' => $role,
            ]);
        } catch (PDOException $exception) {
            if ($exception->getCode() === '23000') {
                throw new ApiException(409, 'membership_exists', 'This account is already a member of the workspace.');
            }
            throw $exception;
        }
        return $this->findById($workspaceId, (int) $this->pdo->lastInsertId()) ?? [];
    }

    public function updateAccountPassword(int $accountId, string $password): void
    {
        $statement = $this->pdo->prepare('UPDATE user_accounts SET password_hash = :password_hash WHERE id = :id');
        $statement->execute(['password_hash' => $this->passwords->hash($password), 'id' => $accountId]);
    }

    /** @return array<string, mixed> */
    private function createAccountAndMembership(int $workspaceId, string $name, string $email, string $password, string $role): array
    {
        $normalizedEmail = self::normalizeEmail($email);
        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) {
            $this->pdo->beginTransaction();
        }
        try {
            $account = $this->pdo->prepare(
                'INSERT INTO user_accounts (email, password_hash) VALUES (:email, :password_hash)'
            );
            $account->execute([
                'email' => $normalizedEmail,
                'password_hash' => $this->passwords->hash($password),
            ]);
            $accountId = (int) $this->pdo->lastInsertId();
            $statement = $this->pdo->prepare(
                'INSERT INTO users (workspace_id, account_id, name, email, role, is_active)
                 VALUES (:workspace_id, :account_id, :name, :email, :role, 1)'
            );
            $statement->execute([
                'workspace_id' => $workspaceId,
                'account_id' => $accountId,
                'name' => trim($name),
                'email' => $normalizedEmail,
                'role' => $role,
            ]);
            $userId = (int) $this->pdo->lastInsertId();
            if ($ownsTransaction) {
                $this->pdo->commit();
            }
            return $this->findById($workspaceId, $userId) ?? [];
        } catch (PDOException $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            if ($exception->getCode() === '23000') {
                throw new ApiException(409, 'email_taken', 'A user with this email already exists.');
            }
            throw $exception;
        } catch (\Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $exception;
        }
    }

    public static function normalizeEmail(string $email): string
    {
        return mb_strtolower(trim($email), 'UTF-8');
    }
}
