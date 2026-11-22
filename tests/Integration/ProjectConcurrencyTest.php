<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use PDO;
use Tangent\Core\AppConfig;
use Tangent\Core\Application;
use Tangent\Core\Database;
use Tangent\Core\Request;
use Tangent\Core\Response;
use Tangent\Modules\GitHub\GitHubApiClient;
use Tangent\Tests\Support\ApiTestCase;

final class ProjectConcurrencyTest extends ApiTestCase
{
    public function testProjectMetadataPatchDoesNotUndoConcurrentArchive(): void
    {
        $admin = $this->login($this->adminEmail);
        $created = $this->apiCookieRequest('POST', '/api/v1/projects', $admin['cookie'], [
            'name' => 'Concurrent project changes',
        ], $admin['csrf']);
        self::assertSame(201, $created->status, json_encode($created->body));
        $projectId = (int) $created->body['project']['id'];
        $workspaceId = $this->workspaceId;
        $this->pdo->commit();
        $this->pdo->beginTransaction();

        $snapshot = $this->pdo->prepare('SELECT name, status FROM projects WHERE workspace_id = :workspace_id AND id = :id');
        $snapshot->execute(['workspace_id' => $workspaceId, 'id' => $projectId]);
        self::assertSame(['name' => 'Concurrent project changes', 'status' => 'active'], $snapshot->fetch(PDO::FETCH_ASSOC));

        $otherPdo = $this->testDatabaseConnection();
        try {
            $archive = $otherPdo->prepare(
                "UPDATE projects SET status = 'archived', archived_from_status = 'active'
                 WHERE workspace_id = :workspace_id AND id = :id"
            );
            $archive->execute(['workspace_id' => $workspaceId, 'id' => $projectId]);

            $response = $this->apiCookieRequest(
                'PATCH',
                "/api/v1/projects/{$projectId}",
                $admin['cookie'],
                ['name' => 'Rename must conflict with archive'],
                $admin['csrf'],
            );

            self::assertSame(409, $response->status, json_encode($response->body));
            $this->pdo->rollBack();

            $current = $otherPdo->prepare('SELECT name, status FROM projects WHERE workspace_id = :workspace_id AND id = :id');
            $current->execute(['workspace_id' => $workspaceId, 'id' => $projectId]);
            self::assertSame(['name' => 'Concurrent project changes', 'status' => 'archived'], $current->fetch(PDO::FETCH_ASSOC));
        } finally {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            $this->cleanCommittedWorkspace($workspaceId);
        }
    }

    public function testGitHubRepositoryPatchRevalidatesInstallationAfterRemoteLookup(): void
    {
        $admin = $this->login($this->adminEmail);
        $created = $this->apiCookieRequest('POST', '/api/v1/projects', $admin['cookie'], [
            'name' => 'GitHub connection race',
        ], $admin['csrf']);
        self::assertSame(201, $created->status, json_encode($created->body));
        $projectId = (int) $created->body['project']['id'];
        $workspaceId = $this->workspaceId;
        $installationId = 778899;
        $installation = $this->pdo->prepare(
            'INSERT INTO github_installations (workspace_id, installation_id, account_login, connected_by)
             VALUES (:workspace_id, :installation_id, :account_login, :connected_by)'
        );
        $installation->execute([
            'workspace_id' => $workspaceId,
            'installation_id' => $installationId,
            'account_login' => 'race-org',
            'connected_by' => $this->adminId,
        ]);
        $this->pdo->commit();
        $this->pdo->beginTransaction();

        $otherPdo = $this->testDatabaseConnection();
        $client = new ProjectRaceGitHubApiClient(function () use ($otherPdo, $workspaceId, $installationId): void {
            $delete = $otherPdo->prepare(
                'DELETE FROM github_installations WHERE workspace_id = :workspace_id AND installation_id = :installation_id'
            );
            $delete->execute(['workspace_id' => $workspaceId, 'installation_id' => $installationId]);
        });
        $this->application = Application::create(
            $this->pdo,
            new AppConfig($workspaceId, false, 43200, 'http://localhost:8080', false, '123', 'test-app', 'unused'),
            $client,
        );

        try {
            $response = $this->apiCookieRequest(
                'PATCH',
                "/api/v1/projects/{$projectId}",
                $admin['cookie'],
                ['github_repository_id' => 990011],
                $admin['csrf'],
            );

            self::assertSame(422, $response->status, json_encode($response->body));
            self::assertSame('validation_failed', $response->body['error']['code']);
            $this->pdo->rollBack();

            $repositoryId = $otherPdo->prepare('SELECT github_repository_id FROM projects WHERE workspace_id = :workspace_id AND id = :id');
            $repositoryId->execute(['workspace_id' => $workspaceId, 'id' => $projectId]);
            self::assertNull($repositoryId->fetchColumn());
        } finally {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            $this->cleanCommittedWorkspace($workspaceId);
        }
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

    private function apiCookieRequest(
        string $method,
        string $path,
        string $cookie,
        array $body = [],
        ?string $csrf = null,
    ): Response {
        $headers = [];
        if ($csrf !== null) $headers['X-CSRF-Token'] = $csrf;
        return $this->application->handle(Request::json(
            $method,
            $path,
            $body,
            $headers,
            ['tangent_session' => $cookie],
        ));
    }
}

final class ProjectRaceGitHubApiClient implements GitHubApiClient
{
    public function __construct(private readonly \Closure $onRepositoryLookup)
    {
    }

    public function isConfigured(): bool
    {
        return true;
    }

    public function isUserAuthorizationConfigured(): bool
    {
        return true;
    }

    public function userAuthorizationUrl(string $state, string $redirectUri): string
    {
        return 'https://github.com/login/oauth/authorize';
    }

    public function canUserAccessInstallation(string $code, int $installationId): bool
    {
        return false;
    }

    public function verifyInstallation(int $installationId): array
    {
        return ['account' => ['login' => 'race-org']];
    }

    public function repositories(int $installationId): array
    {
        ($this->onRepositoryLookup)();
        return [[
            'id' => 990011,
            'installation_id' => $installationId,
            'owner' => 'race-org',
            'name' => 'repo',
            'full_name' => 'race-org/repo',
            'html_url' => 'https://github.com/race-org/repo',
        ]];
    }

    public function repositoryById(int $installationId, int $repositoryId): array
    {
        return $this->repositories($installationId)[0];
    }

    public function pullRequest(int $installationId, int $repositoryId, string $owner, string $repository, int $number): array
    {
        return [];
    }
}
