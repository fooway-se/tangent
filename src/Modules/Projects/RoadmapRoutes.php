<?php

declare(strict_types=1);

namespace Tangent\Modules\Projects;

use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Request;
use Tangent\Core\Response;
use Tangent\Core\Router;

final class RoadmapRoutes
{
    public function __construct(private readonly RoadmapService $roadmap)
    {
    }

    public function register(Router $router): void
    {
        $router->add('GET', '/api/v1/roadmap', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, ['milestones' => $this->roadmap->list($user)]);
        });
    }
}
