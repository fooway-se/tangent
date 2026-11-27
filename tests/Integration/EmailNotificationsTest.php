<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use DateTimeImmutable;
use PDO;
use Tangent\Core\AppConfig;
use Tangent\Core\Application;
use Tangent\Core\Database;
use Tangent\Modules\Auth\PasswordSecurity;
use Tangent\Modules\Auth\TokenRepository;
use Tangent\Modules\Auth\UserRepository;
use Tangent\Modules\Chat\ChatRepository;
use Tangent\Modules\Chat\ChatService;
use Tangent\Modules\EmailNotifications\EmailNotificationRepository;
use Tangent\Modules\EmailNotifications\EmailNotificationRunner;
use Tangent\Modules\Issues\IssueDiscussionRepository;
use Tangent\Modules\Issues\IssueRepository;
use Tangent\Modules\Issues\IssuesService;
use Tangent\Modules\Inbox\InboxEventRepository;
use Tangent\Modules\Inbox\InboxEvents;
use Tangent\Modules\Projects\MilestoneRepository;
use Tangent\Modules\Projects\ProjectRepository;
use Tangent\Modules\Workspaces\WorkspaceRepository;
use Tangent\Modules\Workspaces\WorkspaceService;
use Tangent\Tests\Support\ApiTestCase;

final class EmailNotificationsTest extends ApiTestCase
{
    public function testAdminCanManageOnlyTheirOwnSubscriptionInTheCurrentWorkspace(): void
    {
        $admin = $this->login($this->adminEmail);
        $secondAdminId = $this->insertMember('second-admin@example.test', 'Second Admin', 'admin');
        $secondAdmin = $this->login('second-admin@example.test');

        $default = $this->cookieRequest('GET', '/api/v1/workspace/notifications', $admin['cookie']);
        self::assertSame(200, $default->status, json_encode($default->body));
        self::assertSame([
            'enabled' => false,
            'frequency' => 'daily',
            'time_zone' => 'UTC',
            'next_send_at' => null,
        ], $default->body['settings']);

        $saved = $this->cookieRequest('PUT', '/api/v1/workspace/notifications', $admin['cookie'], [
            'enabled' => true,
            'frequency' => 'every_other_day',
            'time_zone' => 'Europe/Stockholm',
        ], $admin['csrf']);
        self::assertSame(200, $saved->status, json_encode($saved->body));
        self::assertTrue($saved->body['settings']['enabled']);
        self::assertSame('every_other_day', $saved->body['settings']['frequency']);
        self::assertSame('Europe/Stockholm', $saved->body['settings']['time_zone']);
        self::assertNotNull($saved->body['settings']['next_send_at']);

        $otherAdmin = $this->cookieRequest('GET', '/api/v1/workspace/notifications', $secondAdmin['cookie']);
        self::assertSame(200, $otherAdmin->status, json_encode($otherAdmin->body));
        self::assertFalse($otherAdmin->body['settings']['enabled']);
        self::assertSame('UTC', $otherAdmin->body['settings']['time_zone']);
        self::assertGreaterThan(0, $secondAdminId);
    }

    public function testOnlyAdminsCanManageSettingsAndFrequencyAndTimezoneAreValidated(): void
    {
        $developer = $this->login($this->developerEmail);
        $denied = $this->cookieRequest('GET', '/api/v1/workspace/notifications', $developer['cookie']);
        self::assertSame(403, $denied->status);

        $admin = $this->login($this->adminEmail);
        $frequency = $this->cookieRequest('PUT', '/api/v1/workspace/notifications', $admin['cookie'], [
            'enabled' => true,
            'frequency' => 'monthly',
            'time_zone' => 'UTC',
        ], $admin['csrf']);
        self::assertSame(422, $frequency->status);

        $timeZone = $this->cookieRequest('PUT', '/api/v1/workspace/notifications', $admin['cookie'], [
            'enabled' => true,
            'frequency' => 'daily',
            'time_zone' => 'Mars/Olympus_Mons',
        ], $admin['csrf']);
        self::assertSame(422, $timeZone->status);
    }

