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
    ) {
    }

    public static function fromEnvironment(): self
    {
        return new self(
            max(1, (int) (getenv('TANGENT_WORKSPACE_ID') ?: 1)),
            filter_var(getenv('TANGENT_COOKIE_SECURE') ?: 'true', FILTER_VALIDATE_BOOL),
            43200,
            rtrim(getenv('TANGENT_APP_URL') ?: 'http://localhost:8080', '/'),
            filter_var(getenv('TANGENT_HIBP_ENABLED') ?: 'false', FILTER_VALIDATE_BOOL),
            getenv('TANGENT_GITHUB_APP_ID') ?: '',
            getenv('TANGENT_GITHUB_APP_SLUG') ?: '',
            str_replace('\\n', "\n", getenv('TANGENT_GITHUB_PRIVATE_KEY') ?: ''),
            getenv('TANGENT_GITHUB_WEBHOOK_SECRET') ?: '',
        );
    }
}
