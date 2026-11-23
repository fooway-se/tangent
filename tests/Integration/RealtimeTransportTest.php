<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use Tangent\Core\AppConfig;
use Tangent\Core\Application;
use Tangent\Tests\Support\ApiTestCase;

final class RealtimeTransportTest extends ApiTestCase
{
    public function testAuthenticatedWorkspaceMutationsAdvanceTheRealtimeCursor(): void
    {
        $projectId = $this->insertProject('Realtime project', 'realtime-project', $this->adminId);
        $this->insertProjectChannel($projectId);
        $admin = $this->login($this->adminEmail);
        $readCursor = $this->pdo->prepare(
            'SELECT last_cursor FROM workspace_realtime_cursors WHERE workspace_id = :workspace_id'
        );
        $readCursor->execute(['workspace_id' => $this->workspaceId]);
        self::assertFalse($readCursor->fetchColumn());

        $response = $this->cookieRequest(
            'POST',
            '/api/v1/projects/' . $projectId . '/messages',
            $admin['cookie'],
            ['body' => 'Wake the other tabs.'],
            $admin['csrf'],
        );

        self::assertSame(201, $response->status);
        $readCursor->execute(['workspace_id' => $this->workspaceId]);
        self::assertGreaterThan(0, (int) $readCursor->fetchColumn());
    }

    public function testRealtimeStreamIsDisabledByDefaultSoPollingRemainsTheSafeDefault(): void
    {
        $admin = $this->login($this->adminEmail);
        $response = $this->cookieRequest('GET', '/api/v1/events/stream', $admin['cookie']);

        self::assertSame(204, $response->status);
        self::assertFalse($response->isStreamed());
    }

    public function testEnabledRealtimeStreamHonorsTheGlobalConnectionLimit(): void
    {
        $this->application = Application::create(
            $this->pdo,
            new AppConfig(
                $this->workspaceId,
                false,
                realtimeStreamEnabled: true,
                realtimeMaxConnections: 1,
            ),
            null,
            $this->mailer,
        );
        $admin = $this->login($this->adminEmail);
        $developer = $this->login($this->developerEmail);

        $accepted = $this->cookieRequest('GET', '/api/v1/events/stream', $admin['cookie']);
        $limited = $this->cookieRequest('GET', '/api/v1/events/stream', $developer['cookie']);

        self::assertSame(200, $accepted->status);
        self::assertSame('text/event-stream; charset=utf-8', $accepted->headers['content-type'] ?? null);
        self::assertSame('no-cache, no-transform', $accepted->headers['cache-control'] ?? null);
        self::assertSame('no', $accepted->headers['x-accel-buffering'] ?? null);
        self::assertTrue($accepted->isStreamed());
        self::assertSame(204, $limited->status);
        self::assertFalse($limited->isStreamed());
    }

    public function testEnabledRealtimeStreamAllowsOnlyOneStreamPerUser(): void
    {
        $this->application = Application::create(
            $this->pdo,
            new AppConfig(
                $this->workspaceId,
                false,
                realtimeStreamEnabled: true,
                realtimeMaxConnections: 2,
            ),
            null,
            $this->mailer,
        );
        $admin = $this->login($this->adminEmail);
        $first = $this->cookieRequest('GET', '/api/v1/events/stream', $admin['cookie']);
        $duplicate = $this->cookieRequest('GET', '/api/v1/events/stream', $admin['cookie']);

        self::assertSame(200, $first->status);
        self::assertSame(204, $duplicate->status);
    }

    public function testEnabledRealtimeStreamUsesTheSessionAndReturnsAnUnbufferedEventStream(): void
    {
        $this->application = Application::create(
            $this->pdo,
            new AppConfig($this->workspaceId, false, realtimeStreamEnabled: true),
            null,
            $this->mailer,
        );
        $admin = $this->login($this->adminEmail);
        $response = $this->cookieRequest('GET', '/api/v1/events/stream', $admin['cookie']);

        self::assertSame(200, $response->status);
        self::assertSame('text/event-stream; charset=utf-8', $response->headers['content-type'] ?? null);
        self::assertSame('no-cache, no-transform', $response->headers['cache-control'] ?? null);
        self::assertSame('no', $response->headers['x-accel-buffering'] ?? null);
        self::assertTrue($response->isStreamed());
    }

    public function testPresenceHeartbeatsDoNotWakeEveryRealtimePoller(): void
    {
        $projectId = $this->insertProject('Presence project', 'presence-project', $this->adminId);
        $this->insertProjectChannel($projectId);
        $admin = $this->login($this->adminEmail);
        $response = $this->cookieRequest(
            'POST',
            '/api/v1/projects/' . $projectId . '/presence',
            $admin['cookie'],
            [],
            $admin['csrf'],
        );
        self::assertSame(200, $response->status);

        $cursor = $this->pdo->prepare(
            'SELECT last_cursor FROM workspace_realtime_cursors WHERE workspace_id = :workspace_id'
        );
        $cursor->execute(['workspace_id' => $this->workspaceId]);
        self::assertFalse($cursor->fetchColumn());
    }

    public function testRealtimeStreamRejectsGuestsAndMissingSessions(): void
    {
        $missingSession = $this->request('GET', '/api/v1/events/stream');
        self::assertSame(401, $missingSession->status);

        $guestPassword = 'a-valid-test-password';
        $account = $this->pdo->prepare(
            'INSERT INTO user_accounts (email, password_hash) VALUES (:email, :password_hash)'
        );
        $account->execute([
            'email' => 'client@example.test',
            'password_hash' => password_hash($guestPassword, PASSWORD_ARGON2ID),
        ]);
        $accountId = (int) $this->pdo->lastInsertId();
        $member = $this->pdo->prepare(
            'INSERT INTO users (workspace_id, account_id, name, email, role, is_active)
             VALUES (:workspace_id, :account_id, :name, :email, :role, 1)'
        );
        $member->execute([
            'workspace_id' => $this->workspaceId,
            'account_id' => $accountId,
            'name' => 'Client',
            'email' => 'client@example.test',
            'role' => 'guest',
        ]);
        $guest = $this->login('client@example.test', $guestPassword);
        $response = $this->cookieRequest('GET', '/api/v1/events/stream', $guest['cookie']);
        self::assertSame(403, $response->status);
    }

    private function insertProjectChannel(int $projectId): void
    {
        $channel = $this->pdo->prepare(
            'INSERT INTO channels (workspace_id, project_id, channel_type)
             VALUES (:workspace_id, :project_id, :channel_type)'
        );
        $channel->execute([
            'workspace_id' => $this->workspaceId,
            'project_id' => $projectId,
            'channel_type' => 'project',
        ]);
    }
}
