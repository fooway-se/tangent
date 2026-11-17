<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use Tangent\Core\Response;
use Tangent\Tests\Support\ApiTestCase;

final class WorkspaceSwitchingTest extends ApiTestCase
{
    public function testAdminCanCreateAndSwitchWorkspaceWithoutCrossingDataScopes(): void
    {
        $admin = $this->login($this->adminEmail);
        $initialList = $this->cookieRequest('GET', '/api/v1/workspaces', $admin['cookie']);

        self::assertSame(200, $initialList->status, json_encode($initialList->body));
        self::assertCount(1, $initialList->body['workspaces']);
        self::assertSame($this->workspaceId, $initialList->body['workspaces'][0]['id']);

        $created = $this->cookieRequest(
            'POST',
            '/api/v1/workspaces',
            $admin['cookie'],
            ['name' => 'Client Two'],
            $admin['csrf'],
        );
        self::assertSame(201, $created->status, json_encode($created->body));
        $newWorkspace = $created->body['workspace'];
        self::assertSame('Client Two', $newWorkspace['name']);
        self::assertSame('admin', $newWorkspace['role']);

        $developer = $this->login($this->developerEmail);
        $developerWorkspaces = $this->cookieRequest('GET', '/api/v1/workspaces', $developer['cookie']);
        self::assertSame(200, $developerWorkspaces->status);
        self::assertCount(1, $developerWorkspaces->body['workspaces']);
        $forbiddenCreate = $this->cookieRequest(
            'POST',
            '/api/v1/workspaces',
            $developer['cookie'],
            ['name' => 'Not allowed'],
            $developer['csrf'],
        );
        self::assertSame(403, $forbiddenCreate->status);
        $notMember = $this->requestForWorkspace(
            'POST',
            '/api/v1/workspaces/' . $newWorkspace['id'] . '/switch',
            $developer['cookie'],
            $this->workspaceId,
            ['csrf' => $developer['csrf']],
        );
        self::assertSame(404, $notMember->status);

        $switched = $this->requestForWorkspace(
            'POST',
            '/api/v1/workspaces/' . $newWorkspace['id'] . '/switch',
            $admin['cookie'],
            $this->workspaceId,
            ['csrf' => $admin['csrf']],
        );
        self::assertSame(200, $switched->status, json_encode($switched->body));
        self::assertSame($newWorkspace['id'], $switched->body['workspace']['id']);
        self::assertSame($newWorkspace['id'], $switched->body['user']['workspace_id']);
        self::assertSame(3, count((array) ($switched->headers['set-cookie'] ?? [])));

        $newSession = $this->cookieValue($switched, 'tangent_session');
        $newCsrf = $this->cookieValue($switched, 'tangent_csrf');
        $targetWorkspaceCookie = $this->cookieValue($switched, 'tangent_workspace');
        self::assertSame((string) $newWorkspace['id'], $targetWorkspaceCookie);

        $newProject = $this->requestForWorkspace(
            'POST',
            '/api/v1/projects',
            $newSession,
            (int) $newWorkspace['id'],
            ['csrf' => $newCsrf, 'body' => ['name' => 'Private client project']],
        );
        self::assertSame(201, $newProject->status, json_encode($newProject->body));

        $apiToken = $this->requestForWorkspace(
            'POST',
            '/api/v1/tokens',
            $newSession,
            (int) $newWorkspace['id'],
            ['csrf' => $newCsrf, 'body' => ['label' => 'client automation']],
        );
        self::assertSame(201, $apiToken->status, json_encode($apiToken->body));
        $scopedApiRequest = $this->request('GET', '/api/v1/projects', headers: [
            'Authorization' => 'Bearer ' . $apiToken->body['token'],
            'X-Tangent-Workspace' => (string) $newWorkspace['id'],
        ]);
        self::assertSame(200, $scopedApiRequest->status, json_encode($scopedApiRequest->body));
        self::assertCount(1, $scopedApiRequest->body['projects']);
        $wrongApiScope = $this->request('GET', '/api/v1/projects', headers: [
            'Authorization' => 'Bearer ' . $apiToken->body['token'],
        ]);
        self::assertSame(401, $wrongApiScope->status);

        $oldScope = $this->requestForWorkspace(
            'GET',
            '/api/v1/projects',
            $admin['cookie'],
            $this->workspaceId,
        );
        self::assertSame(401, $oldScope->status, 'Switching revokes the prior session cookie.');

        $back = $this->requestForWorkspace(
            'POST',
            '/api/v1/workspaces/' . $this->workspaceId . '/switch',
            $newSession,
            (int) $newWorkspace['id'],
            ['csrf' => $newCsrf],
        );
        self::assertSame(200, $back->status, json_encode($back->body));
        $backSession = $this->cookieValue($back, 'tangent_session');
        $crossWorkspaceProject = $this->requestForWorkspace(
            'GET',
            '/api/v1/projects/' . $newProject->body['project']['id'],
            $backSession,
            $this->workspaceId,
        );
        self::assertSame(404, $crossWorkspaceProject->status);
    }

    private function requestForWorkspace(
        string $method,
        string $path,
        string $session,
        int $workspaceId,
        array $options = [],
    ): Response {
        $headers = [];
        if (isset($options['csrf'])) {
            $headers['X-CSRF-Token'] = $options['csrf'];
        }
        return $this->request(
            $method,
            $path,
            $options['body'] ?? [],
            $headers,
            ['tangent_session' => $session, 'tangent_workspace' => (string) $workspaceId],
        );
    }

    private function cookieValue(Response $response, string $name): string
    {
        foreach ((array) ($response->headers['set-cookie'] ?? []) as $cookie) {
            if (preg_match('/(?:^|;\s*)' . preg_quote($name, '/') . '=([^;]*)/', $cookie, $matches)) {
                return rawurldecode($matches[1]);
            }
        }
        self::fail("Expected {$name} cookie in response");
    }
}
