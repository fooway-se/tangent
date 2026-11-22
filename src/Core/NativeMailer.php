<?php

declare(strict_types=1);

namespace Tangent\Core;

use Closure;
use Throwable;

final class NativeMailer implements Mailer
{
    /** @var Closure(string, string, string, array<string, string>): bool */
    private readonly Closure $sendMail;

    /** @param null|Closure(string, string, string, array<string, string>): bool $sendMail */
    public function __construct(private readonly string $from, ?Closure $sendMail = null)
    {
        $this->sendMail = $sendMail ?? static fn(string $to, string $subject, string $body, array $headers): bool =>
            mail($to, $subject, $body, $headers);
    }

    public function send(string $to, string $subject, string $body): bool
    {
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)
            || !filter_var($this->from, FILTER_VALIDATE_EMAIL)
            || preg_match('/[\r\n]/', $subject) === 1
        ) {
            return false;
        }

        try {
            return ($this->sendMail)($to, $subject, $body, [
                'From' => $this->from,
                'Content-Type' => 'text/plain; charset=UTF-8',
                'X-Mailer' => 'Tangent',
            ]);
        } catch (Throwable) {
            return false;
        }
    }
}
