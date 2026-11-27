<?php

declare(strict_types=1);

namespace Tangent\Tests\Unit;

use DateTimeImmutable;
use DateTimeZone;
use PHPUnit\Framework\TestCase;
use Tangent\Modules\EmailNotifications\EmailNotificationSchedule;

final class EmailNotificationScheduleTest extends TestCase
{
    public function testDailySlotUsesNextNineAmInSelectedTimeZone(): void
    {
        $now = new DateTimeImmutable('2026-11-27 07:30:00 UTC');

        $slot = EmailNotificationSchedule::nextSlot('daily', 'Europe/Stockholm', '2026-11-27', $now);

        self::assertSame('2026-11-27 09:00:00 Europe/Stockholm', $slot->setTimezone(new DateTimeZone('Europe/Stockholm'))->format('Y-m-d H:i:s e'));
    }

    public function testDailySlotMovesToTomorrowAfterTheLocalNineAmSlot(): void
    {
        $now = new DateTimeImmutable('2026-11-27 08:30:00 UTC');

        $slot = EmailNotificationSchedule::nextSlot('daily', 'Europe/Stockholm', '2026-11-27', $now);

        self::assertSame('2026-11-28 09:00:00 Europe/Stockholm', $slot->setTimezone(new DateTimeZone('Europe/Stockholm'))->format('Y-m-d H:i:s e'));
    }

    public function testEveryOtherDayRemainsAnchoredToTheEnableDateAcrossDst(): void
    {
        $now = new DateTimeImmutable('2026-03-29 06:30:00 UTC');

        $slot = EmailNotificationSchedule::nextSlot('every_other_day', 'Europe/Stockholm', '2026-03-27', $now);

        self::assertSame('2026-03-29 09:00:00 Europe/Stockholm', $slot->setTimezone(new DateTimeZone('Europe/Stockholm'))->format('Y-m-d H:i:s e'));
    }

    public function testWeeklySlotIsMondayAtNineLocalTime(): void
    {
        $now = new DateTimeImmutable('2026-11-27 08:30:00 UTC');

        $slot = EmailNotificationSchedule::nextSlot('weekly', 'Europe/Stockholm', '2026-11-27', $now);

        self::assertSame('2026-11-30 09:00:00 Europe/Stockholm', $slot->setTimezone(new DateTimeZone('Europe/Stockholm'))->format('Y-m-d H:i:s e'));
    }

    public function testInvalidFrequencyAndTimezoneAreRejected(): void
    {
        self::assertFalse(EmailNotificationSchedule::supportsFrequency('monthly'));
        self::assertFalse(EmailNotificationSchedule::supportsTimeZone('Mars/Olympus_Mons'));
        self::assertTrue(EmailNotificationSchedule::supportsTimeZone('UTC'));
    }
}
