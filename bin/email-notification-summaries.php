<?php

declare(strict_types=1);

use Tangent\Core\NativeMailer;
use Tangent\Core\Runtime;
use Tangent\Modules\Auth\PasswordSecurity;
use Tangent\Modules\Auth\TokenRepository;
use Tangent\Modules\Auth\UserRepository;
use Tangent\Modules\Chat\ChatRepository;
use Tangent\Modules\Chat\ChatService;
use Tangent\Modules\EmailNotifications\EmailNotificationRepository;
use Tangent\Modules\EmailNotifications\EmailNotificationRunner;
use Tangent\Modules\Inbox\InboxEventRepository;
use Tangent\Modules\Inbox\InboxEvents;
use Tangent\Modules\Issues\IssueDiscussionRepository;
use Tangent\Modules\Issues\IssueRepository;
use Tangent\Modules\Issues\IssuesService;
use Tangent\Modules\Projects\MilestoneRepository;
use Tangent\Modules\Projects\ProjectRepository;
use Tangent\Modules\Workspaces\WorkspaceRepository;
use Tangent\Modules\Workspaces\WorkspaceService;

require dirname(__DIR__) . '/bootstrap.php';

if (!Runtime::isConfigured()) {
    fwrite(STDERR, "Tangent is not configured. Complete installation before running notification summaries.\n");
    exit(1);
}

$database = Runtime::database();
$pdo = $database->pdo();
$config = Runtime::appConfig();
$projects = new ProjectRepository($pdo);
$users = new UserRepository($pdo, new PasswordSecurity($config->hibpEnabled));
$workspaces = new WorkspaceService(
    $pdo,
    new WorkspaceRepository($pdo),
    $users,
    new TokenRepository($pdo),
    $config,
);
$inboxEvents = new InboxEvents(new InboxEventRepository($pdo), $projects, $users);
$chat = new ChatService(new ChatRepository($pdo), $projects, $inboxEvents, $pdo);
$issues = new IssuesService(
    new IssueRepository($pdo),
    $projects,
    $chat,
    $inboxEvents,
    $pdo,
    new MilestoneRepository($pdo),
    new IssueDiscussionRepository($pdo),
);
$runner = new EmailNotificationRunner(
    $pdo,
    new EmailNotificationRepository($pdo),
    $workspaces,
    $chat,
    $issues,
    new NativeMailer($config->mailFrom),
    $config->publicAppUrl,
);
$result = $runner->run();

if ($result['skipped']) {
    fwrite(STDOUT, "Another email notification summary run is already active.\n");
    exit(0);
}

fwrite(STDOUT, sprintf(
    "Email notification summaries: %d sent, %d empty, %d failed.\n",
    $result['sent'],
    $result['empty'],
    $result['failed'],
));
exit($result['failed'] > 0 ? 1 : 0);
