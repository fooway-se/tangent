<?php

declare(strict_types=1);

namespace Tangent\Tests\Support;

use PDO;
use PHPUnit\Framework\TestCase;
use Tangent\Core\AppConfig;
use Tangent\Core\Application;
use Tangent\Core\Database;
use Tangent\Core\Gateway;
use Tangent\Core\MigrationRunner;
use Tangent\Core\Request;
use Tangent\Core\Response;

abstract class ApiTestCase extends TestCase
{
    protected PDO $pdo;
    protected Gateway $application;
    protected int $workspaceId;
    protected int $adminId;
    protected int $developerId;
    protected string $adminEmail = 'admin@example.test';
    protected string $developerEmail = 'developer@example.test';
    protected string $password = 'correct-horse-battery';

    protected function setUp(): void
    {
        parent::setUp();

        $database = Database::connect(
            getenv('TANGENT_TEST_DB_HOST') ?: '127.0.0.1',
            (int) (getenv('TANGENT_TEST_DB_PORT') ?: 3306),
            getenv('TANGENT_TEST_DB_NAME') ?: 'tangent_test',
            getenv('TANGENT_TEST_DB_USER') ?: 'tangent',
            getenv('TANGENT_TEST_DB_PASSWORD') ?: 'tangent_dev_password',
        );
        $this->pdo = $database->pdo();
        (new MigrationRunner($this->pdo, dirname(__DIR__, 2) . '/migrations'))->migrate();
        $this->pdo->beginTransaction();

        $workspace = $this->pdo->prepare(
            'INSERT INTO workspaces (name, slug) VALUES (:name, :slug)'
        );
        $workspace->execute(['name' => 'Test workspace', 'slug' => 'test-workspace-' . bin2hex(random_bytes(3))]);
        $this->workspaceId = (int) $this->pdo->lastInsertId();

        $this->adminId = $this->insertUser($this->adminEmail, 'Admin', 'admin');
        $this->developerId = $this->insertUser($this->developerEmail, 'Developer', 'developer');
        $this->application = Application::create($this->pdo, new AppConfig($this->workspaceId, false));
    }

    protected function tearDown(): void
    {
        if (isset($this->pdo) && $this->pdo->inTransaction()) {
            $this->pdo->rollBack();
        }

        parent::tearDown();
    }

    protected function request(
        string $method,
        string $path,
        array $body = [],
        array $headers = [],
        array $cookies = [],
        string $remoteAddress = '127.0.0.1',
    ): Response {
        return $this->application->handle(
            Request::json($method, $path, $body, $headers, $cookies, $remoteAddress)
        );
    }

    /** @return array{cookie: string, csrf: string, user: array<string, mixed>, set_cookies: list<string>} */
    protected function login(string $email, ?string $password = null): array
    {
        $response = $this->request('POST', '/api/v1/auth/login', [
            'email' => $email,
            'password' => $password ?? $this->password,
        ]);

        self::assertSame(200, $response->status, json_encode($response->body));
        $sessionCookie = $this->cookieValue($response, 'tangent_session');
        $csrfCookie = $this->cookieValue($response, 'tangent_csrf');

        return [
            'cookie' => $sessionCookie,
            'csrf' => $csrfCookie,
            'user' => $response->body['user'],
            'set_cookies' => (array) ($response->headers['set-cookie'] ?? []),
        ];
    }

    protected function cookieRequest(
        string $method,
        string $path,
        string $cookie,
        array $body = [],
        ?string $csrf = null,
    ): Response {
        $headers = [];
        if ($csrf !== null) {
            $headers['X-CSRF-Token'] = $csrf;
        }

        return $this->request(
            $method,
            $path,
            $body,
            $headers,
            ['tangent_session' => $cookie],
        );
    }

    protected function insertProject(string $name, string $slug, int $createdBy): int
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO projects (workspace_id, name, slug, description, status, created_by)
             VALUES (:workspace_id, :name, :slug, :description, :status, :created_by)'
        );
        $statement->execute([
            'workspace_id' => $this->workspaceId,
            'name' => $name,
            'slug' => $slug,
            'description' => '',
            'status' => 'active',
            'created_by' => $createdBy,
        ]);
        $projectId = (int) $this->pdo->lastInsertId();

        $membership = $this->pdo->prepare(
            'INSERT INTO project_memberships (workspace_id, project_id, user_id)
             VALUES (:workspace_id, :project_id, :user_id)'
        );
        $membership->execute([
            'workspace_id' => $this->workspaceId,
            'project_id' => $projectId,
            'user_id' => $createdBy,
        ]);

        return $projectId;
    }

    private function insertUser(string $email, string $name, string $role): int
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO users (workspace_id, name, email, password_hash, role, is_active)
             VALUES (:workspace_id, :name, :email, :password_hash, :role, 1)'
        );
        $statement->execute([
            'workspace_id' => $this->workspaceId,
            'name' => $name,
            'email' => $email,
            'password_hash' => password_hash($this->password, PASSWORD_DEFAULT),
            'role' => $role,
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    private function cookieValue(Response $response, string $name): string
    {
        foreach ((array) ($response->headers['set-cookie'] ?? []) as $cookie) {
            if (preg_match('/(?:^|;\s*)' . preg_quote($name, '/') . '=([^;]*)/', $cookie, $matches)) {
                return rawurldecode($matches[1]);
            }
        }

        self::fail("Expected {$name} cookie in login response");
    }
}