    public function testSameAccountHasIndependentNotificationSettingsInEachWorkspace(): void
    {
        $admin = $this->login($this->adminEmail);
        $firstSaved = $this->cookieRequest('PUT', '/api/v1/workspace/notifications', $admin['cookie'], [
            'enabled' => true,
            'frequency' => 'daily',
            'time_zone' => 'UTC',
        ], $admin['csrf']);
        self::assertSame(200, $firstSaved->status, json_encode($firstSaved->body));

        $accountQuery = $this->pdo->prepare(
            'SELECT account_id, email FROM users WHERE workspace_id = :workspace_id AND id = :user_id'
        );
        $accountQuery->execute(['workspace_id' => $this->workspaceId, 'user_id' => $this->adminId]);
        $account = $accountQuery->fetch(PDO::FETCH_ASSOC);
        $workspace = $this->pdo->prepare('INSERT INTO workspaces (name, slug) VALUES (:name, :slug)');
        $workspace->execute(['name' => 'Other workspace', 'slug' => 'other-' . bin2hex(random_bytes(4))]);
        $otherWorkspaceId = (int) $this->pdo->lastInsertId();
        $membership = $this->pdo->prepare(
            "INSERT INTO users (workspace_id, account_id, name, email, role, is_active)
             VALUES (:workspace_id, :account_id, 'Admin', :email, 'admin', 1)"
        );
        $membership->execute([
            'workspace_id' => $otherWorkspaceId,
            'account_id' => $account['account_id'],
            'email' => $account['email'],
        ]);
        $otherUserId = (int) $this->pdo->lastInsertId();
        $session = bin2hex(random_bytes(32));
        $csrf = bin2hex(random_bytes(32));
        (new TokenRepository($this->pdo))->create(
            $otherWorkspaceId,
            $otherUserId,
            hash('sha256', $session),
            'session',
            'Notification settings test',
            hash('sha256', $csrf),
            gmdate('Y-m-d H:i:s', time() + 3600),
        );

        $currentApplication = $this->application;
        try {
            $this->application = Application::create(
                $this->pdo,
                new AppConfig($otherWorkspaceId, false),
                null,
                $this->mailer,
            );
            $otherSaved = $this->cookieRequest('PUT', '/api/v1/workspace/notifications', $session, [
                'enabled' => true,
                'frequency' => 'weekly',
                'time_zone' => 'Europe/Stockholm',
            ], $csrf);
            self::assertSame(200, $otherSaved->status, json_encode($otherSaved->body));
        } finally {
            $this->application = $currentApplication;
        }

        $firstWorkspaceSettings = $this->cookieRequest('GET', '/api/v1/workspace/notifications', $admin['cookie']);
        self::assertSame('daily', $firstWorkspaceSettings->body['settings']['frequency']);
        self::assertSame('UTC', $firstWorkspaceSettings->body['settings']['time_zone']);
        $otherSettings = (new EmailNotificationRepository($this->pdo))->findSettings($otherWorkspaceId, $otherUserId);
        self::assertTrue($otherSettings['enabled']);
        self::assertSame('weekly', $otherSettings['frequency']);
        self::assertSame('Europe/Stockholm', $otherSettings['time_zone']);
    }

