<?php

declare(strict_types=1);

namespace Tangent\Core;

final class AppConfig
{
    public function __construct(
        public readonly int $workspaceId,
        public readonly bool $cookieSecure = true,
        public readonly int $sessionLifetimeSeconds = 43200,
        public readonly string $publicAppUrl = 'http://localhost:8080',
        public readonly bool $hibpEnabled = false,
        public readonly string $githubAppId = '',
        public readonly string $githubAppSlug = '',
        public readonly string $githubPrivateKey = '',
        public readonly string $githubWebhookSecret = '',
        public readonly string $mailFrom = '',
        public readonly string $githubOAuthClientId = '',
        public readonly string $githubOAuthClientSecret = '',
        public readonly bool $realtimeStreamEnabled = false,
        public readonly int $realtimeMaxConnections = 1,
        public readonly ?array $githubRepositoryAllowlist = null,
    ) {
    }

    public static function fromEnvironment(array $fileConfig = []): self
    {
        $maxConnections = getenv('TANGENT_SSE_MAX_CONNECTIONS');
        $streamEnabled = getenv('TANGENT_SSE_ENABLED');

        return new self(
            max(1, (int) self::environmentValue('TANGENT_WORKSPACE_ID', $fileConfig['workspace_id'] ?? '1')),
            filter_var(self::environmentValue('TANGENT_COOKIE_SECURE', $fileConfig['cookie_secure'] ?? 'true'), FILTER_VALIDATE_BOOL),
            43200,
            rtrim(self::environmentValue('TANGENT_APP_URL', $fileConfig['app_url'] ?? 'http://localhost:8080'), '/'),
            filter_var(self::environmentValue('TANGENT_HIBP_ENABLED', $fileConfig['hibp_enabled'] ?? 'false'), FILTER_VALIDATE_BOOL),
            self::environmentValue('TANGENT_GITHUB_APP_ID', $fileConfig['github_app_id'] ?? ''),
            self::environmentValue('TANGENT_GITHUB_APP_SLUG', $fileConfig['github_app_slug'] ?? ''),
            str_replace('\\n', "\n", self::environmentValue('TANGENT_GITHUB_PRIVATE_KEY', $fileConfig['github_private_key'] ?? '')),
            self::environmentValue('TANGENT_GITHUB_WEBHOOK_SECRET', $fileConfig['github_webhook_secret'] ?? ''),
            self::environmentValue('TANGENT_MAIL_FROM', $fileConfig['mail_from'] ?? ''),
            self::environmentValue('TANGENT_GITHUB_OAUTH_CLIENT_ID', $fileConfig['github_oauth_client_id'] ?? ''),
            self::environmentValue('TANGENT_GITHUB_OAUTH_CLIENT_SECRET', $fileConfig['github_oauth_client_secret'] ?? ''),
            filter_var(
                $streamEnabled === false || $streamEnabled === ''
                    ? (string) ($fileConfig['realtime_stream_enabled'] ?? 'false')
                    : $streamEnabled,
                FILTER_VALIDATE_BOOL,
            ),
            max(0, (int) ($maxConnections === false || $maxConnections === ''
                ? ($fileConfig['realtime_max_connections'] ?? 1)
                : $maxConnections)),
            array_key_exists('github_repository_allowlist', $fileConfig)
                ? (is_array($fileConfig['github_repository_allowlist']) ? $fileConfig['github_repository_allowlist'] : [])
                : null,
        );
    }

    private static function environmentValue(string $key, mixed $fallback): string
    {
        $value = getenv($key);
        return $value === false || $value === '' ? (string) $fallback : $value;
    }
}
