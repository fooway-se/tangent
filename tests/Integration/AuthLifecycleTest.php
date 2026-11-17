<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use Tangent\Tests\Support\ApiTestCase;

final class AuthLifecycleTest extends ApiTestCase
{
    public function testAdminInvitesGuestWithProjectAccessAndAcceptanceCreatesSessionOnce(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->insertProject('Guest invite project', 'guest-invite-project', $this->adminId);
        $created = $this->cookieRequest('POST', '/api/v1/users/invites', $admin['cookie'], [
            'name' => 'Client Contact',
            'email' => 'client@example.test',
            'role' => 'guest',
            'project_ids' => [$projectId],
        ], $admin['csrf']);

        self::assertSame(201, $created->status, json_encode($created->body));
        self::assertArrayNotHasKey('token', $created->body['invite']);
        self::assertArrayHasKey('invite_url', $created->body['invite']);
        $plainToken = $this->tokenFromCredentialUrl($created->body['invite']['invite_url'], 'invite');

        $inspection = $this->request('POST', '/api/v1/auth/invites/inspect', ['token' => $plainToken]);
        self::assertSame(200, $inspection->status, json_encode($inspection->body));
        self::assertTrue($inspection->body['invite']['password_required']);
        self::assertSame('client@example.test', $inspection->body['invite']['email']);

        $stored = $this->pdo->prepare('SELECT token_hash, token_type FROM credential_tokens WHERE id = :id');
        $stored->execute(['id' => $created->body['invite']['id']]);
        self::assertSame(['token_hash' => hash('sha256', $plainToken), 'token_type' => 'invite'], $stored->fetch(\PDO::FETCH_ASSOC));

        $accepted = $this->request('POST', '/api/v1/auth/invites/accept', [
            'token' => $plainToken,
            'password' => 'a calm orchard under winter stars',
        ]);
        self::assertSame(200, $accepted->status, json_encode($accepted->body));
        self::assertSame('guest', $accepted->body['user']['role']);
        $cookies = (array) ($accepted->headers['set-cookie'] ?? []);
        self::assertStringContainsString('tangent_session=', implode(';', $cookies));
        self::assertStringContainsString('tangent_workspace=' . $this->workspaceId, implode(';', $cookies));

        $membership = $this->pdo->prepare(
            'SELECT u.id, u.account_id, u.role, ua.password_hash
             FROM users u INNER JOIN user_accounts ua ON ua.id = u.account_id
             WHERE u.workspace_id = :workspace_id AND u.email = :email'
        );
        $membership->execute(['workspace_id' => $this->workspaceId, 'email' => 'client@example.test']);
        $user = $membership->fetch(\PDO::FETCH_ASSOC);
        self::assertSame('guest', $user['role']);
        self::assertSame('argon2id', password_get_info($user['password_hash'])['algoName']);
        self::assertTrue($this->projectHasMember($projectId, (int) $user['id']));

        $me = $this->request('GET', '/api/v1/auth/me', cookies: ['tangent_session' => $this->cookieFrom($accepted)]);
        self::assertSame(200, $me->status);
        self::assertSame('client@example.test', $me->body['user']['email']);
        self::assertSame(400, $this->request('POST', '/api/v1/auth/invites/accept', ['token' => $plainToken])->status);
        self::assertSame(403, $this->cookieRequest('GET', '/api/v1/users', $this->cookieFrom($accepted))->status);
    }

    public function testInviteCanBeListedRegeneratedAndRevokedByWorkspaceAdmin(): void
    {
        $admin = $this->login($this->adminEmail);
        $created = $this->cookieRequest('POST', '/api/v1/users/invites', $admin['cookie'], [
            'name' => 'Mira Fox',
            'email' => 'mira@example.test',
            'role' => 'developer',
        ], $admin['csrf']);
        self::assertSame(201, $created->status, json_encode($created->body));
        $firstToken = $this->tokenFromCredentialUrl($created->body['invite']['invite_url'], 'invite');

        $listed = $this->cookieRequest('GET', '/api/v1/users/invites', $admin['cookie']);
        self::assertSame(200, $listed->status);
        self::assertCount(1, $listed->body['invites']);
        self::assertArrayNotHasKey('token', $listed->body['invites'][0]);
        self::assertArrayNotHasKey('invite_url', $listed->body['invites'][0]);

        $resent = $this->cookieRequest(
            'POST',
            '/api/v1/users/invites/' . $created->body['invite']['id'] . '/link',
            $admin['cookie'],
            [],
            $admin['csrf'],
        );
        self::assertSame(200, $resent->status, json_encode($resent->body));
        $secondToken = $this->tokenFromCredentialUrl($resent->body['invite']['invite_url'], 'invite');
        self::assertNotSame($firstToken, $secondToken);
        self::assertSame(400, $this->request('POST', '/api/v1/auth/invites/accept', [
            'token' => $firstToken,
            'password' => 'a strong password phrase under stars',
        ])->status);

        $revoked = $this->cookieRequest(
            'DELETE',
            '/api/v1/users/invites/' . $created->body['invite']['id'],
            $admin['cookie'],
            [],
            $admin['csrf'],
        );
        self::assertSame(204, $revoked->status);
        self::assertSame(400, $this->request('POST', '/api/v1/auth/invites/accept', [
            'token' => $secondToken,
            'password' => 'a strong password phrase under stars',
        ])->status);
        self::assertSame([], $this->cookieRequest('GET', '/api/v1/users/invites', $admin['cookie'])->body['invites']);
    }