    public function testBlockingCanStartRestartAndClearItsWaitingPeriod(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Blocked issue lifecycle');
        $issueId = $this->createIssue($admin, $projectId, 'Blocked deployment');

        $blocked = $this->cookieRequest('PATCH', "/api/v1/issues/{$issueId}", $admin['cookie'], [
            'is_blocked' => true,
            'blocking_reason' => 'Waiting on a client decision',
        ], $admin['csrf']);
        self::assertSame(200, $blocked->status, json_encode($blocked->body));
        self::assertTrue($blocked->body['issue']['is_blocked']);
        self::assertSame('Waiting on a client decision', $blocked->body['issue']['blocking_reason']);
        self::assertNotNull($blocked->body['issue']['blocked_at']);
        $firstPeriod = $blocked->body['issue']['blocked_at'];

        $this->pdo->prepare(
            'UPDATE issues SET blocked_at = :blocked_at WHERE workspace_id = :workspace_id AND id = :id'
        )->execute(['blocked_at' => '2026-01-01 00:00:00', 'workspace_id' => $this->workspaceId, 'id' => $issueId]);
        $stillBlocked = $this->cookieRequest('PATCH', "/api/v1/issues/{$issueId}", $admin['cookie'], [
            'title' => 'Still blocked',
        ], $admin['csrf']);
        self::assertSame(200, $stillBlocked->status, json_encode($stillBlocked->body));
        self::assertSame('2026-01-01 00:00:00', $stillBlocked->body['issue']['blocked_at']);

        $unblocked = $this->cookieRequest('PATCH', "/api/v1/issues/{$issueId}", $admin['cookie'], [
            'is_blocked' => false,
        ], $admin['csrf']);
        self::assertSame(200, $unblocked->status, json_encode($unblocked->body));
        self::assertFalse($unblocked->body['issue']['is_blocked']);
        self::assertNull($unblocked->body['issue']['blocking_reason']);
        self::assertNull($unblocked->body['issue']['blocked_at']);

        $blockedAgain = $this->cookieRequest('PATCH', "/api/v1/issues/{$issueId}", $admin['cookie'], [
            'is_blocked' => true,
        ], $admin['csrf']);
        self::assertSame(200, $blockedAgain->status, json_encode($blockedAgain->body));
        self::assertNotSame('2026-01-01 00:00:00', $blockedAgain->body['issue']['blocked_at']);
        self::assertNotNull($firstPeriod);
    }

    public function testRunnerSendsOnlyAgedUnansweredConversationsAndBlockedOpenIssuesWithoutMessageText(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Customer launch');
        $guestId = $this->insertMember('client@example.test', 'Client', 'guest');
        $this->pdo->prepare(
            'INSERT INTO project_memberships (workspace_id, project_id, user_id) VALUES (:workspace_id, :project_id, :user_id)'
        )->execute(['workspace_id' => $this->workspaceId, 'project_id' => $projectId, 'user_id' => $guestId]);
        $channel = $this->pdo->prepare(
            'SELECT id FROM channels WHERE workspace_id = :workspace_id AND project_id = :project_id LIMIT 1'
        );
        $channel->execute(['workspace_id' => $this->workspaceId, 'project_id' => $projectId]);
        $channelId = (int) $channel->fetchColumn();
        $rootId = $this->insertMessage($channelId, $guestId, null, 'Private customer message excerpt', 30);
        $tooRecentId = $this->insertMessage($channelId, $guestId, null, 'Recent customer note', 23);
        $resolvedRootId = $this->insertMessage($channelId, $guestId, null, 'Answered message', 48);
        $this->insertMessage($channelId, $this->adminId, $resolvedRootId, 'Team response', 47);
        $inactiveTeamRootId = $this->insertMessage($channelId, $guestId, null, 'Waiting for active team', 40);
        $this->insertMessage($channelId, $this->developerId, $inactiveTeamRootId, 'Inactive team response', 39);
        $this->pdo->prepare('UPDATE users SET is_active = 0 WHERE workspace_id = :workspace_id AND id = :id')
            ->execute(['workspace_id' => $this->workspaceId, 'id' => $this->developerId]);

        $openIssueId = $this->createIssue($admin, $projectId, 'Deployment blocked');
        $recentIssueId = $this->createIssue($admin, $projectId, 'Recently blocked');
        $terminalIssueId = $this->createIssue($admin, $projectId, 'Completed blocker');
        $this->pdo->prepare(
            "UPDATE issues SET is_blocked = 1, blocked_at = UTC_TIMESTAMP() - INTERVAL 96 HOUR,
                blocking_reason = 'Waiting for credentials' WHERE workspace_id = :workspace_id AND id = :id"
        )->execute(['workspace_id' => $this->workspaceId, 'id' => $openIssueId]);
        $this->pdo->prepare(
            "UPDATE issues SET is_blocked = 1, blocked_at = UTC_TIMESTAMP() - INTERVAL 71 HOUR WHERE workspace_id = :workspace_id AND id = :id"
        )->execute(['workspace_id' => $this->workspaceId, 'id' => $recentIssueId]);
        $this->pdo->prepare(
            "UPDATE issues SET is_blocked = 1, blocked_at = UTC_TIMESTAMP() - INTERVAL 96 HOUR, status = 'done'
             WHERE workspace_id = :workspace_id AND id = :id"
        )->execute(['workspace_id' => $this->workspaceId, 'id' => $terminalIssueId]);

        $settings = $this->cookieRequest('PUT', '/api/v1/workspace/notifications', $admin['cookie'], [
            'enabled' => true,
            'frequency' => 'daily',
            'time_zone' => 'UTC',
        ], $admin['csrf']);
        self::assertSame(200, $settings->status, json_encode($settings->body));
        $this->pdo->prepare(
            'UPDATE email_notification_preferences SET next_send_at = UTC_TIMESTAMP() - INTERVAL 1 HOUR
             WHERE workspace_id = :workspace_id AND user_id = :user_id'
        )->execute(['workspace_id' => $this->workspaceId, 'user_id' => $this->adminId]);

        $runner = $this->notificationRunner();
        $result = $runner->run(new DateTimeImmutable('now', new \DateTimeZone('UTC')));

        self::assertSame(1, $result['sent']);
        self::assertCount(1, $this->mailer->messages);
        $mail = $this->mailer->messages[0];
        self::assertSame('admin@example.test', $mail['to']);
        self::assertStringContainsString('Test workspace', $mail['subject']);
        self::assertStringContainsString('Customer launch', $mail['body']);
        self::assertStringContainsString('Deployment blocked', $mail['body']);
        self::assertStringContainsString('Waiting for credentials', $mail['body']);
        self::assertStringContainsString('blocked for 4 days', $mail['body']);
        self::assertStringContainsString('conversation_id=' . $rootId, $mail['body']);
        self::assertStringContainsString('conversation_id=' . $inactiveTeamRootId, $mail['body']);
        self::assertStringContainsString('issue_id=' . $openIssueId, $mail['body']);
        self::assertStringNotContainsString('Private customer message excerpt', $mail['body']);
        self::assertStringNotContainsString('Recent customer note', $mail['body']);
        self::assertStringNotContainsString('Team response', $mail['body']);
        self::assertStringNotContainsString('Inactive team response', $mail['body']);
        self::assertStringNotContainsString('Answered message', $mail['body']);
        self::assertStringNotContainsString('Recently blocked', $mail['body']);
        self::assertStringNotContainsString('Completed blocker', $mail['body']);
        self::assertNotSame($tooRecentId, $rootId);
    }

