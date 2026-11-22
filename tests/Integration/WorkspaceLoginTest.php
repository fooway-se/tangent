<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use Tangent\Core\Response;
use Tangent\Tests\Support\ApiTestCase;

final class WorkspaceLoginTest extends ApiTestCase
{
    public function testAccountWithOnlyASecondaryWorkspaceMembershipCanSignIn(): void
    {
        $workspaceId = $this->insertWorkspace('Secondary only workspace');
        $email = 'secondary-only@example.test';
        $accountId = $this->insertAccount($email, 'a secondary workspace password phrase');
        $this->insertMembership($workspaceId, $accountId, 'Secondary Developer', $email, 'developer');

        $response = $this->loginRequest($email, 'a secondary workspace password phrase');

        self::assertSame(200, $response->status, json_encode($response->body));
        self::assertSame($workspaceId, $response->body['user']['workspace_id']);
        self::assertSame('developer', $response->body['user']['role']);
        self::assertSame($workspaceId, $this->workspaceCookie($response));
        $this->assertScopedSessionWorks($response, $workspaceId);
    }

    public function testInactiveDefaultMembershipFallsBackToActiveSecondaryWorkspace(): void
    {
        $accountId = $this->accountId($this->adminId);
        $secondaryWorkspaceId = $this->insertWorkspace('Inactive Default Secondary');
        $this->insertMembership(
            $secondaryWorkspaceId,
            $accountId,
            'Secondary Developer',
            $this->adminEmail,
            'developer',
        );
        $this->pdo->prepare('UPDATE users SET is_active = 0 WHERE workspace_id = :workspace_id AND id = :user_id')
            ->execute(['workspace_id' => $this->workspaceId, 'user_id' => $this->adminId]);

        $response = $this->loginRequest($this->adminEmail, $this->password);

        self::assertSame(200, $response->status, json_encode($response->body));
        self::assertSame($secondaryWorkspaceId, $response->body['user']['workspace_id']);
        self::assertSame($secondaryWorkspaceId, $this->workspaceCookie($response));
        $this->assertScopedSessionWorks($response, $secondaryWorkspaceId);
    }

    public function testAccountWithoutActiveMembershipKeepsNormalCredentialFailure(): void
    {
        $email = 'inactive-everywhere@example.test';
        $accountId = $this->insertAccount($email, 'an inactive membership password phrase');
        $userId = $this->insertMembership($this->workspaceId, $accountId, 'Inactive User', $email, 'developer');
        $this->pdo->prepare('UPDATE users SET is_active = 0 WHERE workspace_id = :workspace_id AND id = :user_id')
            ->execute(['workspace_id' => $this->workspaceId, 'user_id' => $userId]);

        $response = $this->loginRequest($email, 'an inactive membership password phrase');

        self::assertSame(401, $response->status);
        self::assertSame('invalid_credentials', $response->body['error']['code']);
    }

    public function testActiveDefaultWorkspaceRemainsTheLoginLandingWorkspace(): void
    {
        $accountId = $this->accountId($this->adminId);
        $this->insertMembership(
            $this->insertWorkspace('Another active workspace'),
            $accountId,
            'Secondary Admin',
            $this->adminEmail,
            'admin',
        );

        $response = $this->loginRequest($this->adminEmail, $this->password);

        self::assertSame(200, $response->status, json_encode($response->body));
        self::assertSame($this->workspaceId, $response->body['user']['workspace_id']);
        self::assertSame($this->workspaceId, $this->workspaceCookie($response));
    }

    private function loginRequest(string $email, string $password): Response
    {
        return $this->request('POST', '/api/v1/auth/login', ['email' => $email, 'password' => $password]);
    }

    private function assertScopedSessionWorks(Response $login, int $workspaceId): void
    {
        $me = $this->request('GET', '/api/v1/auth/me', cookies: [
            'tangent_session' => $this->sessionCookie($login),
            'tangent_workspace' => (string) $workspaceId,
        ]);
        self::assertSame(200, $me->status, json_encode($me->body));
        self::assertSame($workspaceId, $me->body['user']['workspace_id']);
    }

    private function sessionCookie(Response $response): string
    {
        foreach ((array) ($response->headers['set-cookie'] ?? []) as $cookie) {
            if (preg_match('/(?:^|;\s*)tangent_session=([^;]*)/', $cookie, $matches) === 1) {
                return rawurldecode($matches[1]);
            }
        }
        self::fail('Expected a session cookie from login.');
    }

    private function workspaceCookie(Response $response): int
    {
        foreach ((array) ($response->headers['set-cookie'] ?? []) as $cookie) {
            if (preg_match('/(?:^|;\s*)tangent_workspace=([^;]*)/', $cookie, $matches) === 1) {
                return (int) $matches[1];
            }
        }
        self::fail('Expected a workspace cookie from login.');
    }

    private function accountId(int $userId): int
    {
        $statement = $this->pdo->prepare('SELECT account_id FROM users WHERE workspace_id = :workspace_id AND id = :id');
        $statement->execute(['workspace_id' => $this->workspaceId, 'id' => $userId]);
        return (int) $statement->fetchColumn();
    }

    private function insertWorkspace(string $name): int
    {
        $statement = $this->pdo->prepare('INSERT INTO workspaces (name, slug) VALUES (:name, :slug)');
        $statement->execute(['name' => $name, 'slug' => 'login-' . bin2hex(random_bytes(6))]);
        return (int) $this->pdo->lastInsertId();
    }

    private function insertAccount(string $email, string $password): int
    {
        $statement = $this->pdo->prepare('INSERT INTO user_accounts (email, password_hash) VALUES (:email, :hash)');
        $statement->execute(['email' => $email, 'hash' => password_hash($password, PASSWORD_ARGON2ID)]);
        return (int) $this->pdo->lastInsertId();
    }

    private function insertMembership(int $workspaceId, int $accountId, string $name, string $email, string $role): int
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
}
