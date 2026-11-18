<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use Tangent\Core\AppConfig;
use Tangent\Core\Application;
use Tangent\Core\Request;
use Tangent\Core\Response;
use Tangent\Modules\GitHub\GitHubApiClient;
use Tangent\Tests\Support\ApiTestCase;

final class GitHubTrackingTest extends ApiTestCase
{
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
    public function __construct(private readonly array $repository, private readonly array $pullRequest)
    {
    }

    public function isConfigured(): bool
    {
        return true;
    }

    public function verifyInstallation(int $installationId): array
    {
        return ['account' => ['login' => $this->repository['owner']]];
    }

    public function repositories(int $installationId): array
    {
        return [array_merge($this->repository, ['installation_id' => $installationId])];
    }

    public function pullRequest(int $installationId, int $repositoryId, string $owner, string $repository, int $number): array
    {
        return $this->pullRequest;
    }
}