    public function testEmptySummaryAdvancesWithoutSendingAndFailedDeliveryRetriesTheSameSlot(): void
    {
        $admin = $this->login($this->adminEmail);
        $settings = $this->cookieRequest('PUT', '/api/v1/workspace/notifications', $admin['cookie'], [
            'enabled' => true,
            'frequency' => 'daily',
            'time_zone' => 'UTC',
        ], $admin['csrf']);
        self::assertSame(200, $settings->status, json_encode($settings->body));
        $this->pdo->prepare(
            'UPDATE email_notification_preferences SET next_send_at = UTC_TIMESTAMP() - INTERVAL 8 DAY
             WHERE workspace_id = :workspace_id AND user_id = :user_id'
        )->execute(['workspace_id' => $this->workspaceId, 'user_id' => $this->adminId]);
        $runner = $this->notificationRunner();

        $empty = $runner->run(new DateTimeImmutable('now', new \DateTimeZone('UTC')));
        self::assertSame(0, $empty['sent']);
        self::assertSame(1, $empty['empty']);
        self::assertCount(0, $this->mailer->messages);
        $due = $this->pdo->prepare(
            'SELECT next_send_at FROM email_notification_preferences WHERE workspace_id = :workspace_id AND user_id = :user_id'
        );
        $due->execute(['workspace_id' => $this->workspaceId, 'user_id' => $this->adminId]);
        $nextAfterEmpty = (string) $due->fetchColumn();
        self::assertGreaterThan(time(), (new DateTimeImmutable($nextAfterEmpty, new \DateTimeZone('UTC')))->getTimestamp());

        $projectId = $this->createProject($admin, 'Retryable project');
        $issueId = $this->createIssue($admin, $projectId, 'Retryable blocker');
        $this->pdo->prepare(
            'UPDATE issues SET is_blocked = 1, blocked_at = UTC_TIMESTAMP() - INTERVAL 80 HOUR
             WHERE workspace_id = :workspace_id AND id = :id'
        )->execute(['workspace_id' => $this->workspaceId, 'id' => $issueId]);
        $this->pdo->prepare(
            'UPDATE email_notification_preferences SET next_send_at = UTC_TIMESTAMP() - INTERVAL 1 HOUR
             WHERE workspace_id = :workspace_id AND user_id = :user_id'
        )->execute(['workspace_id' => $this->workspaceId, 'user_id' => $this->adminId]);

        $slotQuery = $this->pdo->prepare(
            'SELECT next_send_at FROM email_notification_preferences WHERE workspace_id = :workspace_id AND user_id = :user_id'
        );
        $slotQuery->execute(['workspace_id' => $this->workspaceId, 'user_id' => $this->adminId]);
        $failedSlot = (string) $slotQuery->fetchColumn();
        $this->mailer->deliveryResult = false;
        $failed = $runner->run(new DateTimeImmutable('now', new \DateTimeZone('UTC')));
        self::assertSame(1, $failed['failed']);
        $slotQuery->execute(['workspace_id' => $this->workspaceId, 'user_id' => $this->adminId]);
        self::assertSame($failedSlot, (string) $slotQuery->fetchColumn());

        $this->mailer->deliveryResult = true;
        $sent = $runner->run(new DateTimeImmutable('now', new \DateTimeZone('UTC')));
        self::assertSame(1, $sent['sent']);
        $repeat = $runner->run(new DateTimeImmutable('now', new \DateTimeZone('UTC')));
        self::assertSame(0, $repeat['sent']);
        self::assertCount(2, $this->mailer->messages);
    }

