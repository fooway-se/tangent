<?php

declare(strict_types=1);

namespace Tangent\Modules\GitHub;

use PDO;
use Tangent\Core\ApiException;

final class GitHubInstallationRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function createState(int $workspaceId, int $userId, string $stateHash): void
    {
        $this->pdo->prepare('DELETE FROM github_installation_states WHERE expires_at < CURRENT_TIMESTAMP')
            ->execute();
        $statement = $this->pdo->prepare(
            'INSERT INTO github_installation_states (state_hash, workspace_id, user_id, expires_at)
             VALUES (:state_hash, :workspace_id, :user_id, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 10 MINUTE))'
        );
        $statement->execute(['state_hash' => $stateHash, 'workspace_id' => $workspaceId, 'user_id' => $userId]);
    }

    public function consumeState(int $workspaceId, int $userId, string $stateHash): bool
    {
        $statement = $this->pdo->prepare(
            'DELETE FROM github_installation_states
             WHERE state_hash = :state_hash AND workspace_id = :workspace_id AND user_id = :user_id
               AND expires_at >= CURRENT_TIMESTAMP'
        );
        $statement->execute(['state_hash' => $stateHash, 'workspace_id' => $workspaceId, 'user_id' => $userId]);
        return $statement->rowCount() === 1;
    }

    public function add(int $workspaceId, int $installationId, string $accountLogin, int $userId): void
    {
        $existing = $this->pdo->prepare(
            'SELECT workspace_id FROM github_installations WHERE installation_id = :installation_id LIMIT 1'
        );
        $existing->execute(['installation_id' => $installationId]);
        $existingWorkspace = $existing->fetchColumn();
        if ($existingWorkspace !== false && (int) $existingWorkspace !== $workspaceId) {
            throw new ApiException(409, 'github_installation_connected', 'This GitHub installation is already connected to another Tangent workspace.');
        }
        $statement = $this->pdo->prepare(
            'INSERT INTO github_installations (workspace_id, installation_id, account_login, connected_by)
             VALUES (:workspace_id, :installation_id, :account_login, :connected_by)
             ON DUPLICATE KEY UPDATE account_login = VALUES(account_login), connected_by = VALUES(connected_by)'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'installation_id' => $installationId,
            'account_login' => $accountLogin,
            'connected_by' => $userId,
        ]);
    }

    public function listForWorkspace(int $workspaceId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT installation_id, account_login FROM github_installations
             WHERE workspace_id = :workspace_id ORDER BY account_login, installation_id'
        );
        $statement->execute(['workspace_id' => $workspaceId]);
        return array_map(static fn (array $row): array => [
            'installation_id' => (int) $row['installation_id'],
            'account_login' => (string) $row['account_login'],
        ], $statement->fetchAll(PDO::FETCH_ASSOC));
    }
}
