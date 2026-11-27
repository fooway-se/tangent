<?php

declare(strict_types=1);

namespace Tangent\Modules\EmailNotifications;

use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Request;
use Tangent\Core\Response;
use Tangent\Core\Router;

final class EmailNotificationsRoutes
{
    public function __construct(private readonly EmailNotificationsService $service)
    {
    }

    public function register(Router $router): void
    {
        $router->add('GET', '/api/v1/workspace/notifications', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(200, ['settings' => $this->service->settings($user)], ['cache-control' => 'no-store']);
        });

        $router->add('PUT', '/api/v1/workspace/notifications', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(200, ['settings' => $this->service->update($user, $request->body)], ['cache-control' => 'no-store']);
        });
    }
}
