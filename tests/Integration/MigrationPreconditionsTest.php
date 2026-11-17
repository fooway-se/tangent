<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use RuntimeException;
use Tangent\Core\MigrationRunner;
use Tangent\Tests\Support\ApiTestCase;

final class MigrationPreconditionsTest extends ApiTestCase
{
    public function testAuthLifecycleMigrationStopsBeforeMergingDuplicateWorkspaceEmails(): void
    {
        $workspace = $this->pdo->prepare('INSERT INTO workspaces (name, slug) VALUES (:name, :slug)');
        $workspace->execute(['name' => 'Legacy workspace', 'slug' => 'legacy-' . bin2hex(random_bytes(4))]);
        $legacyWorkspaceId = (int) $this->pdo->lastInsertId();

        $account = $this->pdo->prepare(
            'INSERT INTO user_accounts (email, password_hash) VALUES (:email, :password_hash)'
        );
        $account->execute([
            'email' => 'different-account@example.test',
            'password_hash' => password_hash('legacy workspace password', PASSWORD_ARGON2ID),
        ]);
        $legacyAccountId = (int) $this->pdo->lastInsertId();

        $membership = $this->pdo->prepare(
            'INSERT INTO users (workspace_id, account_id, name, email, role, is_active)
             VALUES (:workspace_id, :account_id, :name, :email, :role, 1)'
        );
        $membership->execute([
            'workspace_id' => $legacyWorkspaceId,
            'account_id' => $legacyAccountId,
            'name' => 'Legacy Admin',
            'email' => ' ADMIN@example.test ',
            'role' => 'admin',
        ]);

        $deleteVersion = $this->pdo->prepare('DELETE FROM schema_migrations WHERE version = :version');
        $deleteVersion->execute(['version' => '011_auth_lifecycle.sql']);

        try {
            (new MigrationRunner($this->pdo, dirname(__DIR__, 2) . '/migrations'))->migrate();
            self::fail('Expected the account migration to reject duplicate legacy emails.');
        } catch (RuntimeException $exception) {
            self::assertStringContainsString('duplicate email', strtolower($exception->getMessage()));
        }

        $membershipCount = $this->pdo->prepare(
            'SELECT COUNT(*) FROM users WHERE email = :email OR email = :normalized_email'
        );
        $membershipCount->execute(['email' => $this->adminEmail, 'normalized_email' => ' ADMIN@example.test ']);
        self::assertSame(2, (int) $membershipCount->fetchColumn(), 'Both workspace memberships must remain intact.');

        $migrationApplied = $this->pdo->prepare('SELECT 1 FROM schema_migrations WHERE version = :version');
        $migrationApplied->execute(['version' => '011_auth_lifecycle.sql']);
        self::assertFalse($migrationApplied->fetchColumn() !== false);
    }
}
