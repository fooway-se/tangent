<?php

declare(strict_types=1);

namespace Tangent\Core;

final class AppConfig
{
    public function __construct(
        public readonly int $workspaceId,
        public readonly bool $cookieSecure = true,
        public readonly int $sessionLifetimeSeconds = 43200,
    ) {
    }

    public static function fromEnvironment(): self
    {
        return new self(
            max(1, (int) (getenv('TANGENT_WORKSPACE_ID') ?: 1)),
            filter_var(getenv('TANGENT_COOKIE_SECURE') ?: 'true', FILTER_VALIDATE_BOOL),
        );
    }
}
