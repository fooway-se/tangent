<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use Tangent\Core\AppConfig;
use Tangent\Core\Application;
use Tangent\Core\Request;
use Tangent\Core\Response;
use Tangent\Tests\Support\ApiTestCase;

final class EmailNotificationHttpTriggerTest extends ApiTestCase
{
    private const PATH = '/api/v1/cron/email-notification-summaries';
    private const TOKEN = 'external-cron-random-token-for-tests';

    public function testTriggerIsAbsentByDefaultAndDoesNotAcceptGet(): void
    {
        $disabled = $this->request('POST', self::PATH);
        self::assertSame(404, $disabled->status);

        $this->useApplication(true, hash('sha256', self::TOKEN));
        $get = $this->request('GET', self::PATH);
        self::assertSame(404, $get->status);
    }

    public function testTriggerRequiresAValidBearerTokenAndValidTokenHashConfiguration(): void
    {
        $this->useApplication(true, hash('sha256', self::TOKEN));

        $missing = $this->request('POST', self::PATH);
        self::assertSame(401, $missing->status);
        self::assertSame('unauthorized', $missing->body['error']['code']);
        self::assertSame('Bearer', $missing->headers['www-authenticate'] ?? null);

        $invalid = $this->request('POST', self::PATH, headers: [
            'Authorization' => 'Bearer wrong-token',
        ]);
        self::assertSame(401, $invalid->status);
        self::assertSame([], $this->mailer->messages);

        $this->useApplication(true, 'not-a-sha256-hash');
        $misconfigured = $this->request('POST', self::PATH, headers: [
            'Authorization' => 'Bearer ' . self::TOKEN,
        ]);
        self::assertSame(503, $misconfigured->status);
        self::assertSame('trigger_misconfigured', $misconfigured->body['error']['code']);
        self::assertSame([], $this->mailer->messages);
    }

    public function testAuthorizedPostRunsDueSummariesAndReportsDeliveryFailuresForRetry(): void
    {
        $this->useApplication(true, hash('sha256', self::TOKEN));
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'HTTP cron project');
        $issueId = $this->createIssue($admin, $projectId, 'HTTP cron blocker');

        $settings = $this->cookieRequest('PUT', '/api/v1/workspace/notifications', $admin['cookie'], [
            'enabled' => true,
            'frequency' => 'daily',
            'time_zone' => 'UTC',
        ], $admin['csrf']);
        self::assertSame(200, $settings->status, json_encode($settings->body));
        $this->pdo->prepare(
            'UPDATE issues SET is_blocked = 1, blocked_at = UTC_TIMESTAMP() - INTERVAL 80 HOUR
             WHERE workspace_id = :workspace_id AND id = :id'
        )->execute(['workspace_id' => $this->workspaceId, 'id' => $issueId]);
        $this->pdo->prepare(
            'UPDATE email_notification_preferences SET next_send_at = UTC_TIMESTAMP() - INTERVAL 1 HOUR
             WHERE workspace_id = :workspace_id AND user_id = :user_id'
        )->execute(['workspace_id' => $this->workspaceId, 'user_id' => $this->adminId]);

        $this->mailer->deliveryResult = false;
        $failed = $this->triggerRequest();
        self::assertSame(503, $failed->status);
        self::assertSame('email_notification_delivery_failed', $failed->body['error']['code']);
        self::assertSame(1, $failed->body['result']['failed']);

        $this->mailer->deliveryResult = true;
        $sent = $this->triggerRequest();
        self::assertSame(200, $sent->status, json_encode($sent->body));
        self::assertSame([
            'sent' => 1,
            'empty' => 0,
            'failed' => 0,
            'skipped' => false,
        ], $sent->body['result']);
        self::assertSame('no-store', $sent->headers['cache-control'] ?? null);
        self::assertSame('admin@example.test', $this->mailer->messages[1]['to']);
        self::assertStringContainsString('HTTP cron blocker', $this->mailer->messages[1]['body']);

        $repeat = $this->triggerRequest();
        self::assertSame(200, $repeat->status);
        self::assertSame(0, $repeat->body['result']['sent']);
        self::assertCount(2, $this->mailer->messages);
    }

    private function useApplication(bool $enabled, string $tokenHash): void
    {
        $this->application = Application::create(
            $this->pdo,
            new AppConfig(
                $this->workspaceId,
                false,
                emailNotificationHttpTriggerEnabled: $enabled,
                emailNotificationHttpTriggerTokenHash: $tokenHash,
            ),
            null,
            $this->mailer,
        );
    }

    private function triggerRequest(): Response
    {
        return $this->application->handle(Request::fromHttp(
            'POST',
            self::PATH,
            [],
            ['Authorization' => 'Bearer ' . self::TOKEN],
            [],
            '',
            '192.0.2.50',
        ));
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
}
