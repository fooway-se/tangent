<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use Tangent\Core\ApiException;
use Tangent\Core\AppConfig;
use Tangent\Core\Application;
use Tangent\Core\Database;
use Tangent\Core\Request;
use Tangent\Core\Response;
use Tangent\Modules\GitHub\GitHubApiClient;
use Tangent\Modules\GitHub\GitHubInstallationRepository;
use Tangent\Tests\Support\ApiTestCase;

final class GitHubTrackingTest extends ApiTestCase
{
    public function testProjectSaveUsesSelectedInstallationWithoutListingRepositoryPages(): void
    {
        $admin = $this->login($this->adminEmail);
        $repository = [
            'id' => 7654321,
            'owner' => 'test-org',
            'name' => 'test-repo',
            'full_name' => 'test-org/test-repo',
            'html_url' => 'https://github.com/test-org/test-repo',
        ];
        $client = new FakeGitHubApiClient($repository, []);
        $installation = $this->pdo->prepare(
            'INSERT INTO github_installations (workspace_id, installation_id, account_login, connected_by)
             VALUES (:workspace_id, :installation_id, :account_login, :connected_by)'
        );
        $installation->execute([
            'workspace_id' => $this->workspaceId,
            'installation_id' => 445566,
            'account_login' => 'test-org',
            'connected_by' => $this->adminId,
        ]);
        $this->application = Application::create(
            $this->pdo,
            new AppConfig($this->workspaceId, false, 43200, 'http://localhost:8080', false, '123', 'test-app'),
            $client,
        );

        $created = $this->cookieRequest('POST', '/api/v1/projects', $admin['cookie'], [
            'name' => 'Targeted GitHub project',
            'github_installation_id' => 445566,
            'github_repository_id' => 7654321,
            'github_repository_owner' => 'test-org',
            'github_repository_name' => 'test-repo',
        ], $admin['csrf']);
        self::assertSame(201, $created->status, json_encode($created->body));
        self::assertSame(0, $client->repositoryCatalogueCalls);
        self::assertSame(1, $client->targetedRepositoryCalls);
        self::assertSame([445566, 7654321, 'test-org', 'test-repo'], $client->targetedRepositoryLookups[0]);

        $projectId = (int) $created->body['project']['id'];
        $updated = $this->cookieRequest('PATCH', "/api/v1/projects/{$projectId}", $admin['cookie'], [
            'github_installation_id' => 445566,
            'github_repository_id' => 7654321,
            'github_repository_owner' => 'test-org',
            'github_repository_name' => 'test-repo',
        ], $admin['csrf']);
        self::assertSame(200, $updated->status, json_encode($updated->body));
        self::assertSame(2, $client->targetedRepositoryCalls);
        self::assertSame([445566, 7654321, 'test-org', 'test-repo'], $client->targetedRepositoryLookups[1]);
        self::assertSame(0, $client->repositoryCatalogueCalls);

        $unavailableInstallation = $this->cookieRequest('POST', '/api/v1/projects', $admin['cookie'], [
            'name' => 'Unauthorized GitHub project',
            'github_installation_id' => 445567,
            'github_repository_id' => 7654321,
            'github_repository_owner' => 'test-org',
            'github_repository_name' => 'test-repo',
        ], $admin['csrf']);
        self::assertSame(422, $unavailableInstallation->status, json_encode($unavailableInstallation->body));
        self::assertSame(2, $client->targetedRepositoryCalls, 'An unconnected installation is rejected before GitHub is contacted.');

        $client->repositoryAvailable = false;
        $unavailableRepository = $this->cookieRequest('POST', '/api/v1/projects', $admin['cookie'], [
            'name' => 'Unavailable GitHub repository',
            'github_installation_id' => 445566,
            'github_repository_id' => 7654322,
            'github_repository_owner' => 'other-org',
            'github_repository_name' => 'other-repo',
        ], $admin['csrf']);
        self::assertSame(422, $unavailableRepository->status, json_encode($unavailableRepository->body));
        self::assertSame(3, $client->targetedRepositoryCalls);
        self::assertSame(0, $client->repositoryCatalogueCalls);
    }