    public function testInactiveAndFormerAdminsAreNotRecipients(): void
    {
        $admin = $this->login($this->adminEmail);
        $settings = $this->cookieRequest('PUT', '/api/v1/workspace/notifications', $admin['cookie'], [
            'enabled' => true,
            'frequency' => 'daily',
            'time_zone' => 'UTC',
        ], $admin['csrf']);
        self::assertSame(200, $settings->status, json_encode($settings->body));
        $this->pdo->prepare('UPDATE users SET is_active = 0 WHERE workspace_id = :workspace_id AND id = :id')
            ->execute(['workspace_id' => $this->workspaceId, 'id' => $this->adminId]);
        $this->pdo->prepare(
            'UPDATE email_notification_preferences SET next_send_at = UTC_TIMESTAMP() - INTERVAL 1 HOUR
             WHERE workspace_id = :workspace_id AND user_id = :user_id'
        )->execute(['workspace_id' => $this->workspaceId, 'user_id' => $this->adminId]);

        $result = $this->notificationRunner()->run(new DateTimeImmutable('now', new \DateTimeZone('UTC')));

        self::assertSame(0, $result['sent']);
        self::assertCount(0, $this->mailer->messages);
    }

    public function testArchivedProjectsAndDeletedIssuesAreExcludedFromBlockedSummaries(): void
    {
        $admin = $this->login($this->adminEmail);
        $activeProjectId = $this->createProject($admin, 'Active blockers');
        $archivedProjectId = $this->createProject($admin, 'Archived blockers');
        $activeIssueId = $this->createIssue($admin, $activeProjectId, 'Still blocked');
        $archivedIssueId = $this->createIssue($admin, $archivedProjectId, 'Archived blocker');
        $deletedIssueId = $this->createIssue($admin, $activeProjectId, 'Deleted blocker');
        $this->pdo->prepare(
            'UPDATE issues SET is_blocked = 1, blocked_at = UTC_TIMESTAMP() - INTERVAL 90 HOUR
             WHERE workspace_id = :workspace_id AND id IN (:active_id, :archived_id, :deleted_id)'
        )->execute([
            'workspace_id' => $this->workspaceId,
            'active_id' => $activeIssueId,
            'archived_id' => $archivedIssueId,
            'deleted_id' => $deletedIssueId,
        ]);
        $this->pdo->prepare(
            "UPDATE projects SET status = 'archived' WHERE workspace_id = :workspace_id AND id = :project_id"
        )->execute(['workspace_id' => $this->workspaceId, 'project_id' => $archivedProjectId]);
        $this->pdo->prepare(
            'UPDATE issues SET deleted_at = UTC_TIMESTAMP() WHERE workspace_id = :workspace_id AND id = :id'
        )->execute(['workspace_id' => $this->workspaceId, 'id' => $deletedIssueId]);
        $this->cookieRequest('PUT', '/api/v1/workspace/notifications', $admin['cookie'], [
            'enabled' => true,
            'frequency' => 'daily',
            'time_zone' => 'UTC',
        ], $admin['csrf']);
        $this->pdo->prepare(
            'UPDATE email_notification_preferences SET next_send_at = UTC_TIMESTAMP() - INTERVAL 1 HOUR
             WHERE workspace_id = :workspace_id AND user_id = :user_id'
        )->execute(['workspace_id' => $this->workspaceId, 'user_id' => $this->adminId]);

        $result = $this->notificationRunner()->run(new DateTimeImmutable('now', new \DateTimeZone('UTC')));

        self::assertSame(1, $result['sent']);
        self::assertStringContainsString('Still blocked', $this->mailer->messages[0]['body']);
        self::assertStringNotContainsString('Archived blocker', $this->mailer->messages[0]['body']);
        self::assertStringNotContainsString('Deleted blocker', $this->mailer->messages[0]['body']);
    }

