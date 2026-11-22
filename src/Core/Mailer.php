<?php

declare(strict_types=1);

namespace Tangent\Core;

interface Mailer
{
    public function send(string $to, string $subject, string $body): bool;
}
