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
    ) {
    }

    /** @return array{id: int, workspace_id: int, name: string, email: string, role: string} */
    public function publicData(): array
    {
        return [
            'id' => $this->id,
            'workspace_id' => $this->workspaceId,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role,
        ];
    }
}
