<?php

declare(strict_types=1);

namespace Tangent\Tests\Unit;

use PHPUnit\Framework\TestCase;
use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Permissions;

final class PermissionsTest extends TestCase
{
    public function testAdminCanManageProjectsAndViewWorkspaceProjects(): void
    {
        $admin = $this->user('admin', 1);

        self::assertTrue(Permissions::can($admin, 'projects.create'));
        self::assertTrue(Permissions::can($admin, 'projects.view', ['is_member' => false]));
        self::assertTrue(Permissions::can($admin, 'projects.manage_members'));
    }

    public function testDeveloperCanOnlyViewMemberProjects(): void
    {
        $developer = $this->user('developer', 2);

        self::assertTrue(Permissions::can($developer, 'projects.view', ['is_member' => true]));
        self::assertFalse(Permissions::can($developer, 'projects.view', ['is_member' => false]));
        self::assertFalse(Permissions::can($developer, 'projects.create'));
        self::assertFalse(Permissions::can($developer, 'users.create'));
    }

    public function testApiTokensCanOnlyBeRevokedByOwnerOrAdmin(): void
    {
        $developer = $this->user('developer', 2);
        $admin = $this->user('admin', 1);

        self::assertTrue(Permissions::can($developer, 'tokens.revoke', ['user_id' => 2]));
        self::assertFalse(Permissions::can($developer, 'tokens.revoke', ['user_id' => 3]));
        self::assertTrue(Permissions::can($admin, 'tokens.revoke', ['user_id' => 3]));
    }

    public function testGuestCannotUseInternalPermissionsEvenWhenTheyBelongToTheProject(): void
    {
        $guest = new AuthenticatedUser(3, 1, 'Guest', 'guest@example.test', 'guest', 'cookie', 3, null, 9);
        $internalActions = [
            'users.list', 'users.create', 'projects.create', 'projects.update', 'projects.manage_members',
            'workspaces.create', 'projects.view',
            'chat.read', 'chat.send', 'issues.read', 'issues.create', 'issues.update',
            'issues.share', 'milestones.manage', 'tokens.create', 'tokens.list', 'inbox.read',
        ];

        foreach ($internalActions as $action) {
            self::assertFalse(Permissions::can($guest, $action, [
                'is_member' => true,
                'user_id' => $guest->id,
            ]), "Guest must not have {$action}");
        }

        self::assertTrue(Permissions::can($guest, 'workspaces.list'));
        self::assertTrue(Permissions::can($guest, 'workspaces.switch'));
        $unownedAccount = new AuthenticatedUser(3, 1, 'Guest', 'guest@example.test', 'guest', 'cookie', 0, null);
        self::assertFalse(Permissions::can($unownedAccount, 'workspaces.list'));
        self::assertFalse(Permissions::can($unownedAccount, 'workspaces.switch'));
    }

    public function testGuestClientPermissionsRequireProjectMembership(): void
    {
        $guest = new AuthenticatedUser(3, 1, 'Guest', 'guest@example.test', 'guest', 'cookie', 3, null, 9);

        foreach (['client_view.read', 'client_comments.create', 'approvals.approve'] as $action) {
            self::assertTrue(Permissions::can($guest, $action, ['is_member' => true]), $action);
            self::assertFalse(Permissions::can($guest, $action, ['is_member' => false]), $action);
        }

        self::assertTrue(Permissions::can($this->user('admin', 1), 'client_view.read', ['is_member' => false]));
        self::assertTrue(Permissions::can($this->user('developer', 2), 'client_view.read', ['is_member' => true]));
        self::assertFalse(Permissions::can($this->user('developer', 2), 'approvals.approve', ['is_member' => true]));
        self::assertTrue(Permissions::can($this->user('developer', 2), 'issues.share', ['is_member' => true]));
        self::assertTrue(Permissions::can($this->user('developer', 2), 'milestones.manage', ['is_member' => true]));
    }

    private function user(string $role, int $id): AuthenticatedUser
    {
        return new AuthenticatedUser($id, 1, ucfirst($role), $role . '@example.test', $role, 'cookie', 1, null);
    }
}
