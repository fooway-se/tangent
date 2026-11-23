<?php

declare(strict_types=1);

namespace Tangent\Modules\Auth;

use PDO;
use Tangent\Core\AuthenticatedUser;

final class TokenRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function create(
        int $workspaceId,
        int $userId,
        string $tokenHash,
        string $type,
        string $label,
        ?string $csrfHash,
        ?string $expiresAt,
        ?int $agentId = null,
    ): int {
        $statement = $this->pdo->prepare(
            'INSERT INTO api_tokens (workspace_id, user_id, agent_id, token_hash, token_type, label, csrf_hash, expires_at)
             VALUES (:workspace_id, :user_id, :agent_id, :token_hash, :token_type, :label, :csrf_hash, :expires_at)'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'user_id' => $userId,
            'agent_id' => $agentId,
            'token_hash' => $tokenHash,
            'token_type' => $type,
            'label' => $label,
            'csrf_hash' => $csrfHash,
            'expires_at' => $expiresAt,
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    public function authenticate(int $workspaceId, string $token, string $type, string $method): ?AuthenticatedUser
    {
        $statement = $this->pdo->prepare(
            'SELECT u.id, u.workspace_id, u.account_id, u.name, u.email, u.role,
                    t.id AS token_id, t.csrf_hash, t.agent_id, a.name AS agent_name,
                    (t.last_used_at IS NULL OR t.last_used_at < UTC_TIMESTAMP() - INTERVAL 1 MINUTE) AS should_touch_last_used
             FROM api_tokens t
             INNER JOIN users u ON u.workspace_id = t.workspace_id AND u.id = t.user_id
             LEFT JOIN agent_identities a
               ON a.workspace_id = t.workspace_id AND a.id = t.agent_id AND a.owner_user_id = t.user_id
             WHERE t.workspace_id = :workspace_id
               AND t.token_hash = :token_hash
               AND t.token_type = :token_type
               AND t.revoked_at IS NULL
               AND (t.expires_at IS NULL OR t.expires_at > UTC_TIMESTAMP())
               AND u.is_active = 1
               AND (t.agent_id IS NULL OR a.is_active = 1)
             LIMIT 1'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'token_hash' => hash('sha256', $token),
            'token_type' => $type,
        ]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);
        if ($row === false) {
            return null;
        }

        if ($type === 'api' && (bool) $row['should_touch_last_used']) {
            $touch = $this->pdo->prepare(
                'UPDATE api_tokens SET last_used_at = UTC_TIMESTAMP()
                 WHERE workspace_id = :workspace_id AND id = :id AND token_type = :token_type
                   AND (last_used_at IS NULL OR last_used_at < UTC_TIMESTAMP() - INTERVAL 1 MINUTE)'
            );
            $touch->execute([
                'workspace_id' => $workspaceId,
                'id' => $row['token_id'],
                'token_type' => 'api',
            ]);
        }

        $agentId = $row['agent_id'] === null ? null : (int) $row['agent_id'];
        $agentProjects = [];
        $agentCapabilities = [];
        if ($agentId !== null) {
            $projects = $this->pdo->prepare(
                'SELECT project_id FROM agent_identity_projects
                 WHERE workspace_id = :workspace_id AND agent_id = :agent_id ORDER BY project_id'
            );
            $projects->execute(['workspace_id' => $workspaceId, 'agent_id' => $agentId]);
            $agentProjects = array_map('intval', $projects->fetchAll(PDO::FETCH_COLUMN));

            $capabilities = $this->pdo->prepare(
                'SELECT capability FROM agent_identity_capabilities
                 WHERE workspace_id = :workspace_id AND agent_id = :agent_id ORDER BY capability'
            );
            $capabilities->execute(['workspace_id' => $workspaceId, 'agent_id' => $agentId]);
            $agentCapabilities = array_map('strval', $capabilities->fetchAll(PDO::FETCH_COLUMN));
        }

        return new AuthenticatedUser(
            (int) $row['id'],
            (int) $row['workspace_id'],
            (string) $row['name'],
            (string) $row['email'],
            (string) $row['role'],
            $method,
            (int) $row['token_id'],
            $row['csrf_hash'] === null ? null : (string) $row['csrf_hash'],
            (int) $row['account_id'],
            $agentId,
            $row['agent_name'] === null ? null : (string) $row['agent_name'],
            $agentProjects,
            $agentCapabilities,
        );
    }

    public function listForUser(int $workspaceId, int $userId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, label, token_type, created_at, last_used_at, expires_at
             FROM api_tokens
             WHERE workspace_id = :workspace_id AND user_id = :user_id
               AND token_type = :token_type AND agent_id IS NULL AND revoked_at IS NULL
             ORDER BY created_at DESC, id DESC'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'user_id' => $userId,
            'token_type' => 'api',
        ]);
        return $statement->fetchAll(PDO::FETCH_ASSOC);
    }

    public function findOwner(int $workspaceId, int $tokenId): ?int
    {
        $statement = $this->pdo->prepare(
            'SELECT user_id FROM api_tokens
             WHERE workspace_id = :workspace_id AND id = :id
               AND token_type = :token_type AND revoked_at IS NULL
             LIMIT 1'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'id' => $tokenId,
            'token_type' => 'api',
        ]);
        $userId = $statement->fetchColumn();
        return $userId === false ? null : (int) $userId;
    }

    public function revoke(int $workspaceId, int $tokenId, int $userId): bool
    {
        $statement = $this->pdo->prepare(
            'UPDATE api_tokens SET revoked_at = UTC_TIMESTAMP()
             WHERE workspace_id = :workspace_id AND id = :id AND user_id = :user_id
               AND revoked_at IS NULL'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'id' => $tokenId,
            'user_id' => $userId,
        ]);
        return $statement->rowCount() > 0;
    }

    public function revokeAllForAccount(int $accountId): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE api_tokens t
             INNER JOIN users u ON u.workspace_id = t.workspace_id AND u.id = t.user_id
             SET t.revoked_at = UTC_TIMESTAMP()
             WHERE u.account_id = :account_id AND t.revoked_at IS NULL'
        );
        $statement->execute(['account_id' => $accountId]);
    }

    public function revokeAllForMember(int $workspaceId, int $userId): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE api_tokens SET revoked_at = UTC_TIMESTAMP()
             WHERE workspace_id = :workspace_id AND user_id = :user_id
               AND token_type IN (\'session\', \'api\') AND revoked_at IS NULL'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'user_id' => $userId,
        ]);
    }
}
