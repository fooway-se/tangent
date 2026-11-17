<?php

declare(strict_types=1);

namespace Tangent\Core;

use PDO;
use Tangent\Modules\Auth\AuthRoutes;
use Tangent\Modules\Auth\AuthService;
use Tangent\Modules\Auth\Authenticator;
use Tangent\Modules\Auth\CredentialService;
use Tangent\Modules\Auth\CredentialTokenRepository;
use Tangent\Modules\Auth\PasswordSecurity;
use Tangent\Modules\Auth\RateLimiter;
use Tangent\Modules\Auth\TokenRepository;
use Tangent\Modules\Auth\UserRepository;
use Tangent\Modules\Chat\ChatRepository;
use Tangent\Modules\Chat\ChatRoutes;
use Tangent\Modules\Chat\ChatService;
use Tangent\Modules\Issues\IssueRepository;
use Tangent\Modules\Issues\IssuesRoutes;
use Tangent\Modules\Issues\IssuesService;
use Tangent\Modules\Inbox\InboxRoutes;
use Tangent\Modules\Inbox\InboxService;
use Tangent\Modules\Inbox\InboxEventRepository;
use Tangent\Modules\Inbox\InboxEvents;
use Tangent\Modules\Projects\ProjectRepository;
use Tangent\Modules\Projects\ProjectRoutes;
use Tangent\Modules\Projects\ProjectService;
use Tangent\Modules\Projects\MilestoneRepository;
use Tangent\Modules\Projects\MilestoneService;
use Tangent\Modules\Projects\MilestoneRoutes;
use Tangent\Modules\Projects\ClientViewService;
use Tangent\Modules\Projects\ClientViewRoutes;
use Tangent\Modules\Workspaces\WorkspaceRepository;
use Tangent\Modules\Workspaces\WorkspaceRoutes;
use Tangent\Modules\Workspaces\WorkspaceService;

final class Application
{
    public static function create(PDO $pdo, AppConfig $config): Gateway
    {
        $passwords = new PasswordSecurity($config->hibpEnabled);
        $users = new UserRepository($pdo, $passwords);
        $tokens = new TokenRepository($pdo);
        $rateLimiter = new RateLimiter($pdo);
        $workspaceRepository = new WorkspaceRepository($pdo);
        $auth = new AuthService($pdo, $users, $tokens, $rateLimiter, $config, $passwords, $workspaceRepository);
        $projectRepository = new ProjectRepository($pdo);
        $credentials = new CredentialService(
            $pdo,
            $users,
            new CredentialTokenRepository($pdo),
            $tokens,
            $rateLimiter,
            $projectRepository,
            $workspaceRepository,
            $auth,
            $passwords,
            $config,
        );
        $inboxEvents = new InboxEvents(new InboxEventRepository($pdo), $projectRepository, $users);
        $chat = new ChatService(new ChatRepository($pdo), $projectRepository, $inboxEvents, $pdo);
        $issueRepository = new IssueRepository($pdo);
        $milestoneRepository = new MilestoneRepository($pdo);
        $issues = new IssuesService($issueRepository, $projectRepository, $chat, $inboxEvents, $pdo, $milestoneRepository);
        $projects = new ProjectService($projectRepository, $users, $pdo, $chat, $issues);
        $inbox = new InboxService($issueRepository, $projects);
        $clientView = new ClientViewService($projectRepository, $milestoneRepository, $issueRepository, $chat);
        $milestones = new MilestoneService($milestoneRepository, $issueRepository, $projectRepository, $pdo);
        $router = new Router();

        (new AuthRoutes(
            $auth,
            $credentials,
            $config->cookieSecure,
            $config->workspaceId,
            $config->sessionLifetimeSeconds,
        ))->register($router);
        (new WorkspaceRoutes(
            new WorkspaceService($pdo, $workspaceRepository, $users, $tokens, $config),
            $config->cookieSecure,
            $config->sessionLifetimeSeconds,
        ))->register($router);
        (new ProjectRoutes($projects))->register($router);
        (new ClientViewRoutes($clientView, $chat))->register($router);
        (new MilestoneRoutes($milestones))->register($router);
        (new ChatRoutes($chat))->register($router);
        (new IssuesRoutes($issues))->register($router);
        (new InboxRoutes($inbox, $inboxEvents))->register($router);

        return new Gateway($router, new Authenticator($tokens, $config));
    }
}