    public function testDelayedAndOverlappingRunnerCallsSendAtMostOneCurrentSummary(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Delayed summary');
        $issueId = $this->createIssue($admin, $projectId, 'Long-running blocker');
        $this->pdo->prepare(
            'UPDATE issues SET is_blocked = 1, blocked_at = UTC_TIMESTAMP() - INTERVAL 100 HOUR
             WHERE workspace_id = :workspace_id AND id = :id'
        )->execute(['workspace_id' => $this->workspaceId, 'id' => $issueId]);
        $this->cookieRequest('PUT', '/api/v1/workspace/notifications', $admin['cookie'], [
            'enabled' => true,
            'frequency' => 'daily',
            'time_zone' => 'UTC',
        ], $admin['csrf']);
        $this->pdo->prepare(
            'UPDATE email_notification_preferences SET next_send_at = UTC_TIMESTAMP() - INTERVAL 12 DAY
             WHERE workspace_id = :workspace_id AND user_id = :user_id'
        )->execute(['workspace_id' => $this->workspaceId, 'user_id' => $this->adminId]);
        $runner = $this->notificationRunner();

        $lockPdo = new PDO(
            'mysql:host=' . (getenv('TANGENT_TEST_DB_HOST') ?: '127.0.0.1')
                . ';port=' . (getenv('TANGENT_TEST_DB_PORT') ?: 3306)
                . ';dbname=' . (getenv('TANGENT_TEST_DB_NAME') ?: 'tangent_test_suite')
                . ';charset=utf8mb4',
            getenv('TANGENT_TEST_DB_USER') ?: 'tangent',
            getenv('TANGENT_TEST_DB_PASSWORD') ?: 'tangent_dev_password',
        );
        $lockPdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $lock = $lockPdo->prepare('SELECT GET_LOCK(:lock_name, 0)');
        $lock->execute(['lock_name' => 'tangent_email_notification_summary_runner']);
        self::assertSame(1, (int) $lock->fetchColumn());
        $overlapping = $runner->run(new DateTimeImmutable('now', new \DateTimeZone('UTC')));
        self::assertTrue($overlapping['skipped']);
        self::assertCount(0, $this->mailer->messages);
        $lockPdo->query("SELECT RELEASE_LOCK('tangent_email_notification_summary_runner')")->fetchColumn();
        $lockPdo = null;

        $firstRun = $runner->run(new DateTimeImmutable('now', new \DateTimeZone('UTC')));
        self::assertSame(1, $firstRun['sent']);
        self::assertCount(1, $this->mailer->messages);
        self::assertStringContainsString('blocked for 4 days', $this->mailer->messages[0]['body']);
        $due = $this->pdo->prepare(
            'SELECT next_send_at FROM email_notification_preferences WHERE workspace_id = :workspace_id AND user_id = :user_id'
        );
        $due->execute(['workspace_id' => $this->workspaceId, 'user_id' => $this->adminId]);
        self::assertGreaterThan(time(), (new DateTimeImmutable((string) $due->fetchColumn(), new \DateTimeZone('UTC')))->getTimestamp());

        $secondRun = $runner->run(new DateTimeImmutable('now', new \DateTimeZone('UTC')));
        self::assertSame(0, $secondRun['sent']);
        self::assertCount(1, $this->mailer->messages);
    }

