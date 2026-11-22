<?php

declare(strict_types=1);

namespace Tangent\Tests\Support;

use Tangent\Core\Mailer;

final class RecordingMailer implements Mailer
{
    /** @var list<array{to: string, subject: string, body: string}> */
    public array $messages = [];
    public bool $deliveryResult = true;

    public function send(string $to, string $subject, string $body): bool
    {
        $this->messages[] = compact('to', 'subject', 'body');
        return $this->deliveryResult;
    }
}
