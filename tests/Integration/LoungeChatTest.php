<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use Tangent\Tests\Support\ApiTestCase;

final class LoungeChatTest extends ApiTestCase
{
    public function testWorkspaceMembersShareOneLoungeAndPollMessages(): void
    {
        $admin = $this->login($this->adminEmail);
        $developer = $this->login($this->developerEmail);

        $initial = $this->cookieRequest('GET', '/api/v1/lounge/messages', $admin['cookie']);
        self::assertSame(200, $initial->status, json_encode($initial->body));
        self::assertSame([], $initial->body['messages']);
        $etag = $initial->headers['etag'] ?? null;
        self::assertIsString($etag);

        $unchanged = $this->request(
            'GET',
            '/api/v1/lounge/messages',
            [],
            ['If-None-Match' => $etag],
            ['tangent_session' => $admin['cookie']],
        );
        self::assertSame(304, $unchanged->status);

        $sent = $this->cookieRequest(
            'POST',
            '/api/v1/lounge/messages',
            $developer['cookie'],
            ['body' => 'Coffee after standup?'],
            $developer['csrf'],
        );
        self::assertSame(201, $sent->status, json_encode($sent->body));
        self::assertSame('Developer', $sent->body['message']['author_name']);
        self::assertFalse($sent->body['message']['is_client_visible']);

        $updated = $this->request(
            'GET',
            '/api/v1/lounge/messages',
            [],
            ['If-None-Match' => $etag],
            ['tangent_session' => $admin['cookie']],
        );
        self::assertSame(200, $updated->status, json_encode($updated->body));
        self::assertCount(1, $updated->body['messages']);
        self::assertSame('Coffee after standup?', $updated->body['messages'][0]['body']);

        $channel = $this->pdo->prepare(
            'SELECT COUNT(*) AS channel_count, MIN(project_id) AS project_id,
                    MIN(channel_type) AS channel_type, MIN(name) AS name
             FROM channels WHERE workspace_id = :workspace_id'
        );
        $channel->execute(['workspace_id' => $this->workspaceId]);
        $lounge = $channel->fetch(\PDO::FETCH_ASSOC);
        self::assertSame(1, (int) $lounge['channel_count']);
        self::assertNull($lounge['project_id']);
        self::assertSame('standalone', $lounge['channel_type']);
        self::assertSame('Lounge', $lounge['name']);

        $this->cookieRequest('GET', '/api/v1/lounge/messages', $developer['cookie']);
        $count = $this->pdo->prepare(
            'SELECT COUNT(*) FROM channels WHERE workspace_id = :workspace_id'
        );
        $count->execute(['workspace_id' => $this->workspaceId]);
        self::assertSame(1, (int) $count->fetchColumn(), 'Opening Lounge again reuses the workspace channel.');
    }

    public function testGuestsCannotReadOrPostInTheLounge(): void
    {
        $this->createGuest();
        $guest = $this->login('lounge-guest@example.test');

        self::assertSame(403, $this->cookieRequest('GET', '/api/v1/lounge/messages', $guest['cookie'])->status);
        self::assertSame(403, $this->cookieRequest(
            'POST',
            '/api/v1/lounge/messages',
            $guest['cookie'],
            ['body' => 'Should not be visible'],
            $guest['csrf'],
        )->status);
    }

    public function testLoungeMessagesDoNotAppearInProjectInboxEvents(): void
    {
        $admin = $this->login($this->adminEmail);
        $before = $this->request('GET', '/api/v1/inbox/events', [], [], ['tangent_session' => $admin['cookie']]);
        self::assertSame([], $before->body['events']);

        $sent = $this->cookieRequest(
            'POST',
            '/api/v1/lounge/messages',
            $admin['cookie'],
            ['body' => 'A workspace-wide note'],
            $admin['csrf'],
        );
        self::assertSame(201, $sent->status, json_encode($sent->body));
        $after = $this->request('GET', '/api/v1/inbox/events', [], [], ['tangent_session' => $admin['cookie']]);
        self::assertSame([], $after->body['events']);
    }

    private function createGuest(): void
    {
        $account = $this->pdo->prepare(
            'INSERT INTO user_accounts (email, password_hash) VALUES (:email, :password_hash)'
        );
        $account->execute([
            'email' => 'lounge-guest@example.test',
            'password_hash' => password_hash($this->password, PASSWORD_ARGON2ID),
        ]);
        $accountId = (int) $this->pdo->lastInsertId();

        $user = $this->pdo->prepare(
            'INSERT INTO users (workspace_id, account_id, name, email, role, is_active)
             VALUES (:workspace_id, :account_id, :name, :email, :role, 1)'
        );
        $user->execute([
            'workspace_id' => $this->workspaceId,
            'account_id' => $accountId,
            'name' => 'Lounge guest',
            'email' => 'lounge-guest@example.test',
            'role' => 'guest',
        ]);
    }
}
