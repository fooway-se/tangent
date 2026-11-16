<?php

declare(strict_types=1);

namespace Tangent\Modules\Issues;

use Tangent\Core\ApiException;
use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Request;
use Tangent\Core\Response;
use Tangent\Core\Router;

final class IssuesRoutes
{
    public function __construct(private readonly IssuesService $service)
    {
    }

    public function register(Router $router): void
    {
        $router->add('POST', '/api/v1/messages/{id}/issue', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(201, [
                'issue' => $this->service->createFromMessage($user, self::positiveId($params['id'])),
            ]);
        });

        $router->add('GET', '/api/v1/projects/{id}/issues', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(200, [
                'issues' => $this->service->list($user, self::positiveId($params['id'])),
            ]);
        });

        $router->add('POST', '/api/v1/projects/{id}/issues', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(201, [
                'issue' => $this->service->create($user, self::positiveId($params['id']), $request->body),
            ]);
        });

        $router->add('PATCH', '/api/v1/issues/{id}', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(200, [
                'issue' => $this->service->update($user, self::positiveId($params['id']), $request->body),
            ]);
        });
    }

    private static function positiveId(string $value): int
    {
        $parsed = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($parsed === false) {
            throw new ApiException(404, 'not_found', 'The requested resource was not found.');
        }
        return $parsed;
    }
}
