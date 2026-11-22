<?php

declare(strict_types=1);

namespace Tangent\Tests\Unit;

use PHPUnit\Framework\TestCase;
use Tangent\Core\NativeMailer;

final class NativeMailerTest extends TestCase
{
    public function testMailerRequiresAValidConfiguredSender(): void
    {
        $called = false;
        $mailer = new NativeMailer('', static function () use (&$called): bool {
            $called = true;
            return true;
        });

        self::assertFalse($mailer->send('person@example.test', 'Subject', 'Message'));
        self::assertFalse($called);
    }

    public function testMailerUsesValidatedPlainTextHeaders(): void
    {
        $message = null;
        $mailer = new NativeMailer('tangent@example.test', static function (...$arguments) use (&$message): bool {
            $message = $arguments;
            return true;
        });

        self::assertTrue($mailer->send('person@example.test', 'Subject', 'Message'));
        self::assertSame([
            'person@example.test',
            'Subject',
            'Message',
            [
                'From' => 'tangent@example.test',
                'Content-Type' => 'text/plain; charset=UTF-8',
                'X-Mailer' => 'Tangent',
            ],
        ], $message);
    }

    public function testMailerRejectsHeaderInjectionAndTransportFailure(): void
    {
        $mailer = new NativeMailer('tangent@example.test', static fn(): bool => throw new \RuntimeException('transport error'));
        self::assertFalse($mailer->send("person@example.test\r\nBcc: victim@example.test", 'Subject', 'Message'));
        self::assertFalse($mailer->send('person@example.test', "Subject\r\nBcc: victim@example.test", 'Message'));
        self::assertFalse($mailer->send('person@example.test', 'Subject', 'Message'));
    }
}
