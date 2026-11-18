<?php

declare(strict_types=1);

namespace Tangent\Modules\Installer;

use PDO;
use PDOException;
use RuntimeException;
use Tangent\Core\Database;
use Tangent\Core\MigrationRunner;
use Tangent\Modules\Auth\PasswordSecurity;
use Tangent\Modules\Auth\UserRepository;

final class PdoInstallDatabase implements InstallDatabase
{
    public function __construct(private readonly string $migrationsDirectory)
    {
    }

    public function initialize(array $input): int
    {
        try {
            $database = $input['database'];
            $pdo = Database::connect(
                $database['host'],
                $database['port'],
                $database['name'],
                $database['user'],
                $database['password'],
            )->pdo();
        } catch (PDOException $exception) {
            throw new RuntimeException('Could not connect to the database. Check the host, database name, user, password, and permissions.', 0, $exception);
        }

        $this->assertDedicatedDatabase($pdo, $input['workspace_slug']);
        (new MigrationRunner($pdo, $this->migrationsDirectory))->migrate();

        $workspaceQuery = $pdo->prepare('SELECT id FROM workspaces WHERE slug = :slug LIMIT 1');
        $workspaceQuery->execute(['slug' => $input['workspace_slug']]);
        $existingWorkspaceId = $workspaceQuery->fetchColumn();

        $passwords = new PasswordSecurity();
        $users = new UserRepository($pdo, $passwords);
        if ($existingWorkspaceId !== false) {
            $workspaceId = (int) $existingWorkspaceId;
            $admin = $users->findByEmail($workspaceId, $input['admin_email']);
            if ($admin !== null) {
                if ($admin['role'] !== 'admin'
                    || !(bool) $admin['is_active']
                    || !$passwords->verify($input['admin_password'], (string) $admin['password_hash'])
                ) {
                    throw new RuntimeException('This workspace already has members. Use the existing active admin email and password to finish setup.');
                }
                return $workspaceId;
            }

            $members = $pdo->prepare('SELECT COUNT(*) FROM users WHERE workspace_id = :workspace_id');
            $members->execute(['workspace_id' => $workspaceId]);
            if ((int) $members->fetchColumn() > 0) {
                throw new RuntimeException('This workspace already has members. Setup will not add another administrator.');
            }

            $pdo->beginTransaction();
            try {
                $users->createAdmin($workspaceId, $input['admin_name'], $input['admin_email'], $input['admin_password']);
                $pdo->commit();
            } catch (\Throwable $exception) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $exception;
            }

            return $workspaceId;
        }

        $workspaceCount = (int) $pdo->query('SELECT COUNT(*) FROM workspaces')->fetchColumn();
        if ($workspaceCount !== 0) {
            throw new RuntimeException('This database already contains Tangent workspaces. Use a new empty database or restore the existing config.php.');
        }

        $pdo->beginTransaction();
        try {
            $workspace = $pdo->prepare('INSERT INTO workspaces (name, slug) VALUES (:name, :slug)');
            $workspace->execute(['name' => $input['workspace_name'], 'slug' => $input['workspace_slug']]);
            $workspaceId = (int) $pdo->lastInsertId();
            $users->createAdmin($workspaceId, $input['admin_name'], $input['admin_email'], $input['admin_password']);
            $pdo->commit();
            return $workspaceId;
        } catch (\Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            if ($exception instanceof PDOException && $exception->getCode() === '23000') {
                throw new RuntimeException('The workspace URL name or admin email is already in use.', 0, $exception);
            }
            throw $exception;
        }
    }

    private function assertDedicatedDatabase(PDO $pdo, string $workspaceSlug): void
    {
        $tables = $pdo->query(
            'SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE()'
        )->fetchAll(PDO::FETCH_COLUMN);
        if ($tables === []) {
            return;
        }
        if (!in_array('schema_migrations', $tables, true)) {
            throw new RuntimeException('Use an empty, dedicated database for Tangent.');
        }

        if (in_array('workspaces', $tables, true)) {
            $workspaceCount = (int) $pdo->query('SELECT COUNT(*) FROM workspaces')->fetchColumn();
            if ($workspaceCount > 0) {
                $workspace = $pdo->prepare('SELECT id FROM workspaces WHERE slug = :slug LIMIT 1');
                $workspace->execute(['slug' => $workspaceSlug]);
                if ($workspace->fetchColumn() === false) {
                    throw new RuntimeException('This database already contains Tangent workspaces. Use a new empty database or restore the existing config.php.');
                }
            }
        }
    }
}
