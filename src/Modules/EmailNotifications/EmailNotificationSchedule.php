<?php

declare(strict_types=1);

namespace Tangent\Modules\EmailNotifications;

use DateTimeImmutable;
use DateTimeZone;

final class EmailNotificationSchedule
{
    private const FREQUENCIES = ['daily', 'every_other_day', 'weekly'];
    private const UTC = 'UTC';

    public static function supportsFrequency(string $frequency): bool
    {
        return in_array($frequency, self::FREQUENCIES, true);
    }

    public static function supportsTimeZone(string $timeZone): bool
    {
        return in_array($timeZone, DateTimeZone::listIdentifiers(DateTimeZone::ALL_WITH_BC), true);
    }

    public static function nextSlot(
        string $frequency,
        string $timeZone,
        string $anchorDate,
        DateTimeImmutable $after,
    ): DateTimeImmutable {
        if (!self::supportsFrequency($frequency)) {
            throw new \InvalidArgumentException('Unsupported notification frequency.');
        }
        if (!self::supportsTimeZone($timeZone)) {
            throw new \InvalidArgumentException('Unsupported notification time zone.');
        }

        $zone = new DateTimeZone($timeZone);
        $localAfter = $after->setTimezone($zone);
        $today = $localAfter->format('Y-m-d');
        $anchor = self::date($anchorDate, new DateTimeZone(self::UTC));

        if ($frequency === 'weekly') {
            $monday = $localAfter->modify('monday this week')->setTime(9, 0);
            return $monday > $localAfter ? $monday : $monday->modify('+1 week');
        }

        if ($frequency === 'daily') {
            $candidate = self::slotForDate($today, $zone);
            return $candidate > $localAfter ? $candidate : $candidate->modify('+1 day');
        }

        $candidateDate = $today < $anchorDate ? $anchorDate : $today;
        $candidate = self::slotForDate($candidateDate, $zone);
        if ($candidate <= $localAfter) {
            $candidate = $candidate->modify('+1 day');
            $candidateDate = $candidate->format('Y-m-d');
        }

        $dateFromAnchor = self::date($candidateDate, new DateTimeZone(self::UTC));
        $elapsedDays = (int) $anchor->diff($dateFromAnchor)->format('%r%a');
        if ($elapsedDays < 0) {
            $elapsedDays = 0;
        }
        if ($elapsedDays % 2 !== 0) {
            $candidate = $candidate->modify('+1 day');
        }

        return $candidate;
    }

    public static function utcString(DateTimeImmutable $dateTime): string
    {
        return $dateTime->setTimezone(new DateTimeZone(self::UTC))->format('Y-m-d H:i:s');
    }

    private static function slotForDate(string $date, DateTimeZone $zone): DateTimeImmutable
    {
        return self::date($date, $zone)->setTime(9, 0);
    }

    private static function date(string $value, DateTimeZone $zone): DateTimeImmutable
    {
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value, $zone);
        if ($date === false || $date->format('Y-m-d') !== $value) {
            throw new \InvalidArgumentException('Invalid schedule anchor date.');
        }
        return $date;
    }
}
