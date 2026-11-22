<?php

declare(strict_types=1);

namespace Tangent\Modules\Projects;

use Tangent\Core\AuthenticatedUser;
use Tangent\Core\PositiveId;
use Tangent\Core\Request;
use Tangent\Core\Response;
use Tangent\Core\Router;

final class MilestoneRoutes
{
    public function __construct(private readonly MilestoneService $service)
    {
    }

    public function register(Router $router): void
    {
        $router->add('GET', '/api/v1/projects/{id}/milestones', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, ['milestones' => $this->service->list($user, PositiveId::parse($params['id']))]);
        });
        $router->add('POST', '/api/v1/projects/{id}/milestones', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(201, ['milestone' => $this->service->create($user, PositiveId::parse($params['id']), $request->body)]);
        });
        $router->add('PATCH', '/api/v1/projects/{id}/milestones/{milestoneId}', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, ['milestone' => $this->service->update(
                $user, PositiveId::parse($params['id']), PositiveId::parse($params['milestoneId']), $request->body,
            )]);
        });
        $router->add('DELETE', '/api/v1/projects/{id}/milestones/{milestoneId}', function (Request $request, array $params, AuthenticatedUser $user): Response {
            $this->service->delete($user, PositiveId::parse($params['id']), PositiveId::parse($params['milestoneId']));
            return new Response(204);
        });
    }

}
