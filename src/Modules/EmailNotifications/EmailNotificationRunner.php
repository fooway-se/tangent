<?php

declare(strict_types=1);

namespace Tangent\Modules\EmailNotifications;

use DateTimeImmutable;
use DateTimeZone;
use PDO;
use Tangent\Core\Mailer;
use Tangent\Modules\Chat\ChatService;
use Tangent\Modules\Issues\IssuesService;
use Tangent\Modules\Workspaces\WorkspaceService;

final class EmailNotificationRunner
{
    private const LOCK_NAME = 'tangent_email_notification_summary_runner';
    private const CONVERSATION_THRESHOLD_HOURS = 24;
    private const BLOCKED_THRESHOLD_HOURS = 72;

    public function __construct(
        private readonly PDO $pdo,
        private readonly EmailNotificationRepository $notifications,
        private readonly WorkspaceService $workspaces,
        private readonly ChatService $chat,
        private readonly IssuesService $issues,
        private readonly Mailer $mailer,
        private readonly string $publicAppUrl,
    ) {
    }

    /** @return array{sent: int, empty: int, failed: int, skipped: bool} */
    public function run(?DateTimeImmutable $now = null): array
    {
        $now ??= new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $now = $now->setTimezone(new DateTimeZone('UTC'));
        $lock = $this->pdo->prepare('SELECT GET_LOCK(:lock_name, 0)');
        $lock->execute(['lock_name' => self::LOCK_NAME]);
        if ((int) $lock->fetchColumn() !== 1) {
            return ['sent' => 0, 'empty' => 0, 'failed' => 0, 'skipped' => true];
        }

        $result = ['sent' => 0, 'empty' => 0, 'failed' => 0, 'skipped' => false];
        try {
            foreach ($this->workspaces->ids() as $workspaceId) {
                $admins = $this->workspaces->activeAdmins($workspaceId);
                $dueAdmins = [];
                foreach ($admins as $admin) {
                    $settings = $this->notifications->findSettings($workspaceId, (int) $admin['id']);
                    if ($settings === null || !$settings['enabled'] || $settings['next_send_at'] === null) continue;
                    $slot = new DateTimeImmutable($settings['next_send_at'], new DateTimeZone('UTC'));
                    if ($slot > $now) continue;
                    $dueAdmins[] = ['admin' => $admin, 'settings' => $settings, 'slot' => $slot];
                }
                if ($dueAdmins === []) continue;

                $conversations = $this->chat->unansweredCustomerConversations(
                    $workspaceId,
                    $now->modify('-' . self::CONVERSATION_THRESHOLD_HOURS . ' hours'),
                );
                $blockedIssues = $this->issues->blockedIssuesForNotifications(
                    $workspaceId,
                    $now->modify('-' . self::BLOCKED_THRESHOLD_HOURS . ' hours'),
                );
                $items = $this->combineItems($conversations, $blockedIssues);

                foreach ($dueAdmins as $due) {
                    $admin = $due['admin'];
                    $settings = $due['settings'];
                    $slot = $due['slot'];
                    $slotString = EmailNotificationSchedule::utcString($slot);
                    if ($this->notifications->hasDelivery($workspaceId, (int) $admin['id'], $slotString)) {
                        $this->advance($workspaceId, (int) $admin['id'], $settings, $slotString, $now);
                        continue;
                    }

                    if ($items === []) {
                        $result['empty']++;
                        $this->advance($workspaceId, (int) $admin['id'], $settings, $slotString, $now);
                        continue;
                    }

                    $subject = self::safeSubject((string) $this->workspaces->name($workspaceId) . ' notification summary');
                    $body = $this->renderBody($workspaceId, $items, $now);
                    if (!$this->mailer->send((string) $admin['email'], $subject, $body)) {
                        $result['failed']++;
                        continue;
                    }

                    $recorded = $this->notifications->recordDelivery(
                        $workspaceId,
                        (int) $admin['id'],
                        $slotString,
                        EmailNotificationSchedule::utcString($now),
                    );
                    if ($recorded) $result['sent']++;
                    $this->advance($workspaceId, (int) $admin['id'], $settings, $slotString, $now);
                }
            }
            return $result;
        } finally {
            $release = $this->pdo->prepare('SELECT RELEASE_LOCK(:lock_name)');
            $release->execute(['lock_name' => self::LOCK_NAME]);
        }
    }

