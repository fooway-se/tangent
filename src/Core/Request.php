<?php

declare(strict_types=1);

namespace Tangent\Core;

final class Request
{
    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $body,
        public readonly array $headers = [],
        public readonly array $cookies = [],
        public readonly string $remoteAddress = 'unknown',
        public readonly bool $validJson = true,
        public readonly array $query = [],
    ) {
    }

    public static function json(
        string $method,
        string $path,
        array $body = [],
        array $headers = [],
        array $cookies = [],
        string $remoteAddress = 'unknown',
        array $query = [],
    ): self {
        return new self(strtoupper($method), $path, $body, $headers, $cookies, $remoteAddress, true, $query);
    }

    public static function fromHttp(
        string $method,
        string $uri,
        array $query,
        array $headers,
        array $cookies,
        string $rawBody,
        string $remoteAddress,
    ): self {
        $body = [];
        $validJson = true;
        if ($rawBody !== '') {
            $decoded = json_decode($rawBody, true);
            $validJson = json_last_error() === JSON_ERROR_NONE && is_array($decoded);
            if ($validJson) {
                $body = $decoded;
            }
        }

        $path = parse_url($uri, PHP_URL_PATH);
        return new self(
            strtoupper($method),
            is_string($path) && $path !== '' ? $path : '/',
            $body,
            $headers,
            $cookies,
            $remoteAddress,
            $validJson,
            $query,
        );
    }

    public function header(string $name): ?string
    {
        foreach ($this->headers as $key => $value) {
            if (strcasecmp($key, $name) === 0) {
                return $value;
            }
        }

        return null;
    }

    public function isSafeMethod(): bool
    {
        return in_array($this->method, ['GET', 'HEAD', 'OPTIONS'], true);
    }
}
