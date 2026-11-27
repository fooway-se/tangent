<?php

declare(strict_types=1);

namespace Tangent\Modules\EmailNotifications;

use PDO;

final class EmailNotificationRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function findSettings(int $workspaceId, int $userId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT enabled, frequency, time_zone, schedule_anchor_date, next_send_at
             FROM email_notification_preferences
             WHERE workspace_id = :workspace_id AND user_id = :user_id
             LIMIT 1'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'user_id' => $userId]);
        $settings = $statement->fetch(PDO::FETCH_ASSOC);
        return $settings === false ? null : self::normalizeSettings($settings);
    }

    public function saveSettings(
        int $workspaceId,
        int $userId,
        bool $enabled,
        string $frequency,
        string $timeZone,
        string $anchorDate,
        ?string $nextSendAt,
    ): array {
        $statement = $this->pdo->prepare(
            'INSERT INTO email_notification_preferences
                (workspace_id, user_id, enabled, frequency, time_zone, schedule_anchor_date, next_send_at)
             VALUES
                (:workspace_id, :user_id, :enabled, :frequency, :time_zone, :anchor_date, :next_send_at)
             ON DUPLICATE KEY UPDATE
                enabled = VALUES(enabled), frequency = VALUES(frequency), time_zone = VALUES(time_zone),
                schedule_anchor_date = VALUES(schedule_anchor_date), next_send_at = VALUES(next_send_at)'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'user_id' => $userId,
            'enabled' => $enabled ? 1 : 0,
            'frequency' => $frequency,
            'time_zone' => $timeZone,
            'anchor_date' => $anchorDate,
            'next_send_at' => $nextSendAt,
        ]);

        return $this->findSettings($workspaceId, $userId) ?? [];
    }

    public function hasDelivery(int $workspaceId, int $userId, string $scheduledSlot): bool
    {
        $statement = $this->pdo->prepare(
            'SELECT 1 FROM email_notification_deliveries
             WHERE workspace_id = :workspace_id AND user_id = :user_id AND scheduled_slot = :scheduled_slot
             LIMIT 1'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'user_id' => $userId,
            'scheduled_slot' => $scheduledSlot,
        ]);
        return $statement->fetchColumn() !== false;
    }

    public function recordDelivery(int $workspaceId, int $userId, string $scheduledSlot, string $sentAt): bool
    {
        $statement = $this->pdo->prepare(
            'INSERT IGNORE INTO email_notification_deliveries
                (workspace_id, user_id, scheduled_slot, sent_at)
             VALUES (:workspace_id, :user_id, :scheduled_slot, :sent_at)'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'user_id' => $userId,
            'scheduled_slot' => $scheduledSlot,
            'sent_at' => $sentAt,
        ]);
        return $statement->rowCount() === 1;
    }

    public function advanceSchedule(
        int $workspaceId,
        int $userId,
        string $currentSlot,
        string $nextSlot,
    ): void {
        $statement = $this->pdo->prepare(
            'UPDATE email_notification_preferences
             SET next_send_at = :next_send_at
             WHERE workspace_id = :workspace_id AND user_id = :user_id
               AND enabled = 1 AND next_send_at = :current_slot'
        );
        $statement->execute([
            'next_send_at' => $nextSlot,
            'workspace_id' => $workspaceId,
            'user_id' => $userId,
            'current_slot' => $currentSlot,
        ]);
    }

    private static function normalizeSettings(array $settings): array
    {
        return [
            'enabled' => (bool) $settings['enabled'],
            'frequency' => (string) $settings['frequency'],
            'time_zone' => (string) $settings['time_zone'],
            'schedule_anchor_date' => (string) $settings['schedule_anchor_date'],
            'next_send_at' => $settings['next_send_at'] === null ? null : (string) $settings['next_send_at'],
        ];
    }
}
