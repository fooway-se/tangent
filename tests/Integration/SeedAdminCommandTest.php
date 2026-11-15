<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use PDO;
use Tangent\Tests\Support\ApiTestCase;

final class SeedAdminCommandTest extends ApiTestCase
{
    public function testDevelopmentSeedCreatesTheConfiguredWorkspaceId(): void
    {
        $workspaceId = (int) $this->pdo->query('SELECT COALESCE(MAX(id), 0) + 1 FROM workspaces')->fetchColumn();
        $slug = 'seed-test-' . bin2hex(random_bytes(6));
        $email = $slug . '@example.test';
        $environment = [
            'PATH' => (string) getenv('PATH'),
            'TANGENT_ENV' => 'development',
            'TANGENT_WORKSPACE_ID' => (string) $workspaceId,
            'TANGENT_WORKSPACE_NAME' => 'Seed test workspace',
            'TANGENT_WORKSPACE_SLUG' => $slug,
            'TANGENT_DB_HOST' => getenv('TANGENT_TEST_DB_HOST') ?: 'mysql',
            'TANGENT_DB_PORT' => getenv('TANGENT_TEST_DB_PORT') ?: '3306',
            'TANGENT_DB_NAME' => getenv('TANGENT_TEST_DB_NAME') ?: 'tangent_test',
            'TANGENT_DB_USER' => getenv('TANGENT_TEST_DB_USER') ?: 'tangent',
            'TANGENT_DB_PASSWORD' => getenv('TANGENT_TEST_DB_PASSWORD') ?: 'tangent_dev_password',
        ];
        $pipes = [];
        $process = proc_open(
            [PHP_BINARY, dirname(__DIR__, 2) . '/bin/seed-admin.php'],
            [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes,
            dirname(__DIR__, 2),
            $environment,
        );

        self::assertIsResource($process);
        fwrite($pipes[0], "Seed Test Admin\n{$email}\ntest-password-with-12-plus\n");
        fclose($pipes[0]);
        $output = stream_get_contents($pipes[1]);
        $errors = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $exitCode = proc_close($process);

        $verification = new PDO(
            'mysql:host=' . (getenv('TANGENT_TEST_DB_HOST') ?: 'mysql')
                . ';port=' . (getenv('TANGENT_TEST_DB_PORT') ?: '3306')
                . ';dbname=' . (getenv('TANGENT_TEST_DB_NAME') ?: 'tangent_test')
                . ';charset=utf8mb4',
            getenv('TANGENT_TEST_DB_USER') ?: 'tangent',
            getenv('TANGENT_TEST_DB_PASSWORD') ?: 'tangent_dev_password',
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC],
        );

        try {
            self::assertSame(0, $exitCode, $output . $errors);

            $workspace = $verification->prepare('SELECT name, slug FROM workspaces WHERE id = :id');
            $workspace->execute(['id' => $workspaceId]);
            self::assertSame([
                'name' => 'Seed test workspace',
                'slug' => $slug,
            ], $workspace->fetch());

            $user = $verification->prepare(
                'SELECT workspace_id, email, role FROM users WHERE workspace_id = :workspace_id AND email = :email'
            );
            $user->execute(['workspace_id' => $workspaceId, 'email' => $email]);
            self::assertSame([
                'workspace_id' => $workspaceId,
                'email' => $email,
                'role' => 'admin',
            ], $user->fetch());
        } finally {
            $deleteUser = $verification->prepare(
                'DELETE FROM users WHERE workspace_id = :workspace_id AND email = :email'
            );
            $deleteUser->execute(['workspace_id' => $workspaceId, 'email' => $email]);
            $deleteWorkspace = $verification->prepare(
                'DELETE FROM workspaces WHERE id = :id AND slug = :slug'
            );
            $deleteWorkspace->execute(['id' => $workspaceId, 'slug' => $slug]);
        }
    }
}
