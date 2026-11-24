<?php

declare(strict_types=1);

namespace Tangent\Tests\Unit;

use PHPUnit\Framework\TestCase;
use Tangent\Core\AppConfig;

final class AppConfigTest extends TestCase
{
    public function testGroupedPrivateConfigLoadsAppSecurityMailAndGitHubSettings(): void
    {
        $keys = [
            'TANGENT_WORKSPACE_ID',
            'TANGENT_COOKIE_SECURE',
            'TANGENT_APP_URL',
            'TANGENT_HIBP_ENABLED',
            'TANGENT_MAIL_FROM',
            'TANGENT_GITHUB_APP_ID',
            'TANGENT_GITHUB_APP_SLUG',
            'TANGENT_GITHUB_PRIVATE_KEY',
            'TANGENT_GITHUB_WEBHOOK_SECRET',
            'TANGENT_GITHUB_OAUTH_CLIENT_ID',
            'TANGENT_GITHUB_OAUTH_CLIENT_SECRET',
        ];
        $previous = [];
        foreach ($keys as $key) {
            $previous[$key] = getenv($key);
            putenv($key);
        }

        try {
            $config = AppConfig::fromEnvironment([
                'app' => [
                    'workspace_id' => 23,
                    'url' => 'https://tangent.example/',
                ],
                'security' => [
                    'cookie_secure' => false,
                    'hibp_enabled' => true,
                ],
                'mail' => [
                    'from' => 'no-reply@tangent.example',
                ],
                'github' => [
                    'app_id' => '12345',
                    'app_slug' => 'tangent-app',
                    'private_key' => 'key-line-1\\nkey-line-2',
                    'webhook_secret' => 'webhook-secret',
                    'oauth_client_id' => 'oauth-client',
                    'oauth_client_secret' => 'oauth-secret',
                ],
            ]);

            self::assertSame(23, $config->workspaceId);
            self::assertSame('https://tangent.example', $config->publicAppUrl);
            self::assertFalse($config->cookieSecure);
            self::assertTrue($config->hibpEnabled);
            self::assertSame('no-reply@tangent.example', $config->mailFrom);
            self::assertSame('12345', $config->githubAppId);
            self::assertSame('tangent-app', $config->githubAppSlug);
            self::assertSame("key-line-1\nkey-line-2", $config->githubPrivateKey);
            self::assertSame('webhook-secret', $config->githubWebhookSecret);
            self::assertSame('oauth-client', $config->githubOAuthClientId);
            self::assertSame('oauth-secret', $config->githubOAuthClientSecret);
        } finally {
            foreach ($previous as $key => $value) {
                if ($value === false) {
                    putenv($key);
                } else {
                    putenv($key . '=' . $value);
                }
            }
        }
    }
}
