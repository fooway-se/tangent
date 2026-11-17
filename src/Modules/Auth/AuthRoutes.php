<?php

declare(strict_types=1);

namespace Tangent\Modules\Auth;

use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Request;
use Tangent\Core\Response;
use Tangent\Core\Router;

final class AuthRoutes
{
    public function __construct(
        private readonly AuthService $service,
        private readonly CredentialService $credentials,
        private readonly bool $cookieSecure,
        private readonly int $defaultWorkspaceId,
        private readonly int $sessionLifetimeSeconds,
    )
    {
    }

    public function register(Router $router): void
    {
        $router->add('POST', '/api/v1/auth/login', function (Request $request): Response {
            $login = $this->service->login($request);
            return $this->sessionResponse($login, $this->defaultWorkspaceId);
        }, false);

        $router->add('POST', '/api/v1/auth/invites/inspect', function (Request $request): Response {
            return Response::json(200, $this->credentials->inspectInvite($request), ['cache-control' => 'no-store']);
        }, false);

        $router->add('POST', '/api/v1/auth/invites/accept', function (Request $request): Response {
            $session = $this->credentials->acceptInvite($request);
            return $this->sessionResponse($session, (int) $session['user']['workspace_id']);
        }, false);

        $router->add('POST', '/api/v1/auth/password-reset/complete', function (Request $request): Response {
            $this->credentials->completePasswordReset($request);
            return new Response(204, [], ['cache-control' => 'no-store']);
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
                    'tangent_workspace=; Path=/api/v1; Max-Age=0; HttpOnly; SameSite=Lax' . $secure,
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

        $router->add('GET', '/api/v1/users/invites', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, ['invites' => $this->credentials->listInvites($user)]);
        });

        $router->add('POST', '/api/v1/users/invites', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(201, ['invite' => $this->credentials->createInvite($user, $request->body, $request->remoteAddress)]);
        });

        $router->add('POST', '/api/v1/users/invites/{id}/link', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, ['invite' => $this->credentials->regenerateInviteLink(
                $user,
                self::positiveId($params['id']),
                $request->remoteAddress,
            )]);
        });

        $router->add('PATCH', '/api/v1/users/{id}/status', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, ['user' => $this->service->setWorkspaceMemberActive(
                $user,
                self::positiveId($params['id']),
                $request->body,
            )]);
        });

        $router->add('PATCH', '/api/v1/users/{id}/role', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, ['user' => $this->service->setWorkspaceMemberRole(
                $user,
                self::positiveId($params['id']),
                $request->body,
            )]);
        });

        $router->add('POST', '/api/v1/users/{id}/password-reset', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, $this->credentials->generatePasswordResetLink(
                $user,
                self::positiveId($params['id']),
                $request->remoteAddress,
            ), ['cache-control' => 'no-store']);
        });

        $router->add('DELETE', '/api/v1/users/invites/{id}', function (Request $request, array $params, AuthenticatedUser $user): Response {
            $this->credentials->revokeInvite($user, self::positiveId($params['id']));
            return new Response(204);
        });
    }

    private static function positiveId(string $value): int
    {
        if (!ctype_digit($value) || (int) $value < 1) {
            throw new \Tangent\Core\ApiException(404, 'not_found', 'The requested resource was not found.');
        }
        return (int) $value;
    }

    private function sessionResponse(array $session, int $workspaceId): Response
    {
        $secure = $this->cookieSecure ? '; Secure' : '';
        $maxAge = $this->sessionLifetimeSeconds;
        return Response::json(200, [
            'user' => $session['user'],
            'csrf_token' => $session['csrf_token'],
            'expires_at' => $session['expires_at'],
        ], [
            'set-cookie' => [
                'tangent_session=' . $session['session_token']
                    . '; Path=/api/v1; Max-Age=' . $maxAge . '; HttpOnly; SameSite=Lax' . $secure,
                'tangent_csrf=' . $session['csrf_token']
                    . '; Path=/; Max-Age=' . $maxAge . '; SameSite=Lax' . $secure,
                'tangent_workspace=' . $workspaceId
                    . '; Path=/api/v1; Max-Age=' . $maxAge . '; HttpOnly; SameSite=Lax' . $secure,
            ],
            'cache-control' => 'no-store',
        ]);
    }
}
