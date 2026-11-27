<?php

declare(strict_types=1);

namespace Tangent\Core;

final class Permissions
{
    public static function can(AuthenticatedUser $user, string $action, array $resource = []): bool
    {
        if ($user->isAgent()) {
            $capability = match ($action) {
                'agent.issues.read' => 'issues.read',
                'agent.issues.comment' => 'issues.comment',
                'agent.issues.status.update' => 'issues.status.update',
                default => null,
            };
            $projectId = $resource['project_id'] ?? null;
            return $capability !== null
                && in_array($capability, $user->agentCapabilities, true)
                && is_int($projectId)
                && in_array($projectId, $user->agentProjectIds, true)
                && ($user->role === 'admin' || (
                    $user->role === 'developer' && ($resource['is_member'] ?? false) === true
                ));
        }

        if ($user->role === 'guest') {
            return match ($action) {
                'client_view.read', 'client_comments.create', 'approvals.approve'
                    => ($resource['is_member'] ?? false) === true,
                'workspaces.list', 'workspaces.switch' => $user->accountId > 0,
                default => false,
            };
        }

        return match ($action) {
            'users.list', 'users.create', 'users.manage_members', 'projects.create', 'projects.update', 'projects.manage_members', 'agents.manage'
                => $user->role === 'admin',
            'workspace.notifications.manage'
                => $user->role === 'admin',
            'workspaces.create'
                => $user->role === 'admin' && $user->accountId > 0,
            'workspaces.list', 'workspaces.switch'
                => $user->accountId > 0,
            'projects.view'
                => $user->role === 'admin' || ($resource['is_member'] ?? false) === true,
            'chat.read', 'chat.send'
                => $user->role === 'admin' || ($user->role === 'developer' && ($resource['is_member'] ?? false) === true),
            'lounge.read', 'lounge.send'
                => in_array($user->role, ['admin', 'developer'], true),
            'roadmap.read'
                => in_array($user->role, ['admin', 'developer'], true),
            'issues.read', 'issues.create', 'issues.update'
                => $user->role === 'admin' || ($user->role === 'developer' && ($resource['is_member'] ?? false) === true),
            'tokens.create'
                => in_array($user->role, ['admin', 'developer'], true),
            'tokens.list'
                => in_array($user->role, ['admin', 'developer'], true),
            'inbox.read'
                => in_array($user->role, ['admin', 'developer'], true),
            'scratchpad.read', 'scratchpad.update'
                => in_array($user->role, ['admin', 'developer'], true),
            'client_view.read'
                => $user->role === 'admin' || (($user->role === 'developer') && ($resource['is_member'] ?? false) === true),
            'client_comments.create'
                => $user->role === 'admin' || (($user->role === 'developer') && ($resource['is_member'] ?? false) === true),
            'approvals.approve'
                => false,
            'issues.share', 'milestones.manage'
                => $user->role === 'admin' || (($user->role === 'developer') && ($resource['is_member'] ?? false) === true),
            'tokens.revoke'
                => $user->role === 'admin' || (int) ($resource['user_id'] ?? 0) === $user->id,
            default => false,
        };
    }
}
