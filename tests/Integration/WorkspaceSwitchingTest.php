<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use Tangent\Core\Response;
use Tangent\Tests\Support\ApiTestCase;

final class WorkspaceSwitchingTest extends ApiTestCase
{
    public function testAccountCanSwitchFromInternalMembershipIntoAndBackFromGuestWorkspace(): void
    {
        $accountIdQuery = $this->pdo->prepare('SELECT account_id FROM users WHERE workspace_id = :workspace_id AND id = :id');
        $accountIdQuery->execute(['workspace_id' => $this->workspaceId, 'id' => $this->adminId]);
        $accountId = (int) $accountIdQuery->fetchColumn();
        $guestWorkspaceId = $this->insertWorkspace('Guest client workspace');
        $guestMemberId = $this->insertWorkspaceMembership(
            $guestWorkspaceId,
            $accountId,
            'Client Admin Account',
            $this->adminEmail,
            'guest',
        );
        $inactiveWorkspaceId = $this->insertWorkspace('Inactive membership workspace');
        $inactiveMemberId = $this->insertWorkspaceMembership(
            $inactiveWorkspaceId,
            $accountId,
            'Inactive Admin Account',
            $this->adminEmail,
            'developer',
        );
        $this->pdo->prepare('UPDATE users SET is_active = 0 WHERE workspace_id = :workspace_id AND id = :id')
            ->execute(['workspace_id' => $inactiveWorkspaceId, 'id' => $inactiveMemberId]);

        $projectId = $this->insertProjectInWorkspace($guestWorkspaceId, 'Guest accessible project', $guestMemberId);
        $this->pdo->prepare(
            'INSERT INTO project_memberships (workspace_id, project_id, user_id)
             VALUES (:workspace_id, :project_id, :user_id)'
        )->execute(['workspace_id' => $guestWorkspaceId, 'project_id' => $projectId, 'user_id' => $guestMemberId]);
        $this->pdo->prepare(
            "INSERT INTO channels (workspace_id, project_id, channel_type) VALUES (:workspace_id, :project_id, 'project')"
        )->execute(['workspace_id' => $guestWorkspaceId, 'project_id' => $projectId]);

        $admin = $this->login($this->adminEmail);
        $workspaces = $this->requestForWorkspace('GET', '/api/v1/workspaces', $admin['cookie'], $this->workspaceId);

        self::assertSame(200, $workspaces->status, json_encode($workspaces->body));
        self::assertEqualsCanonicalizing(
            [$this->workspaceId, $guestWorkspaceId],
            array_column($workspaces->body['workspaces'], 'id'),
        );
        self::assertNotContains($inactiveWorkspaceId, array_column($workspaces->body['workspaces'], 'id'));

        $toGuest = $this->requestForWorkspace(
            'POST',
            '/api/v1/workspaces/' . $guestWorkspaceId . '/switch',
            $admin['cookie'],
            $this->workspaceId,
            ['csrf' => $admin['csrf']],
        );
        self::assertSame(200, $toGuest->status, json_encode($toGuest->body));
        self::assertSame('guest', $toGuest->body['user']['role']);
        self::assertSame($guestWorkspaceId, $toGuest->body['user']['workspace_id']);
        $guestSession = $this->cookieValue($toGuest, 'tangent_session');
        $guestCsrf = $this->cookieValue($toGuest, 'tangent_csrf');

        $guestWorkspaceList = $this->requestForWorkspace(
            'GET',
            '/api/v1/workspaces',
            $guestSession,
            $guestWorkspaceId,
        );
        self::assertSame(200, $guestWorkspaceList->status, json_encode($guestWorkspaceList->body));
        self::assertEqualsCanonicalizing(
            [$this->workspaceId, $guestWorkspaceId],
            array_column($guestWorkspaceList->body['workspaces'], 'id'),
        );
        self::assertSame(200, $this->requestForWorkspace(
            'GET',
            '/api/v1/projects/' . $projectId . '/client-view',
            $guestSession,
            $guestWorkspaceId,
        )->status);
        self::assertSame(403, $this->requestForWorkspace(
            'GET',
            '/api/v1/users',
            $guestSession,
            $guestWorkspaceId,
        )->status);

        $backToInternal = $this->requestForWorkspace(
            'POST',
            '/api/v1/workspaces/' . $this->workspaceId . '/switch',
            $guestSession,
            $guestWorkspaceId,
            ['csrf' => $guestCsrf],
        );
        self::assertSame(200, $backToInternal->status, json_encode($backToInternal->body));
        self::assertSame('admin', $backToInternal->body['user']['role']);
        self::assertSame($this->workspaceId, $backToInternal->body['user']['workspace_id']);
        $internalSession = $this->cookieValue($backToInternal, 'tangent_session');
        self::assertSame(200, $this->requestForWorkspace(
            'GET',
            '/api/v1/users',
            $internalSession,
            $this->workspaceId,
        )->status);
        self::assertSame(401, $this->requestForWorkspace(
            'GET',
            '/api/v1/auth/me',
            $guestSession,
            $guestWorkspaceId,
        )->status);
    }

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

    private function insertWorkspace(string $name): int
    {
        $statement = $this->pdo->prepare('INSERT INTO workspaces (name, slug) VALUES (:name, :slug)');
        $statement->execute(['name' => $name, 'slug' => 'switch-' . bin2hex(random_bytes(6))]);
        return (int) $this->pdo->lastInsertId();
    }

    private function insertWorkspaceMembership(int $workspaceId, int $accountId, string $name, string $email, string $role): int
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO users (workspace_id, account_id, name, email, role, is_active)
             VALUES (:workspace_id, :account_id, :name, :email, :role, 1)'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'account_id' => $accountId,
            'name' => $name,
            'email' => $email,
            'role' => $role,
        ]);
        return (int) $this->pdo->lastInsertId();
    }

    private function insertProjectInWorkspace(int $workspaceId, string $name, int $createdBy): int
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO projects (workspace_id, name, slug, description, status, created_by)
             VALUES (:workspace_id, :name, :slug, :description, :status, :created_by)'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'name' => $name,
            'slug' => 'switch-' . bin2hex(random_bytes(6)),
            'description' => '',
            'status' => 'active',
            'created_by' => $createdBy,
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
        self::fail("Expected {$name} cookie in response");
    }
}
