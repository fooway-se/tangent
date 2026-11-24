<?php

declare(strict_types=1);

namespace Tangent\Tests\Unit;

use PHPUnit\Framework\TestCase;
use Tangent\Core\ApiException;
use Tangent\Core\AppConfig;
use Tangent\Modules\GitHub\GitHubAppClient;

final class GitHubAppClientTest extends TestCase
{
    public function testOAuthAuthorizationUrlCarriesClientIdCallbackAndSetupState(): void
    {
        $client = new GitHubAppClient('123', 'unused-key', 'Iv1.test-client', 'test-secret');

        self::assertTrue($client->isUserAuthorizationConfigured());
        self::assertSame(
            'https://github.com/login/oauth/authorize?client_id=Iv1.test-client&redirect_uri=https%3A%2F%2Ftangent.example%2Fapi%2Fv1%2Fgithub%2Fsetup%2Fauthorize&state=setup-state',
            $client->userAuthorizationUrl('setup-state', 'https://tangent.example/api/v1/github/setup/authorize'),
        );
    }

    public function testOAuthAuthorizationCannotStartWithoutBothClientCredentials(): void
    {
        $client = new GitHubAppClient('123', 'unused-key', 'Iv1.test-client');

        self::assertFalse($client->isUserAuthorizationConfigured());
        try {
            $client->userAuthorizationUrl('setup-state', 'https://tangent.example/callback');
            self::fail('OAuth setup must reject incomplete client configuration.');
        } catch (ApiException $exception) {
            self::assertSame(503, $exception->status);
            self::assertSame('github_not_configured', $exception->apiCode);
        }
    }

    public function testOAuthCredentialsLoadFromEnvironment(): void
    {
        $keys = ['TANGENT_GITHUB_OAUTH_CLIENT_ID', 'TANGENT_GITHUB_OAUTH_CLIENT_SECRET'];
        $previous = array_map(static fn (string $key): string|false => getenv($key), $keys);
        putenv('TANGENT_GITHUB_OAUTH_CLIENT_ID=Iv1.env-client');
        putenv('TANGENT_GITHUB_OAUTH_CLIENT_SECRET=env-client-secret');
        try {
            $config = AppConfig::fromEnvironment();

            self::assertSame('Iv1.env-client', $config->githubOAuthClientId);
            self::assertSame('env-client-secret', $config->githubOAuthClientSecret);
        } finally {
            foreach ($keys as $index => $key) {
                if ($previous[$index] === false) {
                    putenv($key);
                } else {
                    putenv($key . '=' . $previous[$index]);
                }
            }
        }
    }

    public function testGitHubRepositoryAllowlistLoadsFromPrivateConfig(): void
    {
        $allowlist = [
            'team-alpha' => ['fooway-se/myfi'],
            'team-beta' => ['fooway-se/allmeter'],
        ];

        $config = AppConfig::fromEnvironment(['github_repository_allowlist' => $allowlist]);

        self::assertSame($allowlist, $config->githubRepositoryAllowlist);
    }

    public function testInvalidGitHubRepositoryAllowlistFailsClosed(): void
    {
        $config = AppConfig::fromEnvironment(['github_repository_allowlist' => 'not-an-array']);

        self::assertSame([], $config->githubRepositoryAllowlist);
    }
}
