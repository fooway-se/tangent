<?php

declare(strict_types=1);

namespace Tangent\Core;

use Closure;
use Throwable;

final class RequestErrorReporter
{
    private readonly ?Closure $writer;

    public function __construct(?callable $writer = null)
    {
        $this->writer = $writer === null ? null : Closure::fromCallable($writer);
    }

    public function report(string $requestId, Throwable $exception): void
    {
        $record = json_encode([
            'event' => 'unexpected_request_error',
            'request_id' => $requestId,
            'exception_class' => $exception::class,
        ], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        if ($this->writer !== null) {
            ($this->writer)($record);
            return;
        }

        error_log($record);
    }
}
