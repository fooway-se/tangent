<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use Tangent\Tests\Support\ApiTestCase;

final class AuthAndProjectsTest extends ApiTestCase
{
    public function testUnauthenticatedRequestsCannotListProjects(): void
    {
        $response = $this->request('GET', '/api/v1/projects');

        self::assertSame(401, $response->status);
        self::assertSame('unauthenticated', $response->body['error']['code']);
    }

    public function testAdminLoginCreatesHashedHttpOnlySessionAndCanCreateProject(): void
    {
        $login = $this->login($this->adminEmail);
        $loginResponse = $this->request('GET', '/api/v1/auth/me', cookies: [
            'tangent_session' => $login['cookie'],
        ]);

        self::assertSame(200, $loginResponse->status);
        self::assertSame($this->adminEmail, $loginResponse->body['user']['email']);
        self::assertStringContainsString('HttpOnly', implode(';', $login['set_cookies']));

        $tokenQuery = $this->pdo->prepare(
            'SELECT token_hash FROM api_tokens WHERE workspace_id = :workspace_id AND token_type = :type'
        );
        $tokenQuery->execute(['workspace_id' => $this->workspaceId, 'type' => 'session']);
        $storedHash = $tokenQuery->fetchColumn();
        self::assertNotFalse($storedHash);
        self::assertSame(hash('sha256', $login['cookie']), $storedHash);

        $created = $this->cookieRequest(
            'POST',
            '/api/v1/projects',
            $login['cookie'],
            ['name' => 'Northstar', 'description' => 'Client portal'],
            $login['csrf'],
        );
        self::assertSame(201, $created->status, json_encode($created->body));
        self::assertSame('Northstar', $created->body['project']['name']);

        $list = $this->cookieRequest('GET', '/api/v1/projects', $login['cookie']);
        self::assertSame(200, $list->status);
        self::assertCount(1, $list->body['projects']);
    }

    public function testCookieMutationRequiresCsrfToken(): void
    {
        $login = $this->login($this->adminEmail);

        $response = $this->cookieRequest(
            'POST',
            '/api/v1/projects',
            $login['cookie'],
            ['name' => 'No CSRF'],
        );

        self::assertSame(403, $response->status);
        self::assertSame('csrf_failed', $response->body['error']['code']);
    }

    public function testDeveloperOnlySeesMemberProjectsAndCannotCreateProjects(): void
    {
        $memberProject = $this->insertProject('Member project', 'member-project', $this->adminId);
        $privateProject = $this->insertProject('Private project', 'private-project', $this->adminId);
        $membership = $this->pdo->prepare(
            'INSERT INTO project_memberships (workspace_id, project_id, user_id)
             VALUES (:workspace_id, :project_id, :user_id)'
        );
        $membership->execute([
            'workspace_id' => $this->workspaceId,
            'project_id' => $memberProject,
            'user_id' => $this->developerId,
        ]);

        $login = $this->login($this->developerEmail);
        $list = $this->cookieRequest('GET', '/api/v1/projects', $login['cookie']);
        self::assertSame(200, $list->status);
        self::assertCount(1, $list->body['projects']);
        self::assertSame($memberProject, $list->body['projects'][0]['id']);

        $hidden = $this->cookieRequest('GET', '/api/v1/projects/' . $privateProject, $login['cookie']);
        self::assertSame(404, $hidden->status);

        $create = $this->cookieRequest(
            'POST',
            '/api/v1/projects',
            $login['cookie'],
            ['name' => 'Forbidden project'],
            $login['csrf'],
        );
        self::assertSame(403, $create->status);
    }

    public function testAdminCanAddAndRemoveAProjectMember(): void
    {
        $projectId = $this->insertProject('Team project', 'team-project', $this->adminId);
        $admin = $this->login($this->adminEmail);

        $added = $this->cookieRequest(
            'PUT',
            "/api/v1/projects/{$projectId}/members/{$this->developerId}",
            $admin['cookie'],
            [],
            $admin['csrf'],
        );
        self::assertSame(200, $added->status, json_encode($added->body));

        $developer = $this->login($this->developerEmail);
        $visible = $this->cookieRequest('GET', '/api/v1/projects/' . $projectId, $developer['cookie']);
        self::assertSame(200, $visible->status);

        $removed = $this->cookieRequest(
            'DELETE',
            "/api/v1/projects/{$projectId}/members/{$this->developerId}",
            $admin['cookie'],
            [],
            $admin['csrf'],
        );
        self::assertSame(204, $removed->status);

        $hidden = $this->cookieRequest('GET', '/api/v1/projects/' . $projectId, $developer['cookie']);
        self::assertSame(404, $hidden->status);
    }

    public function testApiTokenIsReturnedOnceStoredAsHashAndAuthenticatesAsBearer(): void
    {
        $admin = $this->login($this->adminEmail);
        $created = $this->cookieRequest(
            'POST',
            '/api/v1/tokens',
            $admin['cookie'],
            ['label' => 'automation'],
            $admin['csrf'],
        );

        self::assertSame(201, $created->status, json_encode($created->body));
        $plainToken = $created->body['token'];
        self::assertNotEmpty($plainToken);

        $tokenQuery = $this->pdo->prepare(
            'SELECT token_hash FROM api_tokens WHERE workspace_id = :workspace_id AND token_type = :type'
        );
        $tokenQuery->execute(['workspace_id' => $this->workspaceId, 'type' => 'api']);
        self::assertSame(hash('sha256', $plainToken), $tokenQuery->fetchColumn());

        $authenticated = $this->request(
            'GET',
            '/api/v1/auth/me',
            headers: ['Authorization' => 'Bearer ' . $plainToken],
        );
        self::assertSame(200, $authenticated->status);
        self::assertSame($this->adminEmail, $authenticated->body['user']['email']);
    }

