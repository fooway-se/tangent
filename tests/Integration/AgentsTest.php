<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use Tangent\Core\Response;
use Tangent\Tests\Support\ApiTestCase;

final class AgentsTest extends ApiTestCase
{
    public function testAgentCanOnlyUseScopedIssueToolsAndActionsAreAttributedToAgent(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Agent project');
        $issueId = $this->createIssue($admin, $projectId, 'Implement the handoff');

        $created = $this->agentCookieRequest(
            'POST',
            '/api/v1/agents',
            $admin['cookie'],
            [
                'name' => 'Build agent',
                'project_ids' => [$projectId],
                'capabilities' => ['issues.read', 'issues.comment', 'issues.status.update'],
                'expires_in_days' => 30,
            ],
            $admin['csrf'],
        );

        self::assertSame(201, $created->status, json_encode($created->body));
        self::assertSame('no-store', $created->headers['cache-control'] ?? null);
        self::assertSame('Build agent', $created->body['agent']['name']);
        self::assertSame([$projectId], $created->body['agent']['project_ids']);
        self::assertNotEmpty($created->body['token']);
        $token = $created->body['token'];
        $agentId = (int) $created->body['agent']['id'];

        $listed = $this->agentCookieRequest('GET', '/api/v1/agents', $admin['cookie']);
        self::assertSame(200, $listed->status, json_encode($listed->body));
        self::assertArrayNotHasKey('token', $listed->body['agents'][0]);

        $me = $this->bearerRequest('GET', '/api/v1/auth/me', $token);
        self::assertSame(200, $me->status);
        self::assertSame('agent', $me->body['user']['principal_type']);
        self::assertSame('Build agent', $me->body['user']['name']);

        $stored = $this->pdo->prepare(
            'SELECT token_hash FROM api_tokens WHERE workspace_id = :workspace_id AND agent_id = :agent_id'
        );
        $stored->execute(['workspace_id' => $this->workspaceId, 'agent_id' => $agentId]);
        self::assertSame(hash('sha256', $token), $stored->fetchColumn());

        $issues = $this->bearerRequest('GET', "/api/v1/agent/projects/{$projectId}/issues", $token);
        self::assertSame(200, $issues->status, json_encode($issues->body));
        self::assertSame([$issueId], array_column($issues->body['issues'], 'id'));
        self::assertSame('Implement the handoff', $issues->body['issues'][0]['title']);

        $comment = $this->bearerRequest(
            'POST',
            "/api/v1/agent/issues/{$issueId}/discussion",
            $token,
            ['body' => 'I have started the implementation.'],
        );
        self::assertSame(201, $comment->status, json_encode($comment->body));
        self::assertSame('Build agent', $comment->body['message']['author_name']);
        self::assertSame($agentId, $comment->body['message']['author_agent_id']);
        $agentMessageId = (int) $comment->body['message']['id'];

        $ownerCannotEditAgentMessage = $this->agentCookieRequest(
            'PATCH',
            "/api/v1/issues/{$issueId}/discussion/{$agentMessageId}",
            $admin['cookie'],
            ['body' => 'This edit should keep the agent audit trail intact.'],
            $admin['csrf'],
        );
        self::assertSame(403, $ownerCannotEditAgentMessage->status);

        $status = $this->bearerRequest(
            'PATCH',
            "/api/v1/agent/issues/{$issueId}/status",
            $token,
            ['status' => 'doing'],
        );
        self::assertSame(200, $status->status, json_encode($status->body));
        self::assertSame('doing', $status->body['issue']['status']);

        $cannotComplete = $this->bearerRequest(
            'PATCH',
            "/api/v1/agent/issues/{$issueId}/status",
            $token,
            ['status' => 'done'],
        );
        self::assertSame(422, $cannotComplete->status);

        $history = $this->bearerRequest('GET', "/api/v1/issues/{$issueId}/history", $token);
        self::assertSame(404, $history->status, 'Agent tokens must not access the general issue API.');
        $generalList = $this->bearerRequest('GET', "/api/v1/projects/{$projectId}/issues", $token);
        self::assertSame(404, $generalList->status, 'Agent tokens must only use the agent-specific API.');
        $generalMutation = $this->bearerRequest(
            'PATCH',
            "/api/v1/issues/{$issueId}",
            $token,
            ['title' => 'Agent must not edit arbitrary fields'],
        );
        self::assertSame(404, $generalMutation->status);
        $adminApi = $this->bearerRequest('GET', '/api/v1/users', $token);
        self::assertSame(403, $adminApi->status);

        $discussion = $this->agentCookieRequest(
            'GET',
            "/api/v1/issues/{$issueId}/discussion",
            $admin['cookie'],
        );
        self::assertSame('Build agent', $discussion->body['messages'][0]['author_name']);
        $history = $this->agentCookieRequest('GET', "/api/v1/issues/{$issueId}/history", $admin['cookie']);
        self::assertSame('Build agent', $history->body['transitions'][0]['actor_name']);
    }

