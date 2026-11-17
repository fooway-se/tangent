<?php

declare(strict_types=1);

namespace Tangent\Modules\Inbox;

use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Request;
use Tangent\Core\Response;
use Tangent\Core\Router;

final class InboxRoutes
{
    public function __construct(private readonly InboxService $service, private readonly InboxEvents $events)
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

        $router->add('GET', '/api/v1/inbox/events', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, ['events' => $this->events->list($user)]);
        });

        $router->add('PATCH', '/api/v1/inbox/events/{id}', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, ['event' => $this->events->update($user, self::positiveId($params['id']), $request->body)]);
        });

        $router->add('POST', '/api/v1/inbox/events/read-all', function (Request $request, array $params, AuthenticatedUser $user): Response {
            $this->events->markAllRead($user);
            return Response::json(204);
        });
    }

    private static function positiveId(string $value): int
    {
        $parsed = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($parsed === false) throw new \Tangent\Core\ApiException(404, 'not_found', 'The requested resource was not found.');
        return $parsed;
    }
}
