<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use PDO;
use Tangent\Core\AppConfig;
use Tangent\Core\Application;
use Tangent\Core\Database;
use Tangent\Core\Gateway;
use Tangent\Core\Request;
use Tangent\Core\Response;
use Tangent\Tests\Support\ApiTestCase;
use Tangent\Tests\Support\RecordingMailer;

final class AuthConcurrencyTest extends ApiTestCase
{
    public function testOldPasswordLoginCannotCreateSessionAfterPasswordResetCommits(): void
    {
        $admin = $this->login($this->adminEmail);
        $workspaceId = $this->workspaceId;
        $this->pdo->commit();
        $this->pdo->beginTransaction();
        $snapshot = $this->pdo->prepare(
            'SELECT ua.password_hash FROM user_accounts ua INNER JOIN users u ON u.account_id = ua.id
             WHERE u.workspace_id = :workspace_id AND u.id = :user_id'
        );
        $snapshot->execute(['workspace_id' => $workspaceId, 'user_id' => $this->adminId]);
        $oldHash = (string) $snapshot->fetchColumn();
        self::assertTrue(password_verify($this->password, $oldHash));

        $otherPdo = $this->testDatabaseConnection();
        try {
            [$otherApplication] = $this->resetPasswordOnSecondConnection($otherPdo, $workspaceId, $admin);
            $lateLogin = $this->apiRequest('POST', '/api/v1/auth/login', [
                'email' => $this->adminEmail,
                'password' => $this->password,
            ]);
            $this->pdo->commit();

            self::assertSame(401, $lateLogin->status, json_encode($lateLogin->body));
            self::assertSame(401, $this->loginOnApplication($otherApplication, $this->adminEmail, $this->password)->status);
            self::assertSame(200, $this->loginOnApplication(
                $otherApplication,
                $this->adminEmail,
                'an entirely new password phrase',
            )->status);
        } finally {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            $this->cleanCommittedWorkspace($workspaceId);
        }
    }

    public function testLateLoginCannotOverwriteResetPasswordThroughLegacyHashUpgrade(): void
    {
        $admin = $this->login($this->adminEmail);
        $legacyHash = password_hash($this->password, PASSWORD_BCRYPT);
        $legacy = $this->pdo->prepare('UPDATE user_accounts SET password_hash = :hash WHERE email = :email');
        $legacy->execute(['hash' => $legacyHash, 'email' => $this->adminEmail]);
        $workspaceId = $this->workspaceId;
        $this->pdo->commit();
        $this->pdo->beginTransaction();
        $snapshot = $this->pdo->prepare(
            'SELECT ua.password_hash FROM user_accounts ua INNER JOIN users u ON u.account_id = ua.id
             WHERE u.workspace_id = :workspace_id AND u.id = :user_id'
        );
        $snapshot->execute(['workspace_id' => $workspaceId, 'user_id' => $this->adminId]);
        self::assertSame($legacyHash, $snapshot->fetchColumn());

        $otherPdo = $this->testDatabaseConnection();
        try {
            [$otherApplication] = $this->resetPasswordOnSecondConnection($otherPdo, $workspaceId, $admin);
            $lateLogin = $this->apiRequest('POST', '/api/v1/auth/login', [
                'email' => $this->adminEmail,
                'password' => $this->password,
            ]);
            $this->pdo->commit();

            self::assertSame(401, $lateLogin->status, json_encode($lateLogin->body));
            $credential = $otherPdo->prepare('SELECT password_hash FROM user_accounts WHERE email = :email');
            $credential->execute(['email' => $this->adminEmail]);
            $currentHash = (string) $credential->fetchColumn();
            self::assertFalse(password_verify($this->password, $currentHash));
            self::assertTrue(password_verify('an entirely new password phrase', $currentHash));
            self::assertSame(200, $this->loginOnApplication(
                $otherApplication,
                $this->adminEmail,
                'an entirely new password phrase',
            )->status);
        } finally {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            $this->cleanCommittedWorkspace($workspaceId);
        }
    }

    /** @return array{Gateway, RecordingMailer} */
    private function resetPasswordOnSecondConnection(PDO $pdo, int $workspaceId, array $admin): array
    {
        $mailer = new RecordingMailer();
        $application = Application::create($pdo, new AppConfig($workspaceId, false), null, $mailer);
        $generated = $application->handle(Request::json(
            'POST',
            '/api/v1/users/' . $this->adminId . '/password-reset',
            [],
            ['X-CSRF-Token' => $admin['csrf']],
            ['tangent_session' => $admin['cookie']],
        ));
        self::assertSame(200, $generated->status, json_encode($generated->body));
        preg_match('/#reset=([a-f0-9]{64})/', $mailer->messages[0]['body'], $tokenMatch);
        self::assertArrayHasKey(1, $tokenMatch);

        $completed = $application->handle(Request::json(
            'POST',
            '/api/v1/auth/password-reset/complete',
            ['token' => $tokenMatch[1], 'password' => 'an entirely new password phrase'],
        ));
        self::assertSame(204, $completed->status, json_encode($completed->body));
        return [$application, $mailer];
    }

    private function loginOnApplication(Gateway $application, string $email, string $password): Response
    {
        return $application->handle(Request::json('POST', '/api/v1/auth/login', [
            'email' => $email,
            'password' => $password,
        ]));
    }

    private function apiRequest(string $method, string $path, array $body = []): Response
    {
        return $this->application->handle(Request::json($method, $path, $body));
    }

    private function testDatabaseConnection(): PDO
    {
        return Database::connect(
            getenv('TANGENT_TEST_DB_HOST') ?: '127.0.0.1',
            (int) (getenv('TANGENT_TEST_DB_PORT') ?: 3306),
            getenv('TANGENT_TEST_DB_NAME') ?: 'tangent_test_suite',
            getenv('TANGENT_TEST_DB_USER') ?: 'tangent',
            getenv('TANGENT_TEST_DB_PASSWORD') ?: 'tangent_dev_password',
        )->pdo();
    }

    private function cleanCommittedWorkspace(int $workspaceId): void
    {
        $cleanup = $this->testDatabaseConnection();
        $accounts = $cleanup->prepare('SELECT account_id FROM users WHERE workspace_id = :workspace_id');
        $accounts->execute(['workspace_id' => $workspaceId]);
        $accountIds = array_map('intval', $accounts->fetchAll(PDO::FETCH_COLUMN));

        $cleanup->exec('SET FOREIGN_KEY_CHECKS = 0');
        $tables = $cleanup->query(
            'SELECT TABLE_NAME FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = \'workspace_id\'
             GROUP BY TABLE_NAME'
        )->fetchAll(PDO::FETCH_COLUMN);
        foreach ($tables as $table) {
            $cleanup->prepare('DELETE FROM `' . str_replace('`', '``', (string) $table) . '` WHERE workspace_id = :workspace_id')
                ->execute(['workspace_id' => $workspaceId]);
        }
        $cleanup->prepare('DELETE FROM workspaces WHERE id = :id')->execute(['id' => $workspaceId]);
        foreach ($accountIds as $accountId) {
            $cleanup->prepare('DELETE FROM user_accounts WHERE id = :id')->execute(['id' => $accountId]);
        }
        $cleanup->exec('SET FOREIGN_KEY_CHECKS = 1');
    }
}
