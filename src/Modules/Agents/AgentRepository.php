<?php

declare(strict_types=1);

namespace Tangent\Modules\Agents;

use PDO;

final class AgentRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function create(
        int $workspaceId,
        int $ownerUserId,
        string $name,
        array $projectIds,
        array $capabilities,
    ): int {
        $statement = $this->pdo->prepare(
            'INSERT INTO agent_identities (workspace_id, owner_user_id, name)
             VALUES (:workspace_id, :owner_user_id, :name)'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'owner_user_id' => $ownerUserId,
            'name' => $name,
        ]);
        $agentId = (int) $this->pdo->lastInsertId();

        $project = $this->pdo->prepare(
            'INSERT INTO agent_identity_projects (workspace_id, agent_id, project_id)
             VALUES (:workspace_id, :agent_id, :project_id)'
        );
        foreach ($projectIds as $projectId) {
            $project->execute([
                'workspace_id' => $workspaceId,
                'agent_id' => $agentId,
                'project_id' => $projectId,
            ]);
        }

        $capability = $this->pdo->prepare(
            'INSERT INTO agent_identity_capabilities (workspace_id, agent_id, capability)
             VALUES (:workspace_id, :agent_id, :capability)'
        );
        foreach ($capabilities as $name) {
            $capability->execute([
                'workspace_id' => $workspaceId,
                'agent_id' => $agentId,
                'capability' => $name,
            ]);
        }

        return $agentId;
    }

    public function find(int $workspaceId, int $agentId, bool $forUpdate = false): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, workspace_id, owner_user_id, name, is_active, created_at, updated_at
             FROM agent_identities
             WHERE workspace_id = :workspace_id AND id = :id LIMIT 1'
                . ($forUpdate ? ' FOR UPDATE' : '')
        );
        $statement->execute(['workspace_id' => $workspaceId, 'id' => $agentId]);
        $agent = $statement->fetch(PDO::FETCH_ASSOC);
        return $agent === false ? null : $this->normalize($agent);
    }

    public function listForWorkspace(int $workspaceId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT id FROM agent_identities WHERE workspace_id = :workspace_id ORDER BY created_at DESC, id DESC'
        );
        $statement->execute(['workspace_id' => $workspaceId]);
        $agents = [];
        foreach ($statement->fetchAll(PDO::FETCH_COLUMN) as $agentId) {
            $agent = $this->find($workspaceId, (int) $agentId);
            if ($agent !== null) $agents[] = $agent;
        }
        return $agents;
    }

    public function setInactive(int $workspaceId, int $agentId): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE agent_identities SET is_active = 0
             WHERE workspace_id = :workspace_id AND id = :id AND is_active = 1'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'id' => $agentId]);
        $revoke = $this->pdo->prepare(
            'UPDATE api_tokens SET revoked_at = UTC_TIMESTAMP()
             WHERE workspace_id = :workspace_id AND agent_id = :agent_id
               AND token_type = :token_type AND revoked_at IS NULL'
        );
        $revoke->execute(['workspace_id' => $workspaceId, 'agent_id' => $agentId, 'token_type' => 'api']);
    }

    public function revokeActiveTokens(int $workspaceId, int $agentId): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE api_tokens SET revoked_at = UTC_TIMESTAMP()
             WHERE workspace_id = :workspace_id AND agent_id = :agent_id
               AND token_type = :token_type AND revoked_at IS NULL'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'agent_id' => $agentId, 'token_type' => 'api']);
    }

    private function normalize(array $agent): array
    {
        $workspaceId = (int) $agent['workspace_id'];
        $agentId = (int) $agent['id'];

        $projects = $this->pdo->prepare(
            'SELECT project_id FROM agent_identity_projects
             WHERE workspace_id = :workspace_id AND agent_id = :agent_id ORDER BY project_id'
        );
        $projects->execute(['workspace_id' => $workspaceId, 'agent_id' => $agentId]);

        $capabilities = $this->pdo->prepare(
            'SELECT capability FROM agent_identity_capabilities
             WHERE workspace_id = :workspace_id AND agent_id = :agent_id ORDER BY capability'
        );
        $capabilities->execute(['workspace_id' => $workspaceId, 'agent_id' => $agentId]);

        $token = $this->pdo->prepare(
            'SELECT expires_at, last_used_at FROM api_tokens
             WHERE workspace_id = :workspace_id AND agent_id = :agent_id AND token_type = :token_type
               AND revoked_at IS NULL
             ORDER BY id DESC LIMIT 1'
        );
        $token->execute(['workspace_id' => $workspaceId, 'agent_id' => $agentId, 'token_type' => 'api']);
        $tokenData = $token->fetch(PDO::FETCH_ASSOC);

        return [
            'id' => $agentId,
            'workspace_id' => $workspaceId,
            'owner_user_id' => (int) $agent['owner_user_id'],
            'name' => (string) $agent['name'],
            'is_active' => (bool) $agent['is_active'],
            'project_ids' => array_map('intval', $projects->fetchAll(PDO::FETCH_COLUMN)),
            'capabilities' => array_map('strval', $capabilities->fetchAll(PDO::FETCH_COLUMN)),
            'created_at' => (string) $agent['created_at'],
            'updated_at' => (string) $agent['updated_at'],
            'token_expires_at' => $tokenData === false || $tokenData['expires_at'] === null
                ? null : (string) $tokenData['expires_at'],
            'token_last_used_at' => $tokenData === false || $tokenData['last_used_at'] === null
                ? null : (string) $tokenData['last_used_at'],
        ];
    }
}
