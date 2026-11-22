<?php

declare(strict_types=1);

namespace Tangent\Modules\Workspaces;

use Tangent\Core\AuthenticatedUser;
use Tangent\Core\PositiveId;
use Tangent\Core\Request;
use Tangent\Core\Response;
use Tangent\Core\Router;

final class WorkspaceRoutes
{
    public function __construct(
        private readonly WorkspaceService $service,
        private readonly bool $cookieSecure,
        private readonly int $sessionLifetimeSeconds,
        private readonly string $apiCookiePath = '/api/v1',
        private readonly string $csrfCookiePath = '/',
    ) {
    }

    public function register(Router $router): void
    {
        $router->add('GET', '/api/v1/workspaces', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, ['workspaces' => $this->service->list($user)], ['cache-control' => 'no-store']);
        });

        $router->add('POST', '/api/v1/workspaces', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(201, ['workspace' => $this->service->create($user, $request->body)]);
        });

        $router->add('POST', '/api/v1/workspaces/{id}/switch', function (Request $request, array $params, AuthenticatedUser $user): Response {
            $switched = $this->service->switch(
                $user,
                PositiveId::parse($params['id'], 'The requested workspace was not found.'),
            );
            $secure = $this->cookieSecure ? '; Secure' : '';
            $maxAge = $this->sessionLifetimeSeconds;
            return Response::json(200, [
                'user' => $switched['user'],
                'workspace' => $switched['workspace'],
                'csrf_token' => $switched['csrf_token'],
                'expires_at' => $switched['expires_at'],
            ], [
                'set-cookie' => [
                    'tangent_session=' . $switched['session_token']
                        . '; Path=' . $this->apiCookiePath . '; Max-Age=' . $maxAge . '; HttpOnly; SameSite=Lax' . $secure,
                    'tangent_csrf=' . $switched['csrf_token']
                        . '; Path=' . $this->csrfCookiePath . '; Max-Age=' . $maxAge . '; SameSite=Lax' . $secure,
                    'tangent_workspace=' . $switched['workspace']['id']
                        . '; Path=' . $this->apiCookiePath . '; Max-Age=' . $maxAge . '; HttpOnly; SameSite=Lax' . $secure,
                ],
                'cache-control' => 'no-store',
            ]);
        });
    }

}
