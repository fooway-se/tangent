<?php

declare(strict_types=1);

namespace Tangent\Modules\Projects;

use Tangent\Core\ApiException;
use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Request;
use Tangent\Core\Response;
use Tangent\Core\Router;
use Tangent\Modules\Chat\ChatService;

final class ClientViewRoutes
{
    public function __construct(private readonly ClientViewService $view, private readonly ChatService $chat)
    {
    }

    public function register(Router $router): void
    {
        $router->add('GET', '/api/v1/projects/{id}/client-view', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, $this->view->get($user, self::positiveId($params['id'])));
        });
        $router->add('POST', '/api/v1/projects/{id}/client-comments', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(201, ['message' => $this->chat->sendClientComment($user, self::positiveId($params['id']), $request->body)]);
        });
    }

    private static function positiveId(string $value): int
    {
        $id = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($id === false) throw new ApiException(404, 'not_found', 'The requested resource was not found.');
        return $id;
    }
}
