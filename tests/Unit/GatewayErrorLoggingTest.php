<?php

declare(strict_types=1);

namespace Tangent\Tests\Unit;

use PHPUnit\Framework\TestCase;
use Tangent\Core\ApiException;
use Tangent\Core\AppConfig;
use Tangent\Core\Gateway;
use Tangent\Core\Request;
use Tangent\Core\RequestErrorReporter;
use Tangent\Core\Router;
use Tangent\Modules\Auth\Authenticator;
use Tangent\Modules\Auth\TokenRepository;

final class GatewayErrorLoggingTest extends TestCase
{
    public function testUnexpectedErrorsReturnAndLogOnlyASafeRequestCorrelationId(): void
    {
        $logs = [];
        $router = new Router();
        $router->add('POST', '/api/v1/diagnostic-probe', static function (): never {
            throw new \RuntimeException('exception-secret password=leak-me');
        }, false);
        $response = $this->gateway($router, static function (string $record) use (&$logs): void {
            $logs[] = $record;
        })->handle(Request::json(
            'POST',
            '/api/v1/diagnostic-probe',
            ['password' => 'body-secret'],
            ['Authorization' => 'Bearer header-secret'],
            ['tangent_session' => 'cookie-secret'],
        ));

        self::assertSame(500, $response->status);
        $requestId = $response->headers['x-request-id'] ?? null;
        self::assertIsString($requestId);
        self::assertMatchesRegularExpression('/^[a-f0-9]{32}$/', $requestId);
        self::assertCount(1, $logs);
        $log = $logs[0];
        $responseBody = json_encode($response->body, JSON_THROW_ON_ERROR);
        self::assertStringContainsString($requestId, $log);
        self::assertStringContainsString('RuntimeException', $log);
        foreach (['exception-secret', 'body-secret', 'header-secret', 'cookie-secret', 'leak-me'] as $secret) {
            self::assertStringNotContainsString($secret, $log);
            self::assertStringNotContainsString($secret, $responseBody);
        }
    }

    public function testExpectedApiExceptionDoesNotCreateAnUnexpectedErrorLog(): void
    {
        $logs = [];
        $router = new Router();
        $router->add('POST', '/api/v1/expected-probe', static function (): never {
            throw new ApiException(422, 'validation_failed', 'The request is invalid.');
        }, false);

        $response = $this->gateway($router, static function (string $record) use (&$logs): void {
            $logs[] = $record;
        })->handle(Request::json('POST', '/api/v1/expected-probe'));

        self::assertSame(422, $response->status);
        self::assertSame([], $logs);
    }

    private function gateway(Router $router, callable $logger): Gateway
    {
        $pdo = new class extends \PDO {
            public function __construct()
            {
            }
        };

        return new Gateway(
            $router,
            new Authenticator(new TokenRepository($pdo), new AppConfig(1)),
            new RequestErrorReporter($logger),
        );
    }
}
