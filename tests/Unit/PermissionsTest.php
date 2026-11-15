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

    private function user(string $role, int $id): AuthenticatedUser
    {
        return new AuthenticatedUser($id, 1, ucfirst($role), $role . '@example.test', $role, 'cookie', 1, null);
    }
}
