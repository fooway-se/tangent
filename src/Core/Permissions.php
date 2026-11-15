<?php

declare(strict_types=1);

namespace Tangent\Core;

final class Permissions
{
    /** @param array<string, mixed> $resource */
    public static function can(AuthenticatedUser $user, string $action, array $resource = []): bool
    {
        return match ($action) {
            'users.list', 'users.create', 'projects.create', 'projects.update', 'projects.manage_members'
                => $user->role === 'admin',
            'projects.view'
                => $user->role === 'admin' || ($resource['is_member'] ?? false) === true,
            'tokens.create'
                => in_array($user->role, ['admin', 'developer'], true),
            'tokens.revoke'
                => $user->role === 'admin' || (int) ($resource['user_id'] ?? 0) === $user->id,
            default => false,
        };
    }
}
