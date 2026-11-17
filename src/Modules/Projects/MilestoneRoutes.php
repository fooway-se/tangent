<?php

declare(strict_types=1);

namespace Tangent\Modules\Projects;

use Tangent\Core\ApiException;
use Tangent\Core\AuthenticatedUser;
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
            return Response::json(200, ['milestones' => $this->service->list($user, self::positiveId($params['id']))]);
        });
        $router->add('POST', '/api/v1/projects/{id}/milestones', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(201, ['milestone' => $this->service->create($user, self::positiveId($params['id']), $request->body)]);
        });
        $router->add('PATCH', '/api/v1/projects/{id}/milestones/{milestoneId}', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, ['milestone' => $this->service->update(
                $user, self::positiveId($params['id']), self::positiveId($params['milestoneId']), $request->body,
            )]);
        });
        $router->add('DELETE', '/api/v1/projects/{id}/milestones/{milestoneId}', function (Request $request, array $params, AuthenticatedUser $user): Response {
            $this->service->delete($user, self::positiveId($params['id']), self::positiveId($params['milestoneId']));
            return new Response(204);
        });
    }

    private static function positiveId(string $value): int
    {
        $id = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($id === false) throw new ApiException(404, 'not_found', 'The requested resource was not found.');
        return $id;
    }
}
