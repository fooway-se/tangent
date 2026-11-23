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
use Tangent\Modules\Agents\AgentRepository;
use Tangent\Modules\Agents\AgentsRoutes;
use Tangent\Modules\Agents\AgentsService;
use Tangent\Modules\Chat\ChatRepository;
use Tangent\Modules\Chat\ChatRoutes;
use Tangent\Modules\Chat\ChatService;
use Tangent\Modules\Chat\RealtimeRoutes;
use Tangent\Modules\Issues\IssueRepository;
use Tangent\Modules\Issues\IssueDiscussionRepository;
use Tangent\Modules\Issues\IssuesRoutes;
use Tangent\Modules\Issues\IssuesService;
use Tangent\Modules\GitHub\GitHubAppClient;
use Tangent\Modules\GitHub\GitHubApiClient;
use Tangent\Modules\GitHub\GitHubCommitRepository;
use Tangent\Modules\GitHub\GitHubInstallationRepository;
use Tangent\Modules\GitHub\GitHubPullRequestRepository;
use Tangent\Modules\GitHub\GitHubRoutes;
use Tangent\Modules\GitHub\GitHubService;
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
use Tangent\Modules\Projects\RoadmapRepository;
use Tangent\Modules\Projects\RoadmapRoutes;
use Tangent\Modules\Projects\RoadmapService;
use Tangent\Modules\Workspaces\WorkspaceRepository;
use Tangent\Modules\Workspaces\WorkspaceRoutes;
use Tangent\Modules\Workspaces\WorkspaceService;

final class Application
{
    public static function create(
        PDO $pdo,
        AppConfig $config,
        ?GitHubApiClient $githubApiClient = null,
        ?Mailer $mailer = null,
    ): Gateway
    {
        $realtimeFeed = new WorkspaceRealtimeFeed($pdo);
        $basePath = AppBasePath::fromPublicUrl($config->publicAppUrl);
        $apiCookiePath = AppBasePath::apiCookiePath($basePath);
        $csrfCookiePath = AppBasePath::csrfCookiePath($basePath);
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
            $mailer ?? new NativeMailer($config->mailFrom),
        );
        $inboxEvents = new InboxEvents(new InboxEventRepository($pdo), $projectRepository, $users);
        $chat = new ChatService(new ChatRepository($pdo), $projectRepository, $inboxEvents, $pdo);
        $issueRepository = new IssueRepository($pdo);
        $issueDiscussionRepository = new IssueDiscussionRepository($pdo);
        $milestoneRepository = new MilestoneRepository($pdo);
        $issues = new IssuesService(
            $issueRepository,
            $projectRepository,
            $chat,
            $inboxEvents,
            $pdo,
            $milestoneRepository,
            $issueDiscussionRepository,
        );
        $agents = new AgentsService(
            new AgentRepository($pdo),
            $projectRepository,
            $tokens,
            $rateLimiter,
            $issueRepository,
            $issueDiscussionRepository,
            $inboxEvents,
            $pdo,
        );
        $github = new GitHubService(
            $githubApiClient ?? new GitHubAppClient(
                $config->githubAppId,
                $config->githubPrivateKey,
                $config->githubOAuthClientId,
                $config->githubOAuthClientSecret,
            ),
            new GitHubInstallationRepository($pdo),
            new GitHubPullRequestRepository($pdo),
            new GitHubCommitRepository($pdo),
            $projectRepository,
            $issueRepository,
            $inboxEvents,
            $pdo,
            $config,
            $realtimeFeed,
        );
        $projects = new ProjectService($projectRepository, $users, $pdo, $chat, $issues, $workspaceRepository, $github);
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
            $apiCookiePath,
            $csrfCookiePath,
        ))->register($router);
        (new WorkspaceRoutes(
            new WorkspaceService($pdo, $workspaceRepository, $users, $tokens, $config),
            $config->cookieSecure,
            $config->sessionLifetimeSeconds,
            $apiCookiePath,
            $csrfCookiePath,
        ))->register($router);
        (new ProjectRoutes($projects))->register($router);
        (new RoadmapRoutes(new RoadmapService(new RoadmapRepository($pdo))))->register($router);
        (new ClientViewRoutes($clientView, $chat))->register($router);
        (new MilestoneRoutes($milestones))->register($router);
        (new ChatRoutes($chat))->register($router);
        (new RealtimeRoutes(
            $realtimeFeed,
            $config->realtimeStreamEnabled,
            $config->realtimeMaxConnections,
        ))->register($router);
        (new IssuesRoutes($issues))->register($router);
        (new AgentsRoutes($agents))->register($router);
        (new InboxRoutes($inbox, $inboxEvents))->register($router);
        (new GitHubRoutes($github, $config))->register($router);

        return new Gateway($router, new Authenticator($tokens, $config), new RequestErrorReporter(), $realtimeFeed);
    }
}
