<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use PDO;
use Tangent\Core\AppConfig;
use Tangent\Core\Application;
use Tangent\Core\Database;
use Tangent\Core\Gateway;
use Tangent\Core\Request;
use Tangent\Core\Response;
use Tangent\Tests\Support\ApiTestCase;

final class ChatEventFeedConcurrencyTest extends ApiTestCase
{
    public function testLateCommitCannotBeSkippedAfterPollingALaterMessageId(): void
    {
        $admin = $this->login($this->adminEmail);
        $created = $this->cookieRequest(
            'POST',
            '/api/v1/projects',
            $admin['cookie'],
            ['name' => 'Commit ordered chat feed'],
            $admin['csrf'],
        );
        self::assertSame(201, $created->status, json_encode($created->body));
        $projectId = (int) $created->body['project']['id'];
        $workspaceId = $this->workspaceId;

        $this->pdo->commit();
        $this->pdo->beginTransaction();
        $otherPdo = $this->testDatabaseConnection();
        $otherPdo->exec('SET SESSION innodb_lock_wait_timeout = 2');
        $otherApplication = Application::create($otherPdo, new AppConfig($workspaceId, false));

        try {
            $first = $this->postMessage($projectId, $admin, ['body' => 'Allocated first, committed second']);
            self::assertSame(201, $first->status, json_encode($first->body));

            $secondAttempt = $this->postMessageOn($otherApplication, $projectId, $admin, 'Committed first, allocated second');
            self::assertSame(500, $secondAttempt->status, 'A second connection must wait for the first transaction to commit before receiving a feed cursor.');
            $beforeFirstCommit = $this->getEventsOn($otherApplication, $admin['cookie'], 0);
            self::assertSame(200, $beforeFirstCommit->status, json_encode($beforeFirstCommit->body));
            self::assertSame([], $beforeFirstCommit->body['events']);

            $this->pdo->commit();
            $second = $this->postMessageOn($otherApplication, $projectId, $admin, 'Committed first, allocated second');
            self::assertSame(201, $second->status, json_encode($second->body));

            $afterFirstCommit = $this->getEventsOn($otherApplication, $admin['cookie'], 0);
            self::assertSame(200, $afterFirstCommit->status, json_encode($afterFirstCommit->body));
            $delivered = [
                ...$beforeFirstCommit->body['events'],
                ...$afterFirstCommit->body['events'],
            ];

            self::assertCount(2, array_unique(array_column($delivered, 'id')));
            self::assertSame(
                ['Allocated first, committed second', 'Committed first, allocated second'],
                array_column($delivered, 'body'),
            );
            self::assertSame(
                [(int) $first->body['message']['id'], (int) $second->body['message']['id']],
                array_map('intval', array_column($delivered, 'id')),
            );
            self::assertSame([1, 2], array_map('intval', array_column($delivered, 'feed_cursor')));

            $legacyPoll = $this->getEventsOn(
                $otherApplication,
                $admin['cookie'],
                (int) $second->body['message']['id'],
                'since',
            );
            self::assertSame(200, $legacyPoll->status, json_encode($legacyPoll->body));
            self::assertSame([], $legacyPoll->body['events']);
        } finally {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            $this->cleanCommittedWorkspace($workspaceId);
        }
    }

    private function postMessage(int $projectId, array $user, array $body): Response
    {
        return $this->cookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/messages",
            $user['cookie'],
            $body,
            $user['csrf'],
        );
    }

    private function postMessageOn(Gateway $application, int $projectId, array $user, string $body): Response
    {
        return $application->handle(Request::json(
            'POST',
            "/api/v1/projects/{$projectId}/messages",
            ['body' => $body],
            ['X-CSRF-Token' => $user['csrf']],
            ['tangent_session' => $user['cookie']],
        ));
    }

    private function getEventsOn(Gateway $application, string $cookie, int $cursor, string $parameter = 'cursor'): Response
    {
        return $application->handle(Request::fromHttp(
            'GET',
            '/api/v1/events',
            [$parameter => (string) $cursor],
            [],
            ['tangent_session' => $cookie],
            '',
            '127.0.0.1',
        ));
    }

    private function testDatabaseConnection(): PDO
    {
        return Database::connect(
            getenv('TANGENT_TEST_DB_HOST') ?: '127.0.0.1',
            (int) (getenv('TANGENT_TEST_DB_PORT') ?: 3306),
            getenv('TANGENT_TEST_DB_NAME') ?: 'tangent_test_suite',
            getenv('TANGENT_TEST_DB_USER') ?: 'tangent',
            getenv('TANGENT_TEST_DB_PASSWORD') ?: 'tangent_dev_password',
        )->pdo();
    }

    private function cleanCommittedWorkspace(int $workspaceId): void
    {
        $cleanup = $this->testDatabaseConnection();
        $accounts = $cleanup->prepare('SELECT account_id FROM users WHERE workspace_id = :workspace_id');
        $accounts->execute(['workspace_id' => $workspaceId]);
        $accountIds = array_map('intval', $accounts->fetchAll(PDO::FETCH_COLUMN));

        $cleanup->exec('SET FOREIGN_KEY_CHECKS = 0');
        $tables = $cleanup->query(
            'SELECT TABLE_NAME FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = \'workspace_id\'
             GROUP BY TABLE_NAME'
        )->fetchAll(PDO::FETCH_COLUMN);
        foreach ($tables as $table) {
            $cleanup->prepare('DELETE FROM `' . str_replace('`', '``', (string) $table) . '` WHERE workspace_id = :workspace_id')
                ->execute(['workspace_id' => $workspaceId]);
        }
        $cleanup->prepare('DELETE FROM workspaces WHERE id = :id')->execute(['id' => $workspaceId]);
        foreach ($accountIds as $accountId) {
            $cleanup->prepare('DELETE FROM user_accounts WHERE id = :id')->execute(['id' => $accountId]);
        }
        $cleanup->exec('SET FOREIGN_KEY_CHECKS = 1');
    }
}
