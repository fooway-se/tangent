<?php

declare(strict_types=1);

namespace Tangent\Core;

final class Request
{
    public const MAX_BODY_BYTES = 1_048_576;

    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $body,
        public readonly array $headers = [],
        public readonly array $cookies = [],
        public readonly string $remoteAddress = 'unknown',
        public readonly bool $validJson = true,
        public readonly array $query = [],
        public readonly string $rawBody = '',
        public readonly bool $bodyTooLarge = false,
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
        ?string $rawBody = null,
    ): self {
        $encodedBody = json_encode($body);
        $rawBody ??= ($encodedBody === false ? '' : $encodedBody);
        if (!self::hasHeader($headers, 'Content-Type')) {
            $headers['Content-Type'] = 'application/json';
        }
        return new self(
            strtoupper($method),
            $path,
            $body,
            $headers,
            $cookies,
            $remoteAddress,
            true,
            $query,
            $rawBody,
            strlen($rawBody) > self::MAX_BODY_BYTES,
        );
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
        $bodyTooLarge = strlen($rawBody) > self::MAX_BODY_BYTES;
        if ($bodyTooLarge) {
            $validJson = false;
        } elseif ($rawBody !== '') {
            $contentType = self::headerValue($headers, 'Content-Type');
            $mediaType = strtolower(trim(explode(';', $contentType ?? '', 2)[0]));
            if ($mediaType !== 'application/json') {
                $validJson = false;
            } else {
                $decoded = json_decode($rawBody, true);
                $validJson = json_last_error() === JSON_ERROR_NONE && is_array($decoded);
                if ($validJson) {
                    $body = $decoded;
                }
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
            $rawBody,
            $bodyTooLarge,
        );
    }

    public function header(string $name): ?string
    {
        return self::headerValue($this->headers, $name);
    }

    public function isSafeMethod(): bool
    {
        return in_array($this->method, ['GET', 'HEAD', 'OPTIONS'], true);
    }

    private static function hasHeader(array $headers, string $name): bool
    {
        foreach ($headers as $key => $_value) {
            if (strcasecmp((string) $key, $name) === 0) {
                return true;
            }
        }
        return false;
    }

    private static function headerValue(array $headers, string $name): ?string
    {
        foreach ($headers as $key => $value) {
            if (strcasecmp((string) $key, $name) === 0) {
                return is_string($value) ? $value : null;
            }
        }
        return null;
    }
}
