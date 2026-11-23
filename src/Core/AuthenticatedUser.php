<?php

declare(strict_types=1);

namespace Tangent\Core;

final class AuthenticatedUser
{
    public function __construct(
        public readonly int $id,
        public readonly int $workspaceId,
        public readonly string $name,
        public readonly string $email,
        public readonly string $role,
        public readonly string $authenticationMethod,
        public readonly int $tokenId,
        public readonly ?string $csrfHash,
        public readonly int $accountId = 0,
        public readonly ?int $agentId = null,
        public readonly ?string $agentName = null,
        public readonly array $agentProjectIds = [],
        public readonly array $agentCapabilities = [],
    ) {
    }

    public function isAgent(): bool
    {
        return $this->agentId !== null;
    }

    public function publicData(): array
    {
        if ($this->agentId !== null) {
            return [
                'id' => $this->agentId,
                'workspace_id' => $this->workspaceId,
                'name' => $this->agentName ?? 'Agent',
                'role' => 'agent',
                'principal_type' => 'agent',
            ];
        }

        return [
            'id' => $this->id,
            'workspace_id' => $this->workspaceId,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role,
        ];
    }
}
