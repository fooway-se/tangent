<?php

declare(strict_types=1);

namespace Tangent\Modules\EmailNotifications;

use DateTimeImmutable;
use DateTimeZone;
use Tangent\Core\ApiException;
use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Permissions;

final class EmailNotificationsService
{
    public function __construct(private readonly EmailNotificationRepository $notifications)
    {
    }

    public function settings(AuthenticatedUser $user): array
    {
        $this->requireAdmin($user);
        $settings = $this->notifications->findSettings($user->workspaceId, $user->id);
        return self::publicSettings($settings ?? [
            'enabled' => false,
            'frequency' => 'daily',
            'time_zone' => 'UTC',
            'schedule_anchor_date' => '',
            'next_send_at' => null,
        ]);
    }

    public function update(AuthenticatedUser $user, array $input): array
    {
        $this->requireAdmin($user);
        $current = $this->notifications->findSettings($user->workspaceId, $user->id) ?? [
            'enabled' => false,
            'frequency' => 'daily',
            'time_zone' => 'UTC',
            'schedule_anchor_date' => '',
            'next_send_at' => null,
        ];

        $enabled = $input['enabled'] ?? $current['enabled'];
        $frequency = $input['frequency'] ?? $current['frequency'];
        $timeZone = $input['time_zone'] ?? $current['time_zone'];
        if (!is_bool($enabled)) {
            throw new ApiException(422, 'validation_failed', 'enabled must be a boolean.');
        }
        if (!is_string($frequency) || !EmailNotificationSchedule::supportsFrequency($frequency)) {
            throw new ApiException(422, 'validation_failed', 'frequency must be daily, every_other_day, or weekly.');
        }
        if (!is_string($timeZone) || !EmailNotificationSchedule::supportsTimeZone($timeZone)) {
            throw new ApiException(422, 'validation_failed', 'time_zone must be a valid IANA time zone.');
        }

        $changed = $enabled !== $current['enabled']
            || $frequency !== $current['frequency']
            || $timeZone !== $current['time_zone'];
        $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $anchorDate = $changed || $current['schedule_anchor_date'] === ''
            ? $now->setTimezone(new DateTimeZone($timeZone))->format('Y-m-d')
            : $current['schedule_anchor_date'];
        $nextSendAt = null;
        if ($enabled) {
            if (!$changed && $current['next_send_at'] !== null) {
                $nextSendAt = $current['next_send_at'];
            } else {
                $nextSendAt = EmailNotificationSchedule::utcString(
                    EmailNotificationSchedule::nextSlot($frequency, $timeZone, $anchorDate, $now),
                );
            }
        }

        return self::publicSettings($this->notifications->saveSettings(
            $user->workspaceId,
            $user->id,
            $enabled,
            $frequency,
            $timeZone,
            $anchorDate,
            $nextSendAt,
        ));
    }

    private function requireAdmin(AuthenticatedUser $user): void
    {
        if (!Permissions::can($user, 'workspace.notifications.manage')) {
            throw new ApiException(403, 'forbidden', 'Only workspace admins can manage notification summaries.');
        }
    }

    private static function publicSettings(array $settings): array
    {
        return [
            'enabled' => (bool) $settings['enabled'],
            'frequency' => (string) $settings['frequency'],
            'time_zone' => (string) $settings['time_zone'],
            'next_send_at' => $settings['next_send_at'],
        ];
    }
}