    private function advance(int $workspaceId, int $userId, array $settings, string $currentSlot, DateTimeImmutable $now): void
    {
        $nextSlot = EmailNotificationSchedule::nextSlot(
            $settings['frequency'],
            $settings['time_zone'],
            $settings['schedule_anchor_date'],
            $now,
        );
        $this->notifications->advanceSchedule(
            $workspaceId,
            $userId,
            $currentSlot,
            EmailNotificationSchedule::utcString($nextSlot),
        );
    }

    private function combineItems(array $conversations, array $blockedIssues): array
    {
        $items = [];
        foreach ($conversations as $conversation) {
            $projectId = (int) $conversation['project_id'];
            $items[$projectId]['project_name'] = (string) $conversation['project_name'];
            $items[$projectId]['items'][] = [
                'type' => 'conversation',
                'project_id' => $projectId,
                'id' => (int) $conversation['root_message_id'],
                'waiting_since' => (string) $conversation['waiting_since'],
            ];
        }
        foreach ($blockedIssues as $issue) {
            $projectId = (int) $issue['project_id'];
            $items[$projectId]['project_name'] = (string) $issue['project_name'];
            $items[$projectId]['items'][] = [
                'type' => 'issue',
                'project_id' => $projectId,
                'id' => (int) $issue['id'],
                'title' => (string) $issue['title'],
                'blocking_reason' => $issue['blocking_reason'] === null ? null : (string) $issue['blocking_reason'],
                'waiting_since' => (string) $issue['blocked_at'],
            ];
        }
        uasort($items, static fn (array $left, array $right): int => strcasecmp($left['project_name'], $right['project_name']));
        return $items;
    }

    private function renderBody(int $workspaceId, array $projects, DateTimeImmutable $now): string
    {
        $lines = [
            'Here is your Tangent notification summary. These items may need attention.',
            '',
        ];
        foreach ($projects as $project) {
            $lines[] = $project['project_name'];
            foreach ($project['items'] as $item) {
                $waiting = self::formatAge($item['waiting_since'], $now);
                if ($item['type'] === 'conversation') {
                    $url = self::queryUrl($this->publicAppUrl . '/app.html', [
                        'workspace_id' => $workspaceId,
                        'project_id' => $item['project_id'],
                        'conversation_id' => $item['id'],
                    ]);
                    $lines[] = '- Unanswered customer conversation: ' . $url . ' (waiting ' . $waiting . ')';
                    continue;
                }
                $url = self::queryUrl($this->publicAppUrl . '/app.html', [
                    'workspace_id' => $workspaceId,
                    'project_id' => $item['project_id'],
                    'issue_id' => $item['id'],
                ]);
                $lines[] = '- ' . $item['title'] . ': ' . $url . ' (blocked for ' . $waiting . ')';
                if ($item['blocking_reason'] !== null && trim($item['blocking_reason']) !== '') {
                    $lines[] = '  Reason: ' . self::safeLine($item['blocking_reason']);
                }
            }
            $lines[] = '';
        }
        $settingsUrl = self::queryUrl($this->publicAppUrl . '/app.html', [
            'workspace_id' => $workspaceId,
            'admin' => 'notifications',
        ]);
        $lines[] = 'Manage notification frequency or opt out: ' . $settingsUrl;
        return implode("\n", $lines);
    }

    private static function queryUrl(string $base, array $parameters): string
    {
        return $base . '?' . http_build_query($parameters, '', '&', PHP_QUERY_RFC3986);
    }

    private static function safeSubject(string $subject): string
    {
        $subject = preg_replace('/[\r\n]+/', ' ', $subject) ?? 'Tangent notification summary';
        return trim($subject) === '' ? 'Tangent notification summary' : trim($subject);
    }

    private static function safeLine(string $value): string
    {
        return trim((string) preg_replace('/[\r\n]+/', ' ', $value));
    }

    private static function formatAge(string $waitingSince, DateTimeImmutable $now): string
    {
        $start = new DateTimeImmutable($waitingSince, new DateTimeZone('UTC'));
        $seconds = max(0, $now->getTimestamp() - $start->getTimestamp());
        $days = intdiv($seconds, 86_400);
        $hours = intdiv($seconds % 86_400, 3_600);
        $minutes = intdiv($seconds % 3_600, 60);
        $parts = [];
        if ($days > 0) $parts[] = $days . ' ' . ($days === 1 ? 'day' : 'days');
        if ($hours > 0) $parts[] = $hours . ' ' . ($hours === 1 ? 'hour' : 'hours');
        if ($days === 0 && $minutes > 0) $parts[] = $minutes . ' ' . ($minutes === 1 ? 'minute' : 'minutes');
        return $parts === [] ? 'less than a minute' : implode(' ', $parts);
    }
}