    public function testNonAdminMembersCannotManageWorkspaceInvites(): void
    {
        $admin = $this->login($this->adminEmail);
        $created = $this->cookieRequest('POST', '/api/v1/users', $admin['cookie'], [
            'name' => 'Workspace Developer',
            'email' => 'workspace-developer@example.test',
            'password' => 'a secure developer password phrase',
            'role' => 'developer',
        ], $admin['csrf']);
        self::assertSame(201, $created->status, json_encode($created->body));
        $developer = $this->login('workspace-developer@example.test', 'a secure developer password phrase');

        self::assertSame(403, $this->cookieRequest('GET', '/api/v1/users/invites', $developer['cookie'])->status);
        self::assertSame(403, $this->cookieRequest('POST', '/api/v1/users/invites', $developer['cookie'], [
            'name' => 'Another Developer',
            'email' => 'another-developer@example.test',
            'role' => 'developer',
        ], $developer['csrf'])->status);
        self::assertSame(403, $this->cookieRequest(
            'POST',
            '/api/v1/users/invites/1/link',
            $developer['cookie'],
            [],
            $developer['csrf'],
        )->status);
        self::assertSame(403, $this->cookieRequest(
            'DELETE',
            '/api/v1/users/invites/1',
            $developer['cookie'],
            [],
            $developer['csrf'],
        )->status);
        self::assertSame(403, $this->cookieRequest(
            'POST',
            '/api/v1/users/' . $this->adminId . '/password-reset',
            $developer['cookie'],
            [],
            $developer['csrf'],
        )->status);
    }

    public function testInviteAcceptanceLinksAnExistingAccountFromAnotherWorkspace(): void
    {
        $otherWorkspace = $this->insertWorkspace('Other account workspace');
        $accountId = $this->insertAccount('returning@example.test', 'older secure password phrase');
        $otherUserId = $this->insertWorkspaceMembership($otherWorkspace, $accountId, 'Returning Member', 'returning@example.test', 'developer');
        $admin = $this->login($this->adminEmail);
        $invite = $this->cookieRequest('POST', '/api/v1/users/invites', $admin['cookie'], [
            'name' => 'Returning Member',
            'email' => 'returning@example.test',
            'role' => 'developer',
        ], $admin['csrf']);
        self::assertSame(201, $invite->status, json_encode($invite->body));
        $token = $this->tokenFromCredentialUrl($invite->body['invite']['invite_url'], 'invite');

        $inspection = $this->request('POST', '/api/v1/auth/invites/inspect', ['token' => $token]);
        self::assertSame(200, $inspection->status);
        self::assertFalse($inspection->body['invite']['password_required']);

        $accepted = $this->request('POST', '/api/v1/auth/invites/accept', ['token' => $token]);
        self::assertSame(200, $accepted->status, json_encode($accepted->body));
        self::assertSame('returning@example.test', $accepted->body['user']['email']);

        $newMembership = $this->pdo->prepare('SELECT account_id FROM users WHERE workspace_id = :workspace_id AND email = :email');
        $newMembership->execute(['workspace_id' => $this->workspaceId, 'email' => 'returning@example.test']);
        self::assertSame($accountId, (int) $newMembership->fetchColumn());
        self::assertSame($accountId, $this->accountIdForUser($otherWorkspace, $otherUserId));
        self::assertSame('returning@example.test', $this->login('returning@example.test', 'older secure password phrase')['user']['email']);
    }

    public function testAdminGeneratesOneUsePasswordResetLinkAndCompletionRevokesSessions(): void
    {
        $admin = $this->login($this->adminEmail);
        $sessionCookie = $admin['cookie'];
        $generated = $this->cookieRequest(
            'POST',
            '/api/v1/users/' . $this->adminId . '/password-reset',
            $admin['cookie'],
            [],
            $admin['csrf'],
        );
        self::assertSame(200, $generated->status, json_encode($generated->body));
        self::assertArrayHasKey('reset_url', $generated->body);
        $token = $this->tokenFromCredentialUrl($generated->body['reset_url'], 'reset');

        $completed = $this->request('POST', '/api/v1/auth/password-reset/complete', [
            'token' => $token,
            'password' => 'an entirely new password phrase',
        ]);
        self::assertSame(204, $completed->status);
        self::assertSame(401, $this->request('GET', '/api/v1/auth/me', cookies: ['tangent_session' => $sessionCookie])->status);
        self::assertSame(401, $this->request('POST', '/api/v1/auth/login', [
            'email' => $this->adminEmail,
            'password' => $this->password,
        ])->status);
        self::assertSame($this->adminEmail, $this->login($this->adminEmail, 'an entirely new password phrase')['user']['email']);
        self::assertSame(400, $this->request('POST', '/api/v1/auth/password-reset/complete', [
            'token' => $token,
            'password' => 'yet another password phrase',
        ])->status);
    }