    public function testRejectedStaleWebhookUpdateDoesNotCreateAnInboxEvent(): void
    {
        $pdo = Database::connect(
            getenv('TANGENT_TEST_DB_HOST') ?: '127.0.0.1',
            (int) (getenv('TANGENT_TEST_DB_PORT') ?: 3306),
            getenv('TANGENT_TEST_DB_NAME') ?: 'tangent_test_suite',
            getenv('TANGENT_TEST_DB_USER') ?: 'tangent',
            getenv('TANGENT_TEST_DB_PASSWORD') ?: 'tangent_dev_password',
        )->pdo();
        $suffix = bin2hex(random_bytes(5));
        $slug = 'webhook-race-' . $suffix;
        $secret = 'webhook-race-secret';
        $installationId = random_int(7000000, 7999999);
        $repositoryId = random_int(8000000, 8999999);
        $pdo->beginTransaction();
        $workspace = $pdo->prepare('INSERT INTO workspaces (name, slug) VALUES (:name, :slug)');
        $workspace->execute(['name' => 'Webhook race test', 'slug' => $slug]);
        $workspaceId = (int) $pdo->lastInsertId();
        $email = $slug . '@example.test';
        $account = $pdo->prepare('INSERT INTO user_accounts (email, password_hash) VALUES (:email, :password_hash)');
        $account->execute(['email' => $email, 'password_hash' => password_hash('webhook race password', PASSWORD_ARGON2ID)]);
        $accountId = (int) $pdo->lastInsertId();
        $user = $pdo->prepare(
            "INSERT INTO users (workspace_id, account_id, name, email, role, is_active)
             VALUES (:workspace_id, :account_id, 'Webhook race admin', :email, 'admin', 1)",
        );
        $user->execute(['workspace_id' => $workspaceId, 'account_id' => $accountId, 'email' => $email]);
        $userId = (int) $pdo->lastInsertId();
        $installation = $pdo->prepare(
            'INSERT INTO github_installations (workspace_id, installation_id, account_login, connected_by)
             VALUES (:workspace_id, :installation_id, :account_login, :connected_by)',
        );
        $installation->execute([
            'workspace_id' => $workspaceId,
            'installation_id' => $installationId,
            'account_login' => 'webhook-race-org',
            'connected_by' => $userId,
        ]);
        $project = $pdo->prepare(
            'INSERT INTO projects
                (workspace_id, name, slug, description, status, created_by, github_installation_id,
                 github_repository_id, github_repository_owner, github_repository_name,
                 github_repository_full_name, github_repository_url)
             VALUES (:workspace_id, :name, :slug, :description, :status, :created_by, :installation_id,
                 :repository_id, :owner, :repository, :full_name, :url)',
        );
        $project->execute([
            'workspace_id' => $workspaceId,
            'name' => 'Webhook race project',
            'slug' => 'webhook-race-project',
            'description' => '',
            'status' => 'active',
            'created_by' => $userId,
            'installation_id' => $installationId,
            'repository_id' => $repositoryId,
            'owner' => 'webhook-race-org',
            'repository' => 'webhook-race-repo',
            'full_name' => 'webhook-race-org/webhook-race-repo',
            'url' => 'https://github.com/webhook-race-org/webhook-race-repo',
        ]);
        $projectId = (int) $pdo->lastInsertId();
        $issue = $pdo->prepare(
            "INSERT INTO issues (workspace_id, project_id, title, description, status, created_by)
             VALUES (:workspace_id, :project_id, 'Webhook race issue', '', 'backlog', :created_by)",
        );
        $issue->execute(['workspace_id' => $workspaceId, 'project_id' => $projectId, 'created_by' => $userId]);
        $issueId = (int) $pdo->lastInsertId();
        $pullRequest = $pdo->prepare(
            "INSERT INTO issue_pull_requests
                (workspace_id, project_id, issue_id, github_installation_id, github_repository_id,
                 repository_owner, repository_name, repository_full_name, pull_number, title, html_url,
                 state, is_draft, author_login, github_updated_at, linked_by)
             VALUES (:workspace_id, :project_id, :issue_id, :installation_id, :repository_id,
                 'webhook-race-org', 'webhook-race-repo', 'webhook-race-org/webhook-race-repo', 9,
                 'Initial title', 'https://github.com/webhook-race-org/webhook-race-repo/pull/9',
                 'open', 0, 'author', '2026-11-18 10:00:00', :linked_by)",
        );
        $pullRequest->execute([
            'workspace_id' => $workspaceId,
            'project_id' => $projectId,
            'issue_id' => $issueId,
            'installation_id' => $installationId,
            'repository_id' => $repositoryId,
            'linked_by' => $userId,
        ]);
        $pullRequestId = (int) $pdo->lastInsertId();
        $pdo->commit();

        $pdo->beginTransaction();
        $advanceTimestamp = $pdo->prepare(
            'UPDATE issue_pull_requests SET github_updated_at = :updated_at WHERE id = :id',
        );
        $advanceTimestamp->execute(['updated_at' => '2026-11-18 10:13:00', 'id' => $pullRequestId]);

        $directory = sys_get_temp_dir() . '/github-webhook-race-' . $suffix;
        mkdir($directory, 0700, true);
        $payloadPath = $directory . '/payload.json';
        $resultPath = $directory . '/result.json';
        $connectionPath = $directory . '/connection-id';
        $payload = [
            'action' => 'closed',
            'installation' => ['id' => $installationId],
            'repository' => ['id' => $repositoryId, 'full_name' => 'webhook-race-org/webhook-race-repo'],
            'pull_request' => [
                'number' => 9,
                'title' => 'Stale webhook title',
                'html_url' => 'https://github.com/webhook-race-org/webhook-race-repo/pull/9',
                'state' => 'closed',
                'merged_at' => null,
                'draft' => false,
                'user' => ['login' => 'author'],
                'updated_at' => '2026-11-18T10:12:00Z',
            ],
        ];
        $rawBody = json_encode($payload, JSON_THROW_ON_ERROR);
        file_put_contents($payloadPath, $rawBody);
        $childCode = <<<'PHP'
require getcwd() . '/vendor/autoload.php';
$database = Tangent\Core\Database::connect(
    getenv('TANGENT_TEST_DB_HOST') ?: '127.0.0.1',
    (int) (getenv('TANGENT_TEST_DB_PORT') ?: 3306),
    getenv('TANGENT_TEST_DB_NAME') ?: 'tangent_test_suite',
    getenv('TANGENT_TEST_DB_USER') ?: 'tangent',
    getenv('TANGENT_TEST_DB_PASSWORD') ?: 'tangent_dev_password',
);
$pdo = $database->pdo();
file_put_contents($argv[4], (string) $pdo->query('SELECT CONNECTION_ID()')->fetchColumn());
$rawBody = file_get_contents($argv[2]);
$payload = json_decode($rawBody, true, flags: JSON_THROW_ON_ERROR);
$config = new Tangent\Core\AppConfig((int) $argv[1], false, 43200, 'http://localhost:8080', false, '', '', '', $argv[3]);
$app = Tangent\Core\Application::create($pdo, $config);
$response = $app->handle(Tangent\Core\Request::json('POST', '/api/v1/github/webhook', $payload, [
    'X-Hub-Signature-256' => 'sha256=' . hash_hmac('sha256', $rawBody, $argv[3]),
    'X-GitHub-Delivery' => 'race-' . bin2hex(random_bytes(8)),
    'X-GitHub-Event' => 'pull_request',
], [], '127.0.0.1', [], $rawBody));
file_put_contents($argv[5], json_encode(['status' => $response->status, 'body' => $response->body], JSON_THROW_ON_ERROR));
PHP;
        $pipes = [];
        $child = proc_open(
            [PHP_BINARY, '-r', $childCode, (string) $workspaceId, $payloadPath, $secret, $connectionPath, $resultPath],
            [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes,
            dirname(__DIR__, 2),
        );

        try {
            self::assertIsResource($child, 'Could not start the webhook process.');
            fclose($pipes[0]);
            $this->waitForWebhookUpdateStatement($pdo, $connectionPath);
            $pdo->commit();
            $output = stream_get_contents($pipes[1]);
            $error = stream_get_contents($pipes[2]);
            fclose($pipes[1]);
            fclose($pipes[2]);
            self::assertSame(0, proc_close($child), trim($output . "\n" . $error));
            $response = json_decode((string) file_get_contents($resultPath), true, flags: JSON_THROW_ON_ERROR);
            self::assertSame(202, $response['status']);
            $events = $pdo->prepare(
                "SELECT COUNT(*) FROM inbox_events WHERE workspace_id = :workspace_id AND event_type = 'pr'",
            );
            $events->execute(['workspace_id' => $workspaceId]);
            self::assertSame(0, (int) $events->fetchColumn(), 'A rejected timestamp-guarded write must not notify users.');
        } finally {
            if ($pdo->inTransaction()) $pdo->rollBack();
            if (is_resource($child)) {
                proc_terminate($child);
                fclose($pipes[1]);
                fclose($pipes[2]);
                proc_close($child);
            }
            $pdo->prepare('DELETE FROM inbox_events WHERE workspace_id = :workspace_id')->execute(['workspace_id' => $workspaceId]);
            $pdo->prepare('DELETE FROM github_installations WHERE workspace_id = :workspace_id')->execute(['workspace_id' => $workspaceId]);
            $pdo->prepare('DELETE FROM projects WHERE workspace_id = :workspace_id')->execute(['workspace_id' => $workspaceId]);
            $pdo->prepare('DELETE FROM users WHERE workspace_id = :workspace_id')->execute(['workspace_id' => $workspaceId]);
            $pdo->prepare('DELETE FROM workspaces WHERE id = :workspace_id')->execute(['workspace_id' => $workspaceId]);
            $pdo->prepare('DELETE FROM user_accounts WHERE id = :account_id')->execute(['account_id' => $accountId]);
            foreach (glob($directory . '/*') ?: [] as $file) @unlink($file);
            @rmdir($directory);
        }
    }

    public function testGitHubInstallationCallbackDoesNotAssociateBeforeUserAuthorization(): void
    {
        [$state, $installationCallback] = $this->startGitHubInstallationSetup(new FakeGitHubApiClient([], []));

        self::assertSame(302, $installationCallback->status);
        self::assertSame(
            'https://github.com/login/oauth/authorize?client_id=test-client&redirect_uri=https%3A%2F%2Ftangent.example%2Fapi%2Fv1%2Fgithub%2Fsetup%2Fauthorize&state=' . $state,
            $installationCallback->headers['location'] ?? null,
        );
        self::assertSame(0, $this->installationCount(445566), 'The App callback alone must not associate an installation.');
    }

    public function testGitHubInstallationAssociationRequiresOAuthUserAccessAndConsumesStateOnce(): void
    {
        $client = new FakeGitHubApiClient([], []);
        $client->userCanAccessInstallation = true;
        [$state, , $admin] = $this->startGitHubInstallationSetup($client);

        $authorized = $this->githubOAuthCallback($admin['cookie'], $state, 'github-code');
        self::assertSame(302, $authorized->status);
        self::assertSame('https://tangent.example/app.html?github=connected', $authorized->headers['location'] ?? null);
        self::assertSame(1, $this->installationCount(445566));
        self::assertSame(1, $client->authorizationChecks);

        $replay = $this->githubOAuthCallback($admin['cookie'], $state, 'github-code');
        self::assertSame(403, $replay->status, 'A completed OAuth state cannot be reused.');
        self::assertSame(1, $this->installationCount(445566));
    }

    public function testGitHubInstallationCannotBeAssociatedWhenOAuthUserLacksAccess(): void
    {
        $client = new FakeGitHubApiClient([], []);
        $client->userCanAccessInstallation = false;
        [$state, , $admin] = $this->startGitHubInstallationSetup($client);

        $unauthorized = $this->githubOAuthCallback($admin['cookie'], $state, 'github-code');

        self::assertSame(403, $unauthorized->status);
        self::assertSame(0, $this->installationCount(445566));
    }

    public function testGitHubOAuthSetupStateIsBoundToTheInitiatingBrowserSession(): void
    {
        [$state] = $this->startGitHubInstallationSetup(new FakeGitHubApiClient([], []), false);
        $secondSession = $this->login($this->adminEmail);

        $unauthorized = $this->githubInstallationCallback($secondSession['cookie'], $state);

        self::assertSame(403, $unauthorized->status);
        self::assertSame(0, $this->installationCount(445566));
    }

    public function testExpiredGitHubOAuthSetupStateCannotAssociateAnInstallation(): void
    {
        [$state, , $admin] = $this->startGitHubInstallationSetup(new FakeGitHubApiClient([], []));
        $expire = $this->pdo->prepare(
            'UPDATE github_installation_states SET expires_at = UTC_TIMESTAMP() - INTERVAL 1 SECOND WHERE state_hash = :state_hash'
        );
        $expire->execute(['state_hash' => hash('sha256', $state)]);

        $expired = $this->githubOAuthCallback($admin['cookie'], $state, 'github-code');

        self::assertSame(403, $expired->status);
        self::assertSame(0, $this->installationCount(445566));
    }

    public function testConcurrentGitHubInstallationClaimCannotChangeTheWorkspaceOwner(): void
    {
        $this->pdo->query('SELECT workspace_id FROM github_installations WHERE installation_id = 445566')->fetchColumn();
        $otherPdo = Database::connect(
            getenv('TANGENT_TEST_DB_HOST') ?: '127.0.0.1',
            (int) (getenv('TANGENT_TEST_DB_PORT') ?: 3306),
            getenv('TANGENT_TEST_DB_NAME') ?: 'tangent_test_suite',
            getenv('TANGENT_TEST_DB_USER') ?: 'tangent',
            getenv('TANGENT_TEST_DB_PASSWORD') ?: 'tangent_dev_password',
        )->pdo();
        $otherPdo->beginTransaction();
        try {
            $workspace = $otherPdo->prepare('INSERT INTO workspaces (name, slug) VALUES (:name, :slug)');
            $workspace->execute(['name' => 'Concurrent GitHub owner', 'slug' => 'github-owner-' . bin2hex(random_bytes(4))]);
            $otherWorkspaceId = (int) $otherPdo->lastInsertId();
            $ownerEmail = 'github-owner-' . bin2hex(random_bytes(4)) . '@example.test';
            $account = $otherPdo->prepare('INSERT INTO user_accounts (email, password_hash) VALUES (:email, :password_hash)');
            $account->execute([
                'email' => $ownerEmail,
                'password_hash' => password_hash('github owner secure password', PASSWORD_ARGON2ID),
            ]);
            $accountId = (int) $otherPdo->lastInsertId();
            $membership = $otherPdo->prepare(
                'INSERT INTO users (workspace_id, account_id, name, email, role, is_active)
                 VALUES (:workspace_id, :account_id, :name, :email, :role, 1)'
            );
            $membership->execute([
                'workspace_id' => $otherWorkspaceId,
                'account_id' => $accountId,
                'name' => 'GitHub Owner',
                'email' => $ownerEmail,
                'role' => 'admin',
            ]);
            $otherUserId = (int) $otherPdo->lastInsertId();
            $installation = $otherPdo->prepare(
                'INSERT INTO github_installations (workspace_id, installation_id, account_login, connected_by)
                 VALUES (:workspace_id, :installation_id, :account_login, :connected_by)'
            );
            $installation->execute([
                'workspace_id' => $otherWorkspaceId,
                'installation_id' => 445566,
                'account_login' => 'original-owner',
                'connected_by' => $otherUserId,
            ]);
            $otherPdo->commit();

            try {
                (new GitHubInstallationRepository($this->pdo))->add($this->workspaceId, 445566, 'replacement-owner', $this->adminId);
                self::fail('A concurrent installation claim must not succeed for a second workspace.');
            } catch (ApiException $exception) {
                self::assertSame(409, $exception->status);
            }

            $owner = $otherPdo->prepare('SELECT workspace_id, account_login, connected_by FROM github_installations WHERE installation_id = 445566');
            $owner->execute();
            $ownerData = $owner->fetch(\PDO::FETCH_ASSOC);
            self::assertSame($otherWorkspaceId, (int) $ownerData['workspace_id']);
            self::assertSame('original-owner', $ownerData['account_login']);
            self::assertSame($otherUserId, (int) $ownerData['connected_by']);
        } finally {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            if ($otherPdo->inTransaction()) $otherPdo->rollBack();
            if (isset($otherWorkspaceId, $accountId)) {
                $cleanup = Database::connect(
                    getenv('TANGENT_TEST_DB_HOST') ?: '127.0.0.1',
                    (int) (getenv('TANGENT_TEST_DB_PORT') ?: 3306),
                    getenv('TANGENT_TEST_DB_NAME') ?: 'tangent_test_suite',
                    getenv('TANGENT_TEST_DB_USER') ?: 'tangent',
                    getenv('TANGENT_TEST_DB_PASSWORD') ?: 'tangent_dev_password',
                )->pdo();
                $cleanup->beginTransaction();
                $cleanup->prepare('DELETE FROM github_installations WHERE installation_id = 445566')->execute();
                $cleanup->prepare('DELETE FROM users WHERE workspace_id = :workspace_id')->execute(['workspace_id' => $otherWorkspaceId]);
                $cleanup->prepare('DELETE FROM workspaces WHERE id = :id')->execute(['id' => $otherWorkspaceId]);
                $cleanup->prepare('DELETE FROM user_accounts WHERE id = :id')->execute(['id' => $accountId]);
                $cleanup->commit();
            }
        }
    }

    public function testAdminCanConnectRepositoryLinkPullRequestAndReceiveSignedUpdates(): void
    {
        $admin = $this->login($this->adminEmail);
        $secret = 'tracking-webhook-secret';
        $client = new FakeGitHubApiClient(
            [
                'id' => 7654321,
                'installation_id' => 445566,
                'owner' => 'test-org',
                'name' => 'test-repo',
                'full_name' => 'test-org/test-repo',
                'html_url' => 'https://github.com/test-org/test-repo',
            ],
            [
                'number' => 17,
                'title' => 'Add project integration',
                'html_url' => 'https://github.com/test-org/test-repo/pull/17',
                'state' => 'open',
                'merged_at' => null,
                'draft' => true,
                'user' => ['login' => 'developer-one'],
                'updated_at' => '2026-11-18T10:00:00Z',
            ],
        );
        $installation = $this->pdo->prepare(
            'INSERT INTO github_installations (workspace_id, installation_id, account_login, connected_by)
             VALUES (:workspace_id, :installation_id, :account_login, :connected_by)'
        );
        $installation->execute([
            'workspace_id' => $this->workspaceId,
            'installation_id' => 445566,
            'account_login' => 'test-org',
            'connected_by' => $this->adminId,
        ]);
        $this->application = Application::create(
            $this->pdo,
            new AppConfig($this->workspaceId, false, 43200, 'http://localhost:8080', false, '123', 'test-app', 'unused', $secret),
            $client,
        );

        $createdProject = $this->cookieRequest('POST', '/api/v1/projects', $admin['cookie'], [
            'name' => 'GitHub tracked project',
            'github_repository_id' => 7654321,
        ], $admin['csrf']);
        self::assertSame(201, $createdProject->status, json_encode($createdProject->body));
        self::assertSame('test-org/test-repo', $createdProject->body['project']['github_repository']['full_name']);
        $projectId = (int) $createdProject->body['project']['id'];
        $guestId = $this->createUser($admin, 'Customer', 'customer@example.test', 'guest');
        $this->addMember($admin, $projectId, $guestId);
        $guest = $this->login('customer@example.test');
        $guestProjects = $this->cookieRequest('GET', '/api/v1/projects', $guest['cookie']);
        self::assertSame(200, $guestProjects->status);
        self::assertSame([$projectId], array_column($guestProjects->body['projects'], 'id'));
        self::assertArrayNotHasKey('github_repository', $guestProjects->body['projects'][0]);

        $createdIssue = $this->cookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/issues",
            $admin['cookie'],
            ['title' => 'Track this pull request'],
            $admin['csrf'],
        );
        self::assertSame(201, $createdIssue->status, json_encode($createdIssue->body));
        $issueId = (int) $createdIssue->body['issue']['id'];

        $wrongRepository = $this->cookieRequest(
            'POST',
            "/api/v1/issues/{$issueId}/pull-requests",
            $admin['cookie'],
            ['url' => 'https://github.com/other-org/other-repo/pull/17'],
            $admin['csrf'],
        );
        self::assertSame(422, $wrongRepository->status);
        $historicalTarget = $this->createHistoricalPullRequestTarget(7654321, 17, 556677);
        $linked = $this->cookieRequest(
            'POST',
            "/api/v1/issues/{$issueId}/pull-requests",
            $admin['cookie'],
            ['url' => 'https://github.com/test-org/test-repo/pull/17'],
            $admin['csrf'],
        );
        self::assertSame(201, $linked->status, json_encode($linked->body));
        self::assertSame('open', $linked->body['pull_request']['state']);
        self::assertTrue($linked->body['pull_request']['is_draft']);
        self::assertSame(404, $this->cookieRequest('GET', "/api/v1/issues/{$issueId}/pull-requests", $guest['cookie'])->status);

        $webhookPayload = [
            'action' => 'closed',
            'installation' => ['id' => 445566],
            'repository' => ['id' => 7654321, 'full_name' => 'test-org/test-repo'],
            'pull_request' => [
                'number' => 17,
                'title' => 'Add project integration',
                'html_url' => 'https://github.com/test-org/test-repo/pull/17',
                'state' => 'closed',
                'merged_at' => '2026-11-18T10:12:00Z',
                'draft' => false,
                'user' => ['login' => 'developer-one'],
                'updated_at' => '2026-11-18T10:12:00Z',
            ],
        ];
        $rawBody = json_encode($webhookPayload, JSON_THROW_ON_ERROR);
        $webhook = $this->webhookRequest($rawBody, $webhookPayload, [
            'X-Hub-Signature-256' => 'sha256=' . hash_hmac('sha256', $rawBody, $secret),
            'X-GitHub-Delivery' => 'delivery-test-merged',
            'X-GitHub-Event' => 'pull_request',
        ]);
        self::assertSame(202, $webhook->status, json_encode($webhook->body));
        $reloaded = $this->cookieRequest('GET', "/api/v1/issues/{$issueId}/pull-requests", $admin['cookie']);
        self::assertSame('merged', $reloaded->body['pull_requests'][0]['state']);
        $historicalState = $this->pdo->prepare('SELECT state FROM issue_pull_requests WHERE id = :id');
        $historicalState->execute(['id' => $historicalTarget['pull_request_id']]);
        self::assertSame('open', $historicalState->fetchColumn(), 'A webhook from the current installation must not update an old workspace link.');
        $eventCount = $this->pdo->prepare(
            "SELECT COUNT(*) FROM inbox_events WHERE workspace_id = :workspace_id AND recipient_id = :recipient_id AND event_type = 'pr'"
        );
        $eventCount->execute(['workspace_id' => $this->workspaceId, 'recipient_id' => $this->adminId]);
        self::assertSame(1, (int) $eventCount->fetchColumn());
        $eventCount->execute(['workspace_id' => $this->workspaceId, 'recipient_id' => $guestId]);
        self::assertSame(0, (int) $eventCount->fetchColumn());

        $disconnected = $this->cookieRequest(
            'PATCH',
            "/api/v1/projects/{$projectId}",
            $admin['cookie'],
            ['github_repository_id' => null],
            $admin['csrf'],
        );
        self::assertSame(200, $disconnected->status, json_encode($disconnected->body));
        self::assertNull($disconnected->body['project']['github_repository']);
        $staleWebhookPayload = $webhookPayload;
        $staleWebhookPayload['action'] = 'reopened';
        $staleWebhookPayload['pull_request']['state'] = 'open';
        $staleWebhookPayload['pull_request']['merged_at'] = null;
        $staleWebhookPayload['pull_request']['updated_at'] = '2026-11-18T10:30:00Z';
        $staleRawBody = json_encode($staleWebhookPayload, JSON_THROW_ON_ERROR);
        $staleWebhook = $this->webhookRequest($staleRawBody, $staleWebhookPayload, [
            'X-Hub-Signature-256' => 'sha256=' . hash_hmac('sha256', $staleRawBody, $secret),
            'X-GitHub-Delivery' => 'delivery-test-disconnected',
            'X-GitHub-Event' => 'pull_request',
        ]);
        self::assertSame(202, $staleWebhook->status);
        $history = $this->cookieRequest('GET', "/api/v1/issues/{$issueId}/pull-requests", $admin['cookie']);
        self::assertSame('merged', $history->body['pull_requests'][0]['state']);
        $eventCount->execute(['workspace_id' => $this->workspaceId, 'recipient_id' => $this->adminId]);
        self::assertSame(1, (int) $eventCount->fetchColumn());
    }

