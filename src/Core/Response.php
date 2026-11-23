<?php

declare(strict_types=1);

namespace Tangent\Core;

use Closure;

final class Response
{
    private readonly ?Closure $streamer;

    public function __construct(
        public readonly int $status,
        public readonly array $body = [],
        public readonly array $headers = [],
        ?callable $streamer = null,
    ) {
        $this->streamer = $streamer === null ? null : Closure::fromCallable($streamer);
    }

    public static function json(int $status, array $body = [], array $headers = []): self
    {
        $normalized = ['content-type' => 'application/json; charset=utf-8'];
        foreach ($headers as $name => $value) {
            $normalized[strtolower($name)] = $value;
        }

        return new self($status, $body, $normalized);
    }

    public static function notModified(array $headers = []): self
    {
        $normalized = [];
        foreach ($headers as $name => $value) {
            $normalized[strtolower($name)] = $value;
        }

        return new self(304, [], $normalized);
    }

    public static function stream(callable $streamer, array $headers = []): self
    {
        $normalized = ['content-type' => 'text/event-stream; charset=utf-8'];
        foreach ($headers as $name => $value) {
            $normalized[strtolower($name)] = $value;
        }

        return new self(200, [], $normalized, $streamer);
    }

    public function isStreamed(): bool
    {
        return $this->streamer !== null;
    }

    public function streamer(): ?Closure
    {
        return $this->streamer;
    }

    public function send(): never
    {
        http_response_code($this->status);
        foreach ($this->headers as $name => $value) {
            foreach ((array) $value as $item) {
                header($name . ': ' . $item, $name !== 'set-cookie');
            }
        }

        if ($this->streamer !== null) {
            ($this->streamer)();
        } elseif (!in_array($this->status, [204, 304], true)) {
            echo json_encode($this->body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        }

        exit;
    }
}