    public function testLegacyPasswordHashesAreUpgradedOnLogin(): void
    {
        $legacyHash = password_hash($this->password, PASSWORD_BCRYPT);
        $update = $this->pdo->prepare('UPDATE user_accounts SET password_hash = :hash WHERE email = :email');
        $update->execute(['hash' => $legacyHash, 'email' => $this->adminEmail]);

        self::assertSame($this->adminEmail, $this->login($this->adminEmail)['user']['email']);

        $query = $this->pdo->prepare('SELECT password_hash FROM user_accounts WHERE email = :email');
        $query->execute(['email' => $this->adminEmail]);
        self::assertSame('argon2id', password_get_info((string) $query->fetchColumn())['algoName']);
    }

    public function testInviteAcceptanceAndResetCompletionUseRateLimitsAndPasswordPolicy(): void
    {
        $admin = $this->login($this->adminEmail);
        $created = $this->cookieRequest('POST', '/api/v1/users', $admin['cookie'], [
            'name' => 'Long Password User',
            'email' => 'long-password@example.test',
            'password' => 'short-enough-1',
        ], $admin['csrf']);
        self::assertSame(422, $created->status);
        self::assertSame('password_rejected', $created->body['error']['code']);

        for ($attempt = 0; $attempt < 3; $attempt++) {
            self::assertSame(400, $this->request(
                'POST',
                '/api/v1/auth/invites/accept',
                ['token' => str_repeat('0', 64)],
                remoteAddress: '192.0.2.44',
            )->status);
        }
        for ($attempt = 0; $attempt < 2; $attempt++) {
            self::assertSame(400, $this->request(
                'POST',
                '/api/v1/auth/invites/inspect',
                ['token' => str_repeat('2', 64)],
                remoteAddress: '192.0.2.44',
            )->status);
        }
        self::assertSame(429, $this->request(
            'POST',
            '/api/v1/auth/invites/accept',
            ['token' => str_repeat('1', 64)],
            remoteAddress: '192.0.2.44',
        )->status);

        for ($attempt = 0; $attempt < 5; $attempt++) {
            self::assertSame(400, $this->request(
                'POST',
                '/api/v1/auth/password-reset/complete',
                ['token' => str_repeat((string) ($attempt + 3), 64), 'password' => 'another secure password phrase'],
                remoteAddress: '192.0.2.45',
            )->status);
        }
        self::assertSame(429, $this->request(
            'POST',
            '/api/v1/auth/password-reset/complete',
            ['token' => str_repeat('9', 64), 'password' => 'another secure password phrase'],
            remoteAddress: '192.0.2.45',
        )->status);
    }

    private function tokenFromCredentialUrl(string $url, string $type): string
    {
        self::assertMatchesRegularExpression('/#' . preg_quote($type, '/') . '=([a-f0-9]{64})$/', $url);
        preg_match('/#' . preg_quote($type, '/') . '=([a-f0-9]{64})$/', $url, $matches);
        return $matches[1];
    }

    private function cookieFrom(\Tangent\Core\Response $response): string
    {
        foreach ((array) ($response->headers['set-cookie'] ?? []) as $cookie) {
            if (preg_match('/(?:^|;\s*)tangent_session=([^;]*)/', $cookie, $matches) === 1) {
                return rawurldecode($matches[1]);
            }
        }
        self::fail('Expected session cookie.');
    }

    private function projectHasMember(int $projectId, int $userId): bool
    {
        $statement = $this->pdo->prepare('SELECT 1 FROM project_memberships WHERE workspace_id = :workspace_id AND project_id = :project_id AND user_id = :user_id');
        $statement->execute(['workspace_id' => $this->workspaceId, 'project_id' => $projectId, 'user_id' => $userId]);
        return $statement->fetchColumn() !== false;
    }

    private function insertWorkspace(string $name): int
    {
        $statement = $this->pdo->prepare('INSERT INTO workspaces (name, slug) VALUES (:name, :slug)');
        $statement->execute(['name' => $name, 'slug' => 'other-' . bin2hex(random_bytes(5))]);
        return (int) $this->pdo->lastInsertId();
    }

    private function insertAccount(string $email, string $password): int
    {
        $statement = $this->pdo->prepare('INSERT INTO user_accounts (email, password_hash) VALUES (:email, :password_hash)');
        $statement->execute([
            'email' => $email,
            'password_hash' => password_hash($password, PASSWORD_ARGON2ID),
        ]);
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

    private function accountIdForUser(int $workspaceId, int $userId): int
    {
        $statement = $this->pdo->prepare('SELECT account_id FROM users WHERE workspace_id = :workspace_id AND id = :id');
        $statement->execute(['workspace_id' => $workspaceId, 'id' => $userId]);
        return (int) $statement->fetchColumn();
    }
}
