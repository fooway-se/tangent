<?php

declare(strict_types=1);

namespace Tangent\Modules\Inbox;

use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Request;
use Tangent\Core\Response;
use Tangent\Core\Router;

final class InboxRoutes
{
    public function __construct(private readonly InboxService $service)
    {
    }

    public function register(Router $router): void
    {
        $router->add('GET', '/api/v1/inbox', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(200, ['issues' => $this->service->list($user)]);
        });
    }
}
