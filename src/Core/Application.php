<?php

declare(strict_types=1);

namespace Tangent\Core;

use PDO;
use Tangent\Modules\Auth\AuthRoutes;
use Tangent\Modules\Auth\AuthService;
use Tangent\Modules\Auth\Authenticator;
use Tangent\Modules\Auth\RateLimiter;
use Tangent\Modules\Auth\TokenRepository;
use Tangent\Modules\Auth\UserRepository;
use Tangent\Modules\Chat\ChatRepository;
use Tangent\Modules\Chat\ChatRoutes;
use Tangent\Modules\Chat\ChatService;
use Tangent\Modules\Projects\ProjectRepository;
use Tangent\Modules\Projects\ProjectRoutes;
use Tangent\Modules\Projects\ProjectService;

final class Application
{
    public static function create(PDO $pdo, AppConfig $config): Gateway
    {
        $users = new UserRepository($pdo);
        $tokens = new TokenRepository($pdo);
        $auth = new AuthService($users, $tokens, new RateLimiter($pdo), $config);
        $projectRepository = new ProjectRepository($pdo);
        $chat = new ChatService(new ChatRepository($pdo), $projectRepository);
        $projects = new ProjectService($projectRepository, $users, $pdo, $chat);
        $router = new Router();

        (new AuthRoutes($auth, $config->cookieSecure))->register($router);
        (new ProjectRoutes($projects))->register($router);
        (new ChatRoutes($chat))->register($router);

        return new Gateway($router, new Authenticator($tokens, $config));
    }
}