    private function notificationRunner(): EmailNotificationRunner
    {
        $projects = new ProjectRepository($this->pdo);
        $users = new UserRepository($this->pdo, new PasswordSecurity());
        $workspaces = new WorkspaceService(
            $this->pdo,
            new WorkspaceRepository($this->pdo),
            $users,
            new TokenRepository($this->pdo),
            new AppConfig($this->workspaceId, false, publicAppUrl: 'https://tangent.example.test'),
        );
        $inboxEvents = new InboxEvents(new InboxEventRepository($this->pdo), $projects, $users);
        $chat = new ChatService(new ChatRepository($this->pdo), $projects, $inboxEvents, $this->pdo);
        $issues = new IssuesService(
            new IssueRepository($this->pdo),
            $projects,
            $chat,
            $inboxEvents,
            $this->pdo,
            new MilestoneRepository($this->pdo),
            new IssueDiscussionRepository($this->pdo),
        );

        return new EmailNotificationRunner(
            $this->pdo,
            new EmailNotificationRepository($this->pdo),
            $workspaces,
            $chat,
            $issues,
            $this->mailer,
            'https://tangent.example.test',
        );
    }

    private function insertMember(string $email, string $name, string $role): int
    {
        $account = $this->pdo->prepare('INSERT INTO user_accounts (email, password_hash) VALUES (:email, :password_hash)');
        $account->execute(['email' => $email, 'password_hash' => password_hash($this->password, PASSWORD_ARGON2ID)]);
        $accountId = (int) $this->pdo->lastInsertId();
        $member = $this->pdo->prepare(
            'INSERT INTO users (workspace_id, account_id, name, email, role, is_active)
             VALUES (:workspace_id, :account_id, :name, :email, :role, 1)'
        );
        $member->execute([
            'workspace_id' => $this->workspaceId,
            'account_id' => $accountId,
            'name' => $name,
            'email' => $email,
            'role' => $role,
        ]);
        return (int) $this->pdo->lastInsertId();
    }

    private function createProject(array $admin, string $name): int
    {
        $response = $this->cookieRequest('POST', '/api/v1/projects', $admin['cookie'], [
            'name' => $name,
            'description' => '',
        ], $admin['csrf']);
        self::assertSame(201, $response->status, json_encode($response->body));
        return (int) $response->body['project']['id'];
    }

    private function createIssue(array $admin, int $projectId, string $title): int
    {
        $response = $this->cookieRequest('POST', "/api/v1/projects/{$projectId}/issues", $admin['cookie'], [
            'title' => $title,
        ], $admin['csrf']);
        self::assertSame(201, $response->status, json_encode($response->body));
        return (int) $response->body['issue']['id'];
    }

    private function insertMessage(int $channelId, int $authorId, ?int $parentId, string $body, int $hoursAgo): int
    {
        $message = $this->pdo->prepare(
            'INSERT INTO messages (workspace_id, channel_id, author_id, parent_id, body, is_client_visible, created_at)
             VALUES (:workspace_id, :channel_id, :author_id, :parent_id, :body, 1, UTC_TIMESTAMP() - INTERVAL :hours HOUR)'
        );
        $message->execute([
            'workspace_id' => $this->workspaceId,
            'channel_id' => $channelId,
            'author_id' => $authorId,
            'parent_id' => $parentId,
            'body' => $body,
            'hours' => $hoursAgo,
        ]);
        return (int) $this->pdo->lastInsertId();
    }
}
