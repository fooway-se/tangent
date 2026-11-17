<?php

declare(strict_types=1);

namespace Tangent\Modules\Auth;

use PDO;

final class CredentialTokenRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function createInvite(
        int $workspaceId,
        int $creatorId,
        string $name,
        string $email,
        string $role,
        array $projectIds,
        string $tokenHash,
        string $expiresAt,
    ): int {
        $this->revokePendingInvites($workspaceId, $email);
        $statement = $this->pdo->prepare(
            'INSERT INTO credential_tokens
                (workspace_id, token_hash, token_type, email, name, role, expires_at, created_by)
             VALUES (:workspace_id, :token_hash, :token_type, :email, :name, :role, :expires_at, :created_by)'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'token_hash' => $tokenHash,
            'token_type' => 'invite',
            'email' => UserRepository::normalizeEmail($email),
            'name' => trim($name),
            'role' => $role,
            'expires_at' => $expiresAt,
            'created_by' => $creatorId,
        ]);
        $id = (int) $this->pdo->lastInsertId();
        $this->setProjectIds($workspaceId, $id, $projectIds);
        return $id;
    }

    public function listInvites(int $workspaceId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, email, name, role, expires_at, created_at
             FROM credential_tokens
             WHERE workspace_id = :workspace_id AND token_type = :token_type
               AND used_at IS NULL AND revoked_at IS NULL
             ORDER BY created_at DESC, id DESC'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'token_type' => 'invite']);
        return array_map(static function (array $invite): array {
            $invite['id'] = (int) $invite['id'];
            return $invite;
        }, $statement->fetchAll(PDO::FETCH_ASSOC));
    }

    public function findInvite(int $workspaceId, int $inviteId, bool $forUpdate = false): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, workspace_id, email, name, role, expires_at, used_at, revoked_at
             FROM credential_tokens
             WHERE workspace_id = :workspace_id AND id = :id AND token_type = :token_type
               AND used_at IS NULL AND revoked_at IS NULL
             LIMIT 1' . ($forUpdate ? ' FOR UPDATE' : '')
        );
        $statement->execute(['workspace_id' => $workspaceId, 'id' => $inviteId, 'token_type' => 'invite']);
        $invite = $statement->fetch(PDO::FETCH_ASSOC);
        return $invite === false ? null : $invite;
    }

    public function replaceInviteToken(int $workspaceId, int $inviteId, string $tokenHash, string $expiresAt, array $projectIds): bool
    {
        $statement = $this->pdo->prepare(
            'UPDATE credential_tokens
             SET token_hash = :token_hash, expires_at = :expires_at
             WHERE workspace_id = :workspace_id AND id = :id AND token_type = :token_type
               AND used_at IS NULL AND revoked_at IS NULL'
        );
        $statement->execute([
            'token_hash' => $tokenHash,
            'expires_at' => $expiresAt,
            'workspace_id' => $workspaceId,
            'id' => $inviteId,
            'token_type' => 'invite',
        ]);
        if ($statement->rowCount() !== 1) {
            return false;
        }
        $this->setProjectIds($workspaceId, $inviteId, $projectIds);
        return true;
    }

    public function revokeInvite(int $workspaceId, int $inviteId): bool
    {
        $statement = $this->pdo->prepare(
            'UPDATE credential_tokens SET revoked_at = UTC_TIMESTAMP()
             WHERE workspace_id = :workspace_id AND id = :id AND token_type = :token_type
               AND used_at IS NULL AND revoked_at IS NULL'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'id' => $inviteId, 'token_type' => 'invite']);
        return $statement->rowCount() === 1;
    }

    public function createPasswordReset(
        int $workspaceId,
        int $accountId,
        string $email,
        string $name,
        string $tokenHash,
        string $expiresAt,
    ): void {
        $this->revokePasswordResets($accountId);
        $statement = $this->pdo->prepare(
            'INSERT INTO credential_tokens
                (workspace_id, token_hash, token_type, account_id, email, name, expires_at)
             VALUES (:workspace_id, :token_hash, :token_type, :account_id, :email, :name, :expires_at)'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'token_hash' => $tokenHash,
            'token_type' => 'password_reset',
            'account_id' => $accountId,
            'email' => UserRepository::normalizeEmail($email),
            'name' => $name,
            'expires_at' => $expiresAt,
        ]);
    }

    public function findValid(string $tokenHash, string $type, bool $forUpdate = false): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, workspace_id, token_type, account_id, email, name, role, expires_at
             FROM credential_tokens
             WHERE token_hash = :token_hash AND token_type = :token_type
               AND used_at IS NULL AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP()
             LIMIT 1' . ($forUpdate ? ' FOR UPDATE' : '')
        );
        $statement->execute(['token_hash' => $tokenHash, 'token_type' => $type]);
        $token = $statement->fetch(PDO::FETCH_ASSOC);
        return $token === false ? null : $token;
    }

    public function markUsed(int $workspaceId, int $tokenId): bool
    {
        $statement = $this->pdo->prepare(
            'UPDATE credential_tokens SET used_at = UTC_TIMESTAMP()
             WHERE workspace_id = :workspace_id AND id = :id
               AND used_at IS NULL AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP()'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'id' => $tokenId]);
        return $statement->rowCount() === 1;
    }

    public function revokeOtherPasswordResets(int $accountId, int $usedTokenId): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE credential_tokens SET revoked_at = UTC_TIMESTAMP()
             WHERE account_id = :account_id AND token_type = :token_type AND id <> :used_id
               AND used_at IS NULL AND revoked_at IS NULL'
        );
        $statement->execute([
            'account_id' => $accountId,
            'token_type' => 'password_reset',
            'used_id' => $usedTokenId,
        ]);
    }

    public function projectIds(int $workspaceId, int $tokenId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT project_id FROM credential_token_projects
             WHERE workspace_id = :workspace_id AND credential_token_id = :token_id
             ORDER BY project_id'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'token_id' => $tokenId]);
        return array_map('intval', $statement->fetchAll(PDO::FETCH_COLUMN));
    }

    private function revokePendingInvites(int $workspaceId, string $email): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE credential_tokens SET revoked_at = UTC_TIMESTAMP()
             WHERE workspace_id = :workspace_id AND email = :email AND token_type = :token_type
               AND used_at IS NULL AND revoked_at IS NULL'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'email' => UserRepository::normalizeEmail($email),
            'token_type' => 'invite',
        ]);
    }

    private function revokePasswordResets(int $accountId): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE credential_tokens SET revoked_at = UTC_TIMESTAMP()
             WHERE account_id = :account_id AND token_type = :token_type
               AND used_at IS NULL AND revoked_at IS NULL'
        );
        $statement->execute(['account_id' => $accountId, 'token_type' => 'password_reset']);
    }

    private function setProjectIds(int $workspaceId, int $tokenId, array $projectIds): void
    {
        $delete = $this->pdo->prepare(
            'DELETE FROM credential_token_projects
             WHERE workspace_id = :workspace_id AND credential_token_id = :token_id'
        );
        $delete->execute(['workspace_id' => $workspaceId, 'token_id' => $tokenId]);
        $insert = $this->pdo->prepare(
            'INSERT INTO credential_token_projects (workspace_id, credential_token_id, project_id)
             VALUES (:workspace_id, :token_id, :project_id)'
        );
        foreach (array_unique($projectIds) as $projectId) {
            $insert->execute(['workspace_id' => $workspaceId, 'token_id' => $tokenId, 'project_id' => $projectId]);
        }
    }
}
