<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use PDO;
use Tangent\Modules\Installer\InstallService;
use Tangent\Modules\Installer\PdoInstallDatabase;
use Tangent\Tests\Support\ApiTestCase;

final class InstallerTest extends ApiTestCase
{
    public function testInstallerCreatesWorkspaceAdminAndPrivateConfig(): void
    {
        $directory = sys_get_temp_dir() . '/tangent-install-integration-' . bin2hex(random_bytes(8));
        mkdir($directory, 0700);
        $keyPath = $directory . '/.install-key';
        $configPath = $directory . '/config.php';
        $slug = 'install-test-' . bin2hex(random_bytes(5));
        $email = $slug . '@example.test';
        $key = bin2hex(random_bytes(32));
        file_put_contents($keyPath, $key);
        $databaseName = getenv('TANGENT_INSTALL_TEST_DB_NAME') ?: 'tangent_installer_test';
        $databaseHost = getenv('TANGENT_INSTALL_TEST_DB_HOST') ?: (getenv('TANGENT_TEST_DB_HOST') ?: 'mysql');
        $databasePort = getenv('TANGENT_INSTALL_TEST_DB_PORT') ?: (getenv('TANGENT_TEST_DB_PORT') ?: 3306);
        $databaseUser = getenv('TANGENT_INSTALL_TEST_DB_USER') ?: (getenv('TANGENT_TEST_DB_USER') ?: 'tangent');
        $databasePassword = getenv('TANGENT_INSTALL_TEST_DB_PASSWORD') ?: (getenv('TANGENT_TEST_DB_PASSWORD') ?: 'tangent_dev_password');
        $database = new PDO(
            'mysql:host=' . $databaseHost
                . ';port=' . $databasePort
                . ';dbname=' . $databaseName
                . ';charset=utf8mb4',
            $databaseUser,
            $databasePassword,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC],
        );

        $workspaceId = null;
        try {
            $input = [
                'db_host' => $databaseHost,
                'db_port' => (string) $databasePort,
                'db_name' => $databaseName,
                'db_user' => $databaseUser,
                'db_password' => $databasePassword,
                'workspace_name' => 'Installer test workspace',
                'workspace_slug' => $slug,
                'admin_name' => 'Installer Admin',
                'admin_email' => $email,
                'admin_password' => 'install integration password 4827',
                'admin_password_confirm' => 'install integration password 4827',
                'app_url' => 'https://install.example.test',
            ];

            $workspaceId = (new InstallService(
                $keyPath,
                $configPath,
                new PdoInstallDatabase(dirname(__DIR__, 2) . '/migrations'),
            ))->install($input, $key);

            self::assertGreaterThan(0, $workspaceId);
            self::assertSame(0600, fileperms($configPath) & 0777);
            self::assertFileDoesNotExist($keyPath);
            $config = require $configPath;
            self::assertSame($workspaceId, $config['workspace_id']);

            $workspace = $database->prepare('SELECT name, slug FROM workspaces WHERE id = :id');
            $workspace->execute(['id' => $workspaceId]);
            self::assertSame([
                'name' => 'Installer test workspace',
                'slug' => $slug,
            ], $workspace->fetch());

            $admin = $database->prepare(
                'SELECT u.role, ua.email FROM users u JOIN user_accounts ua ON ua.id = u.account_id
                 WHERE u.workspace_id = :workspace_id'
            );
            $admin->execute(['workspace_id' => $workspaceId]);
            self::assertSame(['role' => 'admin', 'email' => $email], $admin->fetch());
        } finally {
            if ($workspaceId !== null) {
                $account = $database->prepare('SELECT account_id FROM users WHERE workspace_id = :id');
                $account->execute(['id' => $workspaceId]);
                $accountId = $account->fetchColumn();
                $deleteUsers = $database->prepare('DELETE FROM users WHERE workspace_id = :id');
                $deleteUsers->execute(['id' => $workspaceId]);
                if ($accountId !== false) {
                    $deleteAccount = $database->prepare('DELETE FROM user_accounts WHERE id = :id');
                    $deleteAccount->execute(['id' => $accountId]);
                }
                $deleteWorkspace = $database->prepare('DELETE FROM workspaces WHERE id = :id');
                $deleteWorkspace->execute(['id' => $workspaceId]);
            }
            foreach (glob($directory . '/.*') ?: [] as $file) {
                if (is_file($file)) {
                    unlink($file);
                }
            }
            foreach (glob($directory . '/*') ?: [] as $file) {
                if (is_file($file)) {
                    unlink($file);
                }
            }
            rmdir($directory);
        }
    }
}