    public function testLoginIsRateLimitedByWorkspaceIpAndEmail(): void
    {
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $response = $this->request(
                'POST',
                '/api/v1/auth/login',
                ['email' => $this->adminEmail, 'password' => 'wrong'],
                remoteAddress: '192.0.2.10',
            );
            self::assertSame(401, $response->status);
        }

        $limited = $this->request(
            'POST',
            '/api/v1/auth/login',
            ['email' => $this->adminEmail, 'password' => $this->password],
            remoteAddress: '192.0.2.10',
        );

        self::assertSame(429, $limited->status);
        self::assertSame('rate_limited', $limited->body['error']['code']);
    }

    public function testAdminCanCreateDeveloperAndDeveloperCannotManageUsers(): void
    {
        $admin = $this->login($this->adminEmail);
        $created = $this->cookieRequest('POST', '/api/v1/users', $admin['cookie'], [
            'name' => 'New Developer',
            'email' => 'new@example.test',
            'password' => 'a-long-review-password',
        ], $admin['csrf']);

        self::assertSame(201, $created->status, json_encode($created->body));
        self::assertSame('developer', $created->body['user']['role']);
        self::assertArrayNotHasKey('password_hash', $created->body['user']);

        $newUserLogin = $this->request('POST', '/api/v1/auth/login', [
            'email' => 'new@example.test',
            'password' => 'a-long-review-password',
        ]);
        self::assertSame(200, $newUserLogin->status);

        $developer = $this->login($this->developerEmail);
        self::assertSame(403, $this->cookieRequest('GET', '/api/v1/users', $developer['cookie'])->status);
        self::assertSame(403, $this->cookieRequest('POST', '/api/v1/users', $developer['cookie'], [
            'name' => 'Another Developer',
            'email' => 'another@example.test',
            'password' => 'a-long-review-password',
        ], $developer['csrf'])->status);
    }

    public function testWorkspaceIsolationHidesProjectsAndUsersFromAnotherWorkspace(): void
    {
        $workspace = $this->pdo->prepare('INSERT INTO workspaces (name, slug) VALUES (:name, :slug)');
        $workspace->execute(['name' => 'Other workspace', 'slug' => 'other-' . bin2hex(random_bytes(3))]);
        $otherWorkspaceId = (int) $this->pdo->lastInsertId();

        $otherUser = $this->pdo->prepare(
            'INSERT INTO users (workspace_id, name, email, password_hash, role, is_active)
             VALUES (:workspace_id, :name, :email, :password_hash, :role, 1)'
        );
        $otherUser->execute([
            'workspace_id' => $otherWorkspaceId,
            'name' => 'Other Admin',
            'email' => 'other@example.test',
            'password_hash' => password_hash($this->password, PASSWORD_DEFAULT),
            'role' => 'admin',
        ]);
        $otherUserId = (int) $this->pdo->lastInsertId();
        $otherProject = $this->pdo->prepare(
            'INSERT INTO projects (workspace_id, name, slug, description, status, created_by)
             VALUES (:workspace_id, :name, :slug, :description, :status, :created_by)'
        );
        $otherProject->execute([
            'workspace_id' => $otherWorkspaceId,
            'name' => 'Other project',
            'slug' => 'other-project',
            'description' => '',
            'status' => 'active',
            'created_by' => $otherUserId,
        ]);
        $otherProjectId = (int) $this->pdo->lastInsertId();

        $admin = $this->login($this->adminEmail);
        $hiddenProject = $this->cookieRequest('GET', '/api/v1/projects/' . $otherProjectId, $admin['cookie']);
        self::assertSame(404, $hiddenProject->status);

        $users = $this->cookieRequest('GET', '/api/v1/users', $admin['cookie']);
        self::assertSame(200, $users->status);
        self::assertCount(2, $users->body['users']);
        self::assertNotContains('other@example.test', array_column($users->body['users'], 'email'));
    }

    public function testLogoutRevokesTheSession(): void
    {
        $login = $this->login($this->adminEmail);
        $logout = $this->cookieRequest('POST', '/api/v1/auth/logout', $login['cookie'], [], $login['csrf']);

        self::assertSame(204, $logout->status);
        self::assertCount(2, $logout->headers['set-cookie']);
        self::assertStringContainsString('Max-Age=0', implode(';', $logout->headers['set-cookie']));
        self::assertSame(401, $this->cookieRequest('GET', '/api/v1/auth/me', $login['cookie'])->status);
    }

    public function testApiTokenCreationIsRateLimited(): void
    {
        $admin = $this->login($this->adminEmail);
        for ($index = 0; $index < 10; $index++) {
            $created = $this->cookieRequest(
                'POST',
                '/api/v1/tokens',
                $admin['cookie'],
                ['label' => 'automation-' . $index],
                $admin['csrf'],
            );
            self::assertSame(201, $created->status);
        }

        $limited = $this->cookieRequest(
            'POST',
            '/api/v1/tokens',
            $admin['cookie'],
            ['label' => 'one-too-many'],
            $admin['csrf'],
        );
        self::assertSame(429, $limited->status);
        self::assertSame('rate_limited', $limited->body['error']['code']);
    }
}