    public function testGuestCannotReadPullRequestMetadataForASharedIssue(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Private GitHub project');
        $guestId = $this->createUser($admin, 'Customer', 'customer@example.test', 'guest');
        $this->addMember($admin, $projectId, $guestId);
        $created = $this->cookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/issues",
            $admin['cookie'],
            ['title' => 'Implementation detail'],
            $admin['csrf'],
        );
        self::assertSame(201, $created->status, json_encode($created->body));
        $issueId = (int) $created->body['issue']['id'];
        $shared = $this->cookieRequest(
            'PATCH',
            "/api/v1/issues/{$issueId}",
            $admin['cookie'],
            ['is_shared' => true],
            $admin['csrf'],
        );
        self::assertSame(200, $shared->status, json_encode($shared->body));

        $guest = $this->login('customer@example.test');
        $response = $this->cookieRequest('GET', "/api/v1/issues/{$issueId}/pull-requests", $guest['cookie']);
        self::assertSame(404, $response->status);
    }

    public function testWebhookVerifiesTheRawBodyAndDeduplicatesDeliveries(): void
    {
        $secret = 'test-webhook-secret';
        $this->application = Application::create(
            $this->pdo,
            new AppConfig($this->workspaceId, false, 43200, 'http://localhost:8080', false, '', '', '', $secret),
        );
        $rawBody = "{\n  \"action\": \"ignored\"\n}\n";
        $body = json_decode($rawBody, true, flags: JSON_THROW_ON_ERROR);
        $headers = [
            'X-Hub-Signature-256' => 'sha256=' . hash_hmac('sha256', $rawBody, $secret),
            'X-GitHub-Delivery' => 'delivery-test-001',
            'X-GitHub-Event' => 'pull_request',
        ];
        $first = $this->webhookRequest($rawBody, $body, $headers);
        self::assertSame(202, $first->status, json_encode($first->body));
        self::assertFalse($first->body['duplicate']);

        $duplicate = $this->webhookRequest($rawBody, $body, $headers);
        self::assertSame(202, $duplicate->status, json_encode($duplicate->body));
        self::assertTrue($duplicate->body['duplicate']);

        $headers['X-Hub-Signature-256'] = 'sha256=' . hash_hmac('sha256', trim($rawBody), $secret);
        $invalid = $this->webhookRequest($rawBody, $body, $headers);
        self::assertSame(401, $invalid->status);
    }

    public function testWebhookDeliveryRecordsOlderThanThirtyDaysArePruned(): void
    {
        $secret = 'test-webhook-secret';
        $this->application = Application::create(
            $this->pdo,
            new AppConfig($this->workspaceId, false, 43200, 'http://localhost:8080', false, '', '', '', $secret),
        );
        $expired = $this->pdo->prepare(
            "INSERT INTO github_webhook_deliveries (delivery_id, event_type, received_at)
             VALUES ('delivery-expired', 'pull_request', CURRENT_TIMESTAMP - INTERVAL 31 DAY)"
        );
        $expired->execute();

        $rawBody = '{"action":"ignored"}';
        $body = json_decode($rawBody, true, flags: JSON_THROW_ON_ERROR);
        $response = $this->webhookRequest($rawBody, $body, [
            'X-Hub-Signature-256' => 'sha256=' . hash_hmac('sha256', $rawBody, $secret),
            'X-GitHub-Delivery' => 'delivery-current',
            'X-GitHub-Event' => 'ping',
        ]);

        self::assertSame(202, $response->status, json_encode($response->body));
        self::assertFalse($response->body['duplicate']);
        $count = $this->pdo->prepare(
            'SELECT COUNT(*) FROM github_webhook_deliveries WHERE delivery_id = :delivery_id'
        );
        $count->execute(['delivery_id' => 'delivery-expired']);
        self::assertSame(0, (int) $count->fetchColumn());
    }

    private function startGitHubInstallationSetup(FakeGitHubApiClient $client, bool $completeAppCallback = true): array
    {
        $admin = $this->login($this->adminEmail);
        $this->application = Application::create(
            $this->pdo,
            new AppConfig($this->workspaceId, false, 43200, 'https://tangent.example', false, '123', 'test-app', 'unused'),
            $client,
        );
        $started = $this->cookieRequest('POST', '/api/v1/github/install', $admin['cookie'], [], $admin['csrf']);
        self::assertSame(200, $started->status, json_encode($started->body));
        $query = [];
        parse_str((string) parse_url($started->body['url'], PHP_URL_QUERY), $query);
        $state = is_string($query['state'] ?? null) ? $query['state'] : '';
        self::assertMatchesRegularExpression('/^[a-f0-9]{64}$/', $state);

        return [
            $state,
            $completeAppCallback ? $this->githubInstallationCallback($admin['cookie'], $state) : null,
            $admin,
        ];
    }

    private function githubInstallationCallback(string $sessionCookie, string $state): Response
    {
        return $this->application->handle(new Request(
            'GET',
            '/api/v1/github/setup',
            [],
            [],
            ['tangent_session' => $sessionCookie],
            '127.0.0.1',
            true,
            ['installation_id' => '445566', 'state' => $state],
        ));
    }

    private function githubOAuthCallback(string $sessionCookie, string $state, string $code): Response
    {
        return $this->application->handle(new Request(
            'GET',
            '/api/v1/github/setup/authorize',
            [],
            [],
            ['tangent_session' => $sessionCookie],
            '127.0.0.1',
            true,
            ['code' => $code, 'state' => $state],
        ));
    }

    private function installationCount(int $installationId): int
    {
        $query = $this->pdo->prepare('SELECT COUNT(*) FROM github_installations WHERE installation_id = :id');
        $query->execute(['id' => $installationId]);
        return (int) $query->fetchColumn();
    }

    private function webhookRequest(string $rawBody, array $body, array $headers): Response
    {
        return $this->application->handle(Request::json(
            'POST',
            '/api/v1/github/webhook',
            $body,
            $headers,
            [],
            '127.0.0.1',
            [],
            $rawBody,
        ));
    }

    private function createProject(array $admin, string $name): int
    {
        $response = $this->cookieRequest('POST', '/api/v1/projects', $admin['cookie'], ['name' => $name], $admin['csrf']);
        self::assertSame(201, $response->status, json_encode($response->body));
        return (int) $response->body['project']['id'];
    }

    private function createHistoricalPullRequestTarget(int $repositoryId, int $pullNumber, int $installationId): array
    {
        $workspaceSlug = 'historical-github-' . bin2hex(random_bytes(4));
        $workspace = $this->pdo->prepare('INSERT INTO workspaces (name, slug) VALUES (:name, :slug)');
        $workspace->execute(['name' => 'Historical GitHub workspace', 'slug' => $workspaceSlug]);
        $workspaceId = (int) $this->pdo->lastInsertId();
        $email = $workspaceSlug . '@example.test';
        $account = $this->pdo->prepare('INSERT INTO user_accounts (email, password_hash) VALUES (:email, :password_hash)');
        $account->execute([
            'email' => $email,
            'password_hash' => password_hash('historical account password', PASSWORD_ARGON2ID),
        ]);
        $accountId = (int) $this->pdo->lastInsertId();
        $user = $this->pdo->prepare(
            "INSERT INTO users (workspace_id, account_id, name, email, role, is_active)
             VALUES (:workspace_id, :account_id, 'Historical admin', :email, 'admin', 1)",
        );
        $user->execute(['workspace_id' => $workspaceId, 'account_id' => $accountId, 'email' => $email]);
        $userId = (int) $this->pdo->lastInsertId();
        $installation = $this->pdo->prepare(
            'INSERT INTO github_installations (workspace_id, installation_id, account_login, connected_by)
             VALUES (:workspace_id, :installation_id, :account_login, :connected_by)',
        );
        $installation->execute([
            'workspace_id' => $workspaceId,
            'installation_id' => $installationId,
            'account_login' => 'old-owner',
            'connected_by' => $userId,
        ]);
        $project = $this->pdo->prepare(
            'INSERT INTO projects
                (workspace_id, name, slug, description, status, created_by, github_installation_id,
                 github_repository_id, github_repository_owner, github_repository_name,
                 github_repository_full_name, github_repository_url)
             VALUES
                (:workspace_id, :name, :slug, :description, :status, :created_by, :installation_id,
                 :repository_id, :owner, :repository, :full_name, :url)',
        );
        $project->execute([
            'workspace_id' => $workspaceId,
            'name' => 'Historical repository project',
            'slug' => 'historical-repository',
            'description' => '',
            'status' => 'active',
            'created_by' => $userId,
            'installation_id' => $installationId,
            'repository_id' => $repositoryId,
            'owner' => 'test-org',
            'repository' => 'test-repo',
            'full_name' => 'test-org/test-repo',
            'url' => 'https://github.com/test-org/test-repo',
        ]);
        $projectId = (int) $this->pdo->lastInsertId();
        $issue = $this->pdo->prepare(
            "INSERT INTO issues (workspace_id, project_id, title, description, status, created_by)
             VALUES (:workspace_id, :project_id, 'Old linked issue', '', 'backlog', :created_by)",
        );
        $issue->execute(['workspace_id' => $workspaceId, 'project_id' => $projectId, 'created_by' => $userId]);
        $issueId = (int) $this->pdo->lastInsertId();
        $pullRequest = $this->pdo->prepare(
            "INSERT INTO issue_pull_requests
                (workspace_id, project_id, issue_id, github_installation_id, github_repository_id,
                 repository_owner, repository_name, repository_full_name, pull_number, title, html_url,
                 state, is_draft, author_login, github_updated_at, linked_by)
             VALUES
                (:workspace_id, :project_id, :issue_id, :installation_id, :repository_id,
                 'test-org', 'test-repo', 'test-org/test-repo', :pull_number, 'Outdated pull request',
                 :html_url, 'open', 0, 'historical-author', '2026-11-18 09:00:00', :linked_by)",
        );
        $pullRequest->execute([
            'workspace_id' => $workspaceId,
            'project_id' => $projectId,
            'issue_id' => $issueId,
            'installation_id' => $installationId,
            'repository_id' => $repositoryId,
            'pull_number' => $pullNumber,
            'html_url' => 'https://github.com/test-org/test-repo/pull/' . $pullNumber,
            'linked_by' => $userId,
        ]);

        return ['workspace_id' => $workspaceId, 'pull_request_id' => (int) $this->pdo->lastInsertId()];
    }

    private function waitForWebhookUpdateStatement(\PDO $pdo, string $connectionPath): void
    {
        $deadline = microtime(true) + 10;
        do {
            if (is_file($connectionPath)) {
                $connectionId = (int) file_get_contents($connectionPath);
                $statement = $pdo->prepare(
                    "SELECT COUNT(*) FROM information_schema.PROCESSLIST
                     WHERE ID = :id AND INFO LIKE 'UPDATE issue_pull_requests%'",
                );
                $statement->execute(['id' => $connectionId]);
                if ((int) $statement->fetchColumn() === 1) return;
            }
            usleep(10000);
        } while (microtime(true) < $deadline);

        self::fail('The webhook process did not reach its guarded pull request update.');
    }

    private function createUser(array $admin, string $name, string $email, string $role): int
    {
        $response = $this->cookieRequest('POST', '/api/v1/users', $admin['cookie'], [
            'name' => $name,
            'email' => $email,
            'password' => $this->password,
            'role' => $role,
        ], $admin['csrf']);
        self::assertSame(201, $response->status, json_encode($response->body));
        return (int) $response->body['user']['id'];
    }

    private function addMember(array $admin, int $projectId, int $userId): void
    {
        $response = $this->cookieRequest(
            'PUT',
            "/api/v1/projects/{$projectId}/members/{$userId}",
            $admin['cookie'],
            [],
            $admin['csrf'],
        );
        self::assertSame(200, $response->status, json_encode($response->body));
    }
}