    public function testAgentProjectGrantAndCapabilitiesAreEnforcedAndCanBeRevoked(): void
    {
        $admin = $this->login($this->adminEmail);
        $allowedProject = $this->createProject($admin, 'Allowed agent project');
        $otherProject = $this->createProject($admin, 'Other agent project');
        $issueId = $this->createIssue($admin, $allowedProject, 'Restricted issue');

        $created = $this->agentCookieRequest(
            'POST',
            '/api/v1/agents',
            $admin['cookie'],
            [
                'name' => 'Read-only agent',
                'project_ids' => [$allowedProject],
                'capabilities' => ['issues.read'],
            ],
            $admin['csrf'],
        );
        self::assertSame(201, $created->status, json_encode($created->body));
        $token = $created->body['token'];
        $agentId = (int) $created->body['agent']['id'];

        $rotated = $this->agentCookieRequest(
            'POST',
            "/api/v1/agents/{$agentId}/tokens",
            $admin['cookie'],
            ['expires_in_days' => 7],
            $admin['csrf'],
        );
        self::assertSame(201, $rotated->status, json_encode($rotated->body));
        self::assertSame('no-store', $rotated->headers['cache-control'] ?? null);
        self::assertSame(401, $this->bearerRequest(
            'GET', "/api/v1/agent/projects/{$allowedProject}/issues", $token,
        )->status);
        $token = $rotated->body['token'];

        self::assertSame(404, $this->bearerRequest(
            'GET', "/api/v1/agent/projects/{$otherProject}/issues", $token,
        )->status);
        self::assertSame(403, $this->bearerRequest(
            'POST', "/api/v1/agent/issues/{$issueId}/discussion", $token, ['body' => 'No comment grant.'],
        )->status);
        self::assertSame(403, $this->bearerRequest(
            'PATCH', "/api/v1/agent/issues/{$issueId}/status", $token, ['status' => 'doing'],
        )->status);

        $revoked = $this->agentCookieRequest('DELETE', "/api/v1/agents/{$agentId}", $admin['cookie'], [], $admin['csrf']);
        self::assertSame(204, $revoked->status, json_encode($revoked->body));
        self::assertSame(401, $this->bearerRequest(
            'GET', "/api/v1/agent/projects/{$allowedProject}/issues", $token,
        )->status);
    }

    public function testAgentManagementIsAdminOnlyAndRejectsInvalidGrants(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Agent management project');
        $developer = $this->login($this->developerEmail);

        $forbidden = $this->agentCookieRequest(
            'POST',
            '/api/v1/agents',
            $developer['cookie'],
            [
                'name' => 'Unauthorized agent',
                'project_ids' => [$projectId],
                'capabilities' => ['issues.read'],
            ],
            $developer['csrf'],
        );
        self::assertSame(403, $forbidden->status);

        $invalidCapability = $this->agentCookieRequest(
            'POST',
            '/api/v1/agents',
            $admin['cookie'],
            [
                'name' => 'Overpowered agent',
                'project_ids' => [$projectId],
                'capabilities' => ['users.manage'],
            ],
            $admin['csrf'],
        );
        self::assertSame(422, $invalidCapability->status);

        $invalidProject = $this->agentCookieRequest(
            'POST',
            '/api/v1/agents',
            $admin['cookie'],
            [
                'name' => 'Unknown project agent',
                'project_ids' => [999999],
                'capabilities' => ['issues.read'],
            ],
            $admin['csrf'],
        );
        self::assertSame(422, $invalidProject->status);
    }

    private function createProject(array $admin, string $name): int
    {
        $response = $this->agentCookieRequest('POST', '/api/v1/projects', $admin['cookie'], ['name' => $name], $admin['csrf']);
        self::assertSame(201, $response->status, json_encode($response->body));
        return (int) $response->body['project']['id'];
    }

    private function createIssue(array $admin, int $projectId, string $title): int
    {
        $response = $this->agentCookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/issues",
            $admin['cookie'],
            ['title' => $title],
            $admin['csrf'],
        );
        self::assertSame(201, $response->status, json_encode($response->body));
        return (int) $response->body['issue']['id'];
    }

    private function agentCookieRequest(string $method, string $path, string $cookie, array $body = [], ?string $csrf = null): Response
    {
        $headers = $csrf === null ? [] : ['X-CSRF-Token' => $csrf];
        return $this->request($method, $path, $body, $headers, ['tangent_session' => $cookie]);
    }

    private function bearerRequest(string $method, string $path, string $token, array $body = []): Response
    {
        return $this->request($method, $path, $body, ['Authorization' => 'Bearer ' . $token]);
    }
}
