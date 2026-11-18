<?php

declare(strict_types=1);

namespace Tangent\Modules\Projects;

use Tangent\Core\ApiException;
use Tangent\Core\AuthenticatedUser;
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
            return Response::json(200, ['members' => $this->service->members($user, self::positiveId($params['id']))]);
        });

        $router->add('GET', '/api/v1/users/{userId}/projects', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, $this->service->guestProjectAccess($user, self::positiveId($params['userId'])));
        });

        $router->add('PUT', '/api/v1/users/{userId}/projects', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, $this->service->updateGuestProjectAccess(
                $user,
                self::positiveId($params['userId']),
                $request->body,
            ));
        });

        $router->add('PUT', '/api/v1/projects/{id}/members/{userId}', function (Request $request, array $params, AuthenticatedUser $user): Response {
            $member = $this->service->addMember(
                $user,
                self::positiveId($params['id']),
                self::positiveId($params['userId']),
            );
            return Response::json(200, ['member' => $member]);
        });

        $router->add('DELETE', '/api/v1/projects/{id}/members/{userId}', function (Request $request, array $params, AuthenticatedUser $user): Response {
            $this->service->removeMember(
                $user,
                self::positiveId($params['id']),
                self::positiveId($params['userId']),
            );
            return new Response(204);
        });

        $router->add('GET', '/api/v1/projects/{id}', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, $this->service->get($user, self::positiveId($params['id'])));
        });

        $router->add('PATCH', '/api/v1/projects/{id}', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, [
                'project' => $this->service->update($user, self::positiveId($params['id']), $request->body),
            ]);
        });

        $router->add('GET', '/api/v1/projects/{id}/notes', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, $this->service->notes($user, self::positiveId($params['id'])));
        });

        $router->add('PUT', '/api/v1/projects/{id}/notes', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, $this->service->saveNotes($user, self::positiveId($params['id']), $request->body));
        });
    }

    private static function positiveId(string $value): int
    {
        if (!ctype_digit($value) || (int) $value < 1) {
            throw new ApiException(404, 'not_found', 'The requested resource was not found.');
        }
        return (int) $value;
    }
}
