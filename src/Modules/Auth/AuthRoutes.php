<?php

declare(strict_types=1);

namespace Tangent\Modules\Auth;

use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Request;
use Tangent\Core\Response;
use Tangent\Core\Router;

final class AuthRoutes
{
    public function __construct(private readonly AuthService $service, private readonly bool $cookieSecure)
    {
    }

    public function register(Router $router): void
    {
        $router->add('POST', '/api/v1/auth/login', function (Request $request): Response {
            $login = $this->service->login($request);
            $secure = $this->cookieSecure ? '; Secure' : '';
            $maxAge = 43200;
            return Response::json(200, [
                'user' => $login['user'],
                'csrf_token' => $login['csrf_token'],
                'expires_at' => $login['expires_at'],
            ], [
                'set-cookie' => [
                    'tangent_session=' . $login['session_token']
                        . '; Path=/api/v1; Max-Age=' . $maxAge . '; HttpOnly; SameSite=Lax' . $secure,
                    'tangent_csrf=' . $login['csrf_token']
                        . '; Path=/; Max-Age=' . $maxAge . '; SameSite=Lax' . $secure,
                ],
                'cache-control' => 'no-store',
            ]);
        }, false);

        $router->add('GET', '/api/v1/auth/me', static function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, ['user' => $user->publicData()], ['cache-control' => 'no-store']);
        });

        $router->add('POST', '/api/v1/auth/logout', function (Request $request, array $params, AuthenticatedUser $user): Response {
            $this->service->logout($user);
            $secure = $this->cookieSecure ? '; Secure' : '';
            return new Response(204, [], [
                'set-cookie' => [
                    'tangent_session=; Path=/api/v1; Max-Age=0; HttpOnly; SameSite=Lax' . $secure,
                    'tangent_csrf=; Path=/; Max-Age=0; SameSite=Lax' . $secure,
                ],
                'cache-control' => 'no-store',
            ]);
        });

        $router->add('GET', '/api/v1/tokens', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, ['tokens' => $this->service->listApiTokens($user)]);
        });

        $router->add('POST', '/api/v1/tokens', function (Request $request, array $params, AuthenticatedUser $user): Response {
            $label = is_string($request->body['label'] ?? null) ? $request->body['label'] : '';
            return Response::json(201, $this->service->createApiToken($user, $label, $request->remoteAddress));
        });

        $router->add('DELETE', '/api/v1/tokens/{id}', function (Request $request, array $params, AuthenticatedUser $user): Response {
            $this->service->revokeApiToken($user, self::positiveId($params['id']));
            return new Response(204);
        });

        $router->add('GET', '/api/v1/users', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, ['users' => $this->service->listUsers($user)]);
        });

        $router->add('POST', '/api/v1/users', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(201, ['user' => $this->service->createDeveloper($user, $request->body)]);
        });
    }

    private static function positiveId(string $value): int
    {
        if (!ctype_digit($value) || (int) $value < 1) {
            throw new \Tangent\Core\ApiException(404, 'not_found', 'The requested resource was not found.');
        }
        return (int) $value;
    }
}
