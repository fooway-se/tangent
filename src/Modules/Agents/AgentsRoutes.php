<?php

declare(strict_types=1);

namespace Tangent\Modules\Agents;

use Tangent\Core\AuthenticatedUser;
use Tangent\Core\PositiveId;
use Tangent\Core\Request;
use Tangent\Core\Response;
use Tangent\Core\Router;

final class AgentsRoutes
{
    public function __construct(private readonly AgentsService $service)
    {
    }

    public function register(Router $router): void
    {
        $router->add('GET', '/api/v1/agents', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(200, $this->service->list($user));
        });

        $router->add('POST', '/api/v1/agents', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(
                201,
                $this->service->create($user, $request->body, $request->remoteAddress),
                ['cache-control' => 'no-store'],
            );
        });

        $router->add('POST', '/api/v1/agents/{id}/tokens', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(
                201,
                $this->service->rotateToken(
                    $user,
                    PositiveId::parse($params['id']),
                    $request->body,
                    $request->remoteAddress,
                ),
                ['cache-control' => 'no-store'],
            );
        });

        $router->add('DELETE', '/api/v1/agents/{id}', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            $this->service->revoke($user, PositiveId::parse($params['id']));
            return new Response(204);
        });

        $router->add('GET', '/api/v1/agent/projects/{id}/issues', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(200, $this->service->listIssues($user, PositiveId::parse($params['id'])));
        });

        $router->add('GET', '/api/v1/agent/issues/{id}', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(200, $this->service->issue($user, PositiveId::parse($params['id'])));
        });

        $router->add('POST', '/api/v1/agent/issues/{id}/discussion', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(201, $this->service->addComment(
                $user,
                PositiveId::parse($params['id']),
                $request->body,
            ));
        });

        $router->add('PATCH', '/api/v1/agent/issues/{id}/status', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(200, $this->service->updateStatus(
                $user,
                PositiveId::parse($params['id']),
                $request->body,
            ));
        });
    }
}
