<?php

declare(strict_types=1);

namespace Tangent\Core;

final class Response
{
    public function __construct(
        public readonly int $status,
        public readonly array $body = [],
        public readonly array $headers = [],
    ) {
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

    public function send(): never
    {
        http_response_code($this->status);
        foreach ($this->headers as $name => $value) {
            foreach ((array) $value as $item) {
                header($name . ': ' . $item, $name !== 'set-cookie');
            }
        }

        if (!in_array($this->status, [204, 304], true)) {
            echo json_encode($this->body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        }

        exit;
    }
}
