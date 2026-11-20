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

    public function testLoungePresenceListsActiveInternalMembersAndExpiresStaleViewers(): void
    {
        $this->createGuest();
        $this->createInactiveDeveloper();
        $admin = $this->login($this->adminEmail);
        $developer = $this->login($this->developerEmail);

        $adminHeartbeat = $this->postLoungePresence($admin);
        self::assertSame(200, $adminHeartbeat->status, json_encode($adminHeartbeat->body));
        self::assertSame([
            ['id' => $this->adminId, 'name' => 'Admin'],
        ], $adminHeartbeat->body['members']);

        $developerHeartbeat = $this->postLoungePresence($developer);
        self::assertSame(200, $developerHeartbeat->status, json_encode($developerHeartbeat->body));
        self::assertSame([
            ['id' => $this->adminId, 'name' => 'Admin'],
            ['id' => $this->developerId, 'name' => 'Developer'],
        ], $developerHeartbeat->body['members']);

        $stalePresence = $this->pdo->prepare(
            'UPDATE lounge_presence SET last_seen_at = UTC_TIMESTAMP() - INTERVAL 2 MINUTE
             WHERE workspace_id = :workspace_id AND user_id = :user_id'
        );
        $stalePresence->execute([
            'workspace_id' => $this->workspaceId,
            'user_id' => $this->developerId,
        ]);
        $afterExpiry = $this->postLoungePresence($admin);
        self::assertSame([
            ['id' => $this->adminId, 'name' => 'Admin'],
        ], $afterExpiry->body['members']);
    }

    public function testReadOnlyLoungePresenceListsCurrentNamesWithoutMarkingTheViewerPresent(): void
    {
        $admin = $this->login($this->adminEmail);
        $developer = $this->login($this->developerEmail);

        $empty = $this->getLoungePresence($developer);
        self::assertSame(200, $empty->status, json_encode($empty->body));
        self::assertSame([], $empty->body['members']);
        self::assertSame(0, $this->loungePresenceCount($this->developerId));

        $this->postLoungePresence($admin);
        $visible = $this->getLoungePresence($developer);
        self::assertSame([
            ['id' => $this->adminId, 'name' => 'Admin'],
        ], $visible->body['members']);
        self::assertSame(0, $this->loungePresenceCount($this->developerId));
    }

    public function testGuestsCannotReadOrPostInTheLounge(): void
    {
        $this->createGuest();
        $guest = $this->login('lounge-guest@example.test');

        self::assertSame(403, $this->cookieRequest('GET', '/api/v1/lounge/members', $guest['cookie'])->status);
        self::assertSame(403, $this->cookieRequest('GET', '/api/v1/lounge/messages', $guest['cookie'])->status);
        self::assertSame(403, $this->getLoungePresence($guest)->status);
        self::assertSame(403, $this->postLoungePresence($guest)->status);
        self::assertSame(403, $this->cookieRequest(
            'POST',
            '/api/v1/lounge/messages',
            $guest['cookie'],
            ['body' => 'Should not be visible'],
            $guest['csrf'],
        )->status);
    }

    public function testWorkspaceMembersCanListInternalLoungeMentionSuggestions(): void
    {
        $this->createGuest();
        $this->createInactiveDeveloper();
        $admin = $this->login($this->adminEmail);
        $developer = $this->login($this->developerEmail);

        $adminResponse = $this->cookieRequest('GET', '/api/v1/lounge/members', $admin['cookie']);
        self::assertSame(200, $adminResponse->status, json_encode($adminResponse->body));
        self::assertSame(['Admin', 'Developer'], array_column($adminResponse->body['members'], 'name'));
        self::assertSame([$this->adminId, $this->developerId], array_column($adminResponse->body['members'], 'id'));
        self::assertSame(['id', 'name', 'email'], array_keys($adminResponse->body['members'][0]));
        $developerResponse = $this->cookieRequest('GET', '/api/v1/lounge/members', $developer['cookie']);
        self::assertSame(200, $developerResponse->status, json_encode($developerResponse->body));
        self::assertSame($adminResponse->body['members'], $developerResponse->body['members']);
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
            ['body' => '@Developer A workspace-wide note'],
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

    private function createInactiveDeveloper(): void
    {
        $account = $this->pdo->prepare(
            'INSERT INTO user_accounts (email, password_hash) VALUES (:email, :password_hash)'
        );
        $account->execute([
            'email' => 'inactive-lounge@example.test',
            'password_hash' => password_hash($this->password, PASSWORD_ARGON2ID),
        ]);

        $user = $this->pdo->prepare(
            'INSERT INTO users (workspace_id, account_id, name, email, role, is_active)
             VALUES (:workspace_id, :account_id, :name, :email, :role, 0)'
        );
        $user->execute([
            'workspace_id' => $this->workspaceId,
            'account_id' => (int) $this->pdo->lastInsertId(),
            'name' => 'Inactive Member',
            'email' => 'inactive-lounge@example.test',
            'role' => 'developer',
        ]);
    }

    private function postLoungePresence(array $user): \Tangent\Core\Response
    {
        return $this->cookieRequest(
            'POST',
            '/api/v1/lounge/presence',
            $user['cookie'],
            [],
            $user['csrf'],
        );
    }

    private function getLoungePresence(array $user): \Tangent\Core\Response
    {
        return $this->cookieRequest('GET', '/api/v1/lounge/presence', $user['cookie']);
    }

    private function loungePresenceCount(int $userId): int
    {
        $statement = $this->pdo->prepare(
            'SELECT COUNT(*) FROM lounge_presence WHERE workspace_id = :workspace_id AND user_id = :user_id'
        );
        $statement->execute(['workspace_id' => $this->workspaceId, 'user_id' => $userId]);
        return (int) $statement->fetchColumn();
    }
}
