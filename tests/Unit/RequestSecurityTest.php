<?php

declare(strict_types=1);

namespace Tangent\Tests\Unit;

use PHPUnit\Framework\TestCase;
use Tangent\Core\ApiException;
use Tangent\Core\AppConfig;
use Tangent\Core\Gateway;
use Tangent\Core\Request;
use Tangent\Core\Router;
use Tangent\Modules\Auth\Authenticator;
use Tangent\Modules\Auth\AuthService;
use Tangent\Modules\Auth\PasswordSecurity;
use Tangent\Modules\Auth\RateLimiter;
use Tangent\Modules\Auth\TokenRepository;
use Tangent\Modules\Auth\UserRepository;
use Tangent\Modules\Workspaces\WorkspaceRepository;

final class RequestSecurityTest extends TestCase
{
    public function testHttpJsonBodyRequiresJsonContentType(): void
    {
        $request = Request::fromHttp(
            'POST',
            '/api/v1/auth/login',
            [],
            ['Content-Type' => 'text/plain'],
            [],
            '{"email":"user@example.test","password":"password"}',
            '192.0.2.1',
        );

        self::assertFalse($request->validJson);
    }

    public function testHttpJsonBodyAcceptsJsonContentTypeParameters(): void
    {
        $request = Request::fromHttp(
            'POST',
            '/api/v1/auth/login',
            [],
            ['Content-Type' => 'application/json; charset=UTF-8'],
            [],
            '{"email":"user@example.test","password":"password"}',
            '192.0.2.1',
        );

        self::assertTrue($request->validJson);
        self::assertSame('user@example.test', $request->body['email']);
    }

    public function testHttpRequestMarksBodiesOverTheLimitWithoutDecodingThem(): void
    {
        $rawBody = '{"large":"' . str_repeat('x', Request::MAX_BODY_BYTES) . '"}';
        $request = Request::fromHttp(
            'POST',
            '/api/v1/auth/login',
            [],
            ['Content-Type' => 'application/json'],
            [],
            $rawBody,
            '192.0.2.1',
        );

        self::assertTrue($request->bodyTooLarge);
        self::assertSame([], $request->body);
    }

    public function testGatewayReturnsPayloadTooLargeForAnOversizedRequest(): void
    {
        $pdo = new class extends \PDO {
            public function __construct()
            {
            }
        };
        $gateway = new Gateway(
            new Router(),
            new Authenticator(new TokenRepository($pdo), new AppConfig(1)),
        );
        $request = Request::fromHttp(
            'POST',
            '/api/v1/auth/login',
            [],
            ['Content-Type' => 'application/json'],
            [],
            '{"large":"' . str_repeat('x', Request::MAX_BODY_BYTES) . '"}',
            '192.0.2.1',
        );

        $response = $gateway->handle($request);

        self::assertSame(413, $response->status);
        self::assertSame('payload_too_large', $response->body['error']['code']);
    }

    public function testLoginRejectsMismatchedOrMalformedOrigins(): void
    {
        $pdo = new class extends \PDO {
            public function __construct()
            {
            }
        };
        $passwords = new PasswordSecurity();
        $auth = new AuthService(
            $pdo,
            new UserRepository($pdo, $passwords),
            new TokenRepository($pdo),
            new RateLimiter($pdo),
            new AppConfig(1, false, 43200, 'https://tangent.example/team'),
            $passwords,
            new WorkspaceRepository($pdo),
        );

        foreach (['https://attacker.example', 'https://attacker.example:99999'] as $origin) {
            try {
                $auth->login(Request::json('POST', '/api/v1/auth/login', [], ['Origin' => $origin]));
                self::fail('Login should reject a mismatched or malformed origin.');
            } catch (ApiException $exception) {
                self::assertSame(403, $exception->status);
                self::assertSame('origin_invalid', $exception->apiCode);
            }
        }
    }
}
