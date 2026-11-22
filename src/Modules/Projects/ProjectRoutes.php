<?php

declare(strict_types=1);

namespace Tangent\Modules\Projects;

use Tangent\Core\AuthenticatedUser;
use Tangent\Core\PositiveId;
use Tangent\Core\Request;
use Tangent\Core\Response;
use Tangent\Core\Router;

final class ProjectRoutes
{
    public function __construct(private readonly ProjectService $service)
    {
    }

    public function register(Router $router): void
    {
        $router->add('GET', '/api/v1/projects', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, ['projects' => $this->service->list($user)]);
        });

        $router->add('POST', '/api/v1/projects', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(201, ['project' => $this->service->create($user, $request->body)]);
        });

        $router->add('GET', '/api/v1/projects/{id}/members', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, ['members' => $this->service->members($user, PositiveId::parse($params['id']))]);
        });

        $router->add('GET', '/api/v1/users/{userId}/projects', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, $this->service->guestProjectAccess($user, PositiveId::parse($params['userId'])));
        });

        $router->add('PUT', '/api/v1/users/{userId}/projects', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, $this->service->updateGuestProjectAccess(
                $user,
                PositiveId::parse($params['userId']),
                $request->body,
            ));
        });

        $router->add('PUT', '/api/v1/projects/{id}/members/{userId}', function (Request $request, array $params, AuthenticatedUser $user): Response {
            $member = $this->service->addMember(
                $user,
                PositiveId::parse($params['id']),
                PositiveId::parse($params['userId']),
            );
            return Response::json(200, ['member' => $member]);
        });

        $router->add('DELETE', '/api/v1/projects/{id}/members/{userId}', function (Request $request, array $params, AuthenticatedUser $user): Response {
            $this->service->removeMember(
                $user,
                PositiveId::parse($params['id']),
                PositiveId::parse($params['userId']),
            );
            return new Response(204);
        });

        $router->add('GET', '/api/v1/projects/{id}', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, $this->service->get($user, PositiveId::parse($params['id'])));
        });

        $router->add('PATCH', '/api/v1/projects/{id}', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, [
                'project' => $this->service->update($user, PositiveId::parse($params['id']), $request->body),
            ]);
        });

        $router->add('GET', '/api/v1/projects/{id}/notes', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, $this->service->notes($user, PositiveId::parse($params['id'])));
        });

        $router->add('PUT', '/api/v1/projects/{id}/notes', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, $this->service->saveNotes($user, PositiveId::parse($params['id']), $request->body));
        });
    }

}