final class FakeGitHubApiClient implements GitHubApiClient
{
    public bool $userCanAccessInstallation = false;
    public int $authorizationChecks = 0;
    public int $repositoryCatalogueCalls = 0;
    public int $targetedRepositoryCalls = 0;
    public bool $repositoryAvailable = true;
    public array $targetedRepositoryLookups = [];

    public function __construct(private readonly array $repository, private readonly array $pullRequest)
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
        return 'https://github.com/login/oauth/authorize?' . http_build_query([
            'client_id' => 'test-client',
            'redirect_uri' => $redirectUri,
            'state' => $state,
        ]);
    }

    public function canUserAccessInstallation(string $code, int $installationId): bool
    {
        $this->authorizationChecks++;
        return $this->userCanAccessInstallation;
    }

    public function verifyInstallation(int $installationId): array
    {
        return ['account' => ['login' => $this->repository['owner'] ?? 'test-org']];
    }

    public function repositories(int $installationId): array
    {
        $this->repositoryCatalogueCalls++;
        return [array_merge($this->repository, ['installation_id' => $installationId])];
    }

    public function repositoryById(int $installationId, int $repositoryId, string $owner, string $repositoryName): array
    {
        $this->targetedRepositoryCalls++;
        $this->targetedRepositoryLookups[] = [$installationId, $repositoryId, $owner, $repositoryName];
        if (!$this->repositoryAvailable || (int) ($this->repository['id'] ?? 0) !== $repositoryId
            || ($this->repository['owner'] ?? null) !== $owner || ($this->repository['name'] ?? null) !== $repositoryName) {
            throw new ApiException(404, 'github_resource_not_found', 'The repository was not found.');
        }
        return array_merge($this->repository, ['installation_id' => $installationId]);
    }

    public function pullRequest(int $installationId, int $repositoryId, string $owner, string $repository, int $number): array
    {
        return $this->pullRequest;
    }
}
