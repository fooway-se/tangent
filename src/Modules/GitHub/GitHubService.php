<?php

declare(strict_types=1);

namespace Tangent\Modules\GitHub;

use DateTimeImmutable;
use DateTimeZone;
use PDO;
use Tangent\Core\ApiException;
use Tangent\Core\AppConfig;
use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Permissions;
use Tangent\Core\Request;
use Tangent\Modules\Inbox\InboxEvents;
use Tangent\Modules\Issues\IssueRepository;
use Tangent\Modules\Projects\ProjectLifecycle;
use Tangent\Modules\Projects\ProjectRepository;

final class GitHubService
{
    public function __construct(
        private readonly GitHubApiClient $client,
        private readonly GitHubInstallationRepository $installations,
        private readonly GitHubPullRequestRepository $pullRequests,
        private readonly ProjectRepository $projects,
        private readonly IssueRepository $issues,
        private readonly InboxEvents $inboxEvents,
        private readonly PDO $pdo,
        private readonly AppConfig $config,
    ) {
    }

    public function repositories(AuthenticatedUser $user): array
    {
        $this->requireAdmin($user);
        $installations = $this->installations->listForWorkspace($user->workspaceId);
        $repositories = [];
        $configured = $this->client->isConfigured() && $this->config->githubAppSlug !== '';
        if ($configured) {
            foreach ($installations as $installation) {
                try {
                    foreach ($this->client->repositories($installation['installation_id']) as $repository) {
                        $repositories[] = $repository;
                    }
                } catch (ApiException $exception) {
                    if (!in_array($exception->status, [403, 404], true)) throw $exception;
                }
            }
        }
        usort($repositories, static fn (array $left, array $right): int => strcasecmp($left['full_name'], $right['full_name']));
        return [
            'configured' => $configured,
            'can_connect' => $configured && $this->client->isUserAuthorizationConfigured(),
            'connected' => $installations !== [],
            'repositories' => $repositories,
        ];
    }

    public function startInstallation(AuthenticatedUser $user): array
    {
        $this->requireAdmin($user);
        $this->requireSetupSession($user);
        if (!$this->client->isConfigured() || $this->config->githubAppSlug === '' || !$this->client->isUserAuthorizationConfigured()) {
            throw new ApiException(503, 'github_not_configured', 'Configure the GitHub App and user authorization before connecting a repository.');
        }
        $state = bin2hex(random_bytes(32));
        $this->installations->createState($user->workspaceId, $user->id, $user->tokenId, hash('sha256', $state));
        $url = 'https://github.com/apps/' . rawurlencode($this->config->githubAppSlug)
            . '/installations/new?state=' . rawurlencode($state);
        return ['url' => $url];
    }

    public function beginInstallationAuthorization(AuthenticatedUser $user, int $installationId, string $state): string
    {
        $this->requireAdmin($user);
        $this->requireSetupSession($user);
        if ($installationId < 1 || preg_match('/^[a-f0-9]{64}$/', $state) !== 1) {
            throw new ApiException(400, 'github_setup_invalid', 'The GitHub setup response is invalid. Start the connection again.');
        }
        if (!$this->installations->bindInstallation(
            $user->workspaceId,
            $user->id,
            $user->tokenId,
            hash('sha256', $state),
            $installationId,
        )) {
            throw new ApiException(403, 'github_setup_state_invalid', 'The GitHub setup link expired or was already used. Start the connection again.');
        }
        $callbackUrl = rtrim($this->config->publicAppUrl, '/') . '/api/v1/github/setup/authorize';
        return $this->client->userAuthorizationUrl($state, $callbackUrl);
    }

    public function completeInstallation(AuthenticatedUser $user, string $code, string $state): void
    {
        $this->requireAdmin($user);
        $this->requireSetupSession($user);
        if ($code === '' || strlen($code) > 2048 || preg_match('/^[a-f0-9]{64}$/', $state) !== 1) {
            throw new ApiException(400, 'github_setup_invalid', 'The GitHub authorization response is invalid. Start the connection again.');
        }
        $stateHash = hash('sha256', $state);
        $installationId = $this->installations->installationForState(
            $user->workspaceId,
            $user->id,
            $user->tokenId,
            $stateHash,
        );
        if ($installationId === null) {
            throw new ApiException(403, 'github_setup_state_invalid', 'The GitHub setup link expired or was already used. Start the connection again.');
        }
        if (!$this->client->canUserAccessInstallation($code, $installationId)) {
            throw new ApiException(403, 'github_installation_not_authorized', 'The authorized GitHub user cannot access this installation. Start the connection again with an account that can manage it.');
        }
        $installation = $this->client->verifyInstallation($installationId);
        $accountLogin = $installation['account']['login'] ?? null;
        if (!is_string($accountLogin) || $accountLogin === '') {
            throw new ApiException(422, 'github_setup_invalid', 'GitHub did not identify the installation account.');
        }
        if (!$this->installations->consumeState(
            $user->workspaceId,
            $user->id,
            $user->tokenId,
            $stateHash,
            $installationId,
        )) {
            throw new ApiException(403, 'github_setup_state_invalid', 'The GitHub setup link expired or was already used. Start the connection again.');
        }
        $this->installations->add($user->workspaceId, $installationId, $accountLogin, $user->id);
    }

    public function repositoryForWorkspace(int $workspaceId, int $repositoryId): array
    {
        if ($repositoryId < 1) throw new ApiException(422, 'validation_failed', 'Choose a GitHub repository available to this workspace.');
        foreach ($this->installations->listForWorkspace($workspaceId) as $installation) {
            try {
                foreach ($this->client->repositories($installation['installation_id']) as $repository) {
                    if ((int) $repository['id'] === $repositoryId) return $repository;
                }
            } catch (ApiException $exception) {
                if (!in_array($exception->status, [403, 404], true)) throw $exception;
            }
        }
        throw new ApiException(422, 'validation_failed', 'Choose a GitHub repository connected to this workspace.');
    }

    public function repositoryForInstallation(int $workspaceId, int $installationId, int $repositoryId): array
    {
        if ($installationId < 1 || $repositoryId < 1
            || !$this->installations->isConnectedForWorkspace($workspaceId, $installationId)) {
            throw new ApiException(422, 'validation_failed', 'Choose a GitHub repository connected to this workspace.');
        }

        try {
            $repository = $this->client->repositoryById($installationId, $repositoryId);
        } catch (ApiException $exception) {
            if (!in_array($exception->status, [403, 404], true)) throw $exception;
            throw new ApiException(422, 'validation_failed', 'Choose a GitHub repository connected to this workspace.');
        }

        if ((int) ($repository['id'] ?? 0) !== $repositoryId) {
            throw new ApiException(422, 'validation_failed', 'Choose a GitHub repository connected to this workspace.');
        }
        foreach (['owner', 'name', 'full_name', 'html_url'] as $field) {
            if (!is_string($repository[$field] ?? null) || $repository[$field] === '') {
                throw new ApiException(422, 'validation_failed', 'Choose a GitHub repository connected to this workspace.');
            }
        }

        $repository['installation_id'] = $installationId;
        return $repository;
    }

    public function revalidateRepositoryConnection(int $workspaceId, array $repository): void
    {
        $installationId = (int) ($repository['installation_id'] ?? 0);
        if ($installationId < 1 || !$this->installations->isConnectedForWorkspaceForUpdate($workspaceId, $installationId)) {
            throw new ApiException(422, 'validation_failed', 'Choose a GitHub repository connected to this workspace.');
        }
    }

    public function listPullRequests(AuthenticatedUser $user, int $issueId): array
    {
        $this->requireInternalUser($user);
        $this->issueAndProject($user, $issueId, 'issues.read');
        return $this->pullRequests->listForIssue($user->workspaceId, $issueId);
    }

    public function linkPullRequest(AuthenticatedUser $user, int $issueId, array $input): array
    {
        $this->requireInternalUser($user);
        [$issue, $project] = $this->issueAndProject($user, $issueId, 'issues.update');
        ProjectLifecycle::requireWritable($project['status']);
        $repository = $project['github_repository'];
        if ($repository === null) {
            throw new ApiException(409, 'github_repository_not_connected', 'Connect a GitHub repository to this project first.');
        }
        $url = is_string($input['url'] ?? null) ? trim($input['url']) : '';
        $target = self::parsePullRequestUrl($url);
        if (strcasecmp($target['owner'], $repository['owner']) !== 0
            || strcasecmp($target['repository'], $repository['name']) !== 0) {
            throw new ApiException(422, 'github_pull_request_repository_mismatch', 'The pull request must belong to the repository connected to this project.');
        }
        $remote = $this->client->pullRequest(
            (int) $repository['installation_id'],
            (int) $repository['id'],
            $repository['owner'],
            $repository['name'],
            $target['number'],
        );
        $pullRequest = self::normalizePullRequest($remote, $target['number'], $repository['full_name']);
        return $this->pullRequests->create(
            $user->workspaceId,
            (int) $project['id'],
            (int) $issue['id'],
            $user->id,
            $repository,
            $pullRequest,
        );
    }

    public function unlinkPullRequest(AuthenticatedUser $user, int $issueId, int $pullRequestId): void
    {
        $this->requireInternalUser($user);
        [, $project] = $this->issueAndProject($user, $issueId, 'issues.update');
        ProjectLifecycle::requireWritable($project['status']);
        if (!$this->pullRequests->delete($user->workspaceId, $issueId, $pullRequestId)) {
            throw new ApiException(404, 'not_found', 'The linked pull request was not found.');
        }
    }

    public function handleWebhook(Request $request): array
    {
        $secret = $this->config->githubWebhookSecret;
        $signature = $request->header('X-Hub-Signature-256');
        if ($secret === '' || $signature === null || $request->rawBody === '') {
            throw new ApiException(401, 'github_signature_invalid', 'The GitHub webhook signature is missing or invalid.');
        }
        $expected = 'sha256=' . hash_hmac('sha256', $request->rawBody, $secret);
        if (!hash_equals($expected, $signature)) {
            throw new ApiException(401, 'github_signature_invalid', 'The GitHub webhook signature is missing or invalid.');
        }
        $deliveryId = $request->header('X-GitHub-Delivery');
        $eventType = $request->header('X-GitHub-Event');
        if ($deliveryId === null || $deliveryId === '' || strlen($deliveryId) > 100 || $eventType === null) {
            throw new ApiException(400, 'github_webhook_invalid', 'The GitHub webhook headers are invalid.');
        }

        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) $this->pdo->beginTransaction();
        try {
            if (!$this->pullRequests->recordDelivery($deliveryId, $eventType)) {
                if ($ownsTransaction) $this->pdo->commit();
                return ['accepted' => true, 'duplicate' => true];
            }
            if ($eventType === 'pull_request') $this->processPullRequestWebhook($request->body);
            if ($ownsTransaction) $this->pdo->commit();
        } catch (\Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        }
        return ['accepted' => true, 'duplicate' => false];
    }

    private function processPullRequestWebhook(array $payload): void
    {
        $action = $payload['action'] ?? null;
        $repository = $payload['repository'] ?? null;
        $remotePullRequest = $payload['pull_request'] ?? null;
        $repositoryId = is_array($repository) ? (int) ($repository['id'] ?? 0) : 0;
        $installationId = is_array($payload['installation'] ?? null) ? (int) ($payload['installation']['id'] ?? 0) : 0;
        $number = is_array($remotePullRequest) ? (int) ($remotePullRequest['number'] ?? $payload['number'] ?? 0) : 0;
        if (!is_string($action) || $repositoryId < 1 || $installationId < 1 || $number < 1
            || !is_array($repository) || !is_array($remotePullRequest)) return;

        $linked = $this->pullRequests->findForWebhook($repositoryId, $number, $installationId);
        if ($linked === null || $linked['connected_repository_id'] !== $repositoryId
            || $linked['connected_installation_id'] !== $linked['github_installation_id']) return;
        if ($installationId !== $linked['github_installation_id']) return;
        if (strcasecmp((string) ($repository['full_name'] ?? ''), (string) $linked['repository_full_name']) !== 0) return;

        $pullRequest = self::normalizePullRequest($remotePullRequest, $number, (string) $linked['repository_full_name']);
        if (strtotime($pullRequest['updated_at']) < strtotime((string) $linked['github_updated_at'])) return;
        $oldState = $linked['state'];
        $oldDraft = $linked['is_draft'];
        if (!$this->pullRequests->updateFromWebhook((int) $linked['id'], $pullRequest)) return;
        if ($oldState === $pullRequest['state'] && $oldDraft === $pullRequest['is_draft']
            && !in_array($action, ['opened', 'reopened', 'closed', 'ready_for_review', 'converted_to_draft', 'review_requested'], true)) return;

        $actionText = match ($action) {
            'opened' => 'opened',
            'reopened' => 'reopened',
            'closed' => $pullRequest['state'] === 'merged' ? 'merged' : 'closed',
            'ready_for_review' => 'is ready for review',
            'converted_to_draft' => 'was changed to draft',
            'review_requested' => 'has a review requested',
            default => 'was updated',
        };
        $title = 'GitHub pull request ' . $actionText;
        $detail = $linked['repository_full_name'] . ' #' . $number . ' · ' . $pullRequest['title'];
        $this->inboxEvents->recordGitHubPullRequest(
            (int) $linked['workspace_id'],
            (int) $linked['project_id'],
            (int) $linked['issue_id'],
            $title,
            $detail,
        );
    }

    private function issueAndProject(AuthenticatedUser $user, int $issueId, string $action): array
    {
        $issue = $this->issues->find($user->workspaceId, $issueId);
        if ($issue === null) throw new ApiException(404, 'not_found', 'The issue was not found.');
        $project = $this->projects->find($user->workspaceId, (int) $issue['project_id']);
        if ($project === null) throw new ApiException(404, 'not_found', 'The issue was not found.');
        $isMember = $this->projects->isMember($user->workspaceId, (int) $project['id'], $user->id);
        if (!Permissions::can($user, $action, ['is_member' => $isMember])) {
            throw new ApiException(404, 'not_found', 'The issue was not found.');
        }
        return [$issue, $project];
    }

    private function requireAdmin(AuthenticatedUser $user): void
    {
        if ($user->role !== 'admin') throw new ApiException(403, 'forbidden', 'Only workspace admins can connect GitHub.');
    }

    private function requireSetupSession(AuthenticatedUser $user): void
    {
        if ($user->authenticationMethod !== 'cookie') {
            throw new ApiException(403, 'github_setup_session_required', 'Connect a GitHub installation from a signed-in browser session.');
        }
    }

    private function requireInternalUser(AuthenticatedUser $user): void
    {
        if ($user->role === 'guest') throw new ApiException(404, 'not_found', 'The issue was not found.');
    }

    private static function parsePullRequestUrl(string $url): array
    {
        $parts = parse_url($url);
        if (!is_array($parts) || ($parts['scheme'] ?? '') !== 'https' || strtolower((string) ($parts['host'] ?? '')) !== 'github.com'
            || isset($parts['user']) || isset($parts['pass']) || isset($parts['port'])) {
            throw new ApiException(422, 'validation_failed', 'Enter a GitHub pull request URL.');
        }
        if (preg_match('#^/([A-Za-z0-9_.-]{1,100})/([A-Za-z0-9_.-]{1,100})/pull/([1-9][0-9]*)/?$#', (string) ($parts['path'] ?? ''), $matches) !== 1) {
            throw new ApiException(422, 'validation_failed', 'Enter a URL in the form https://github.com/owner/repository/pull/123.');
        }
        $number = filter_var($matches[3], FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 4_294_967_295]]);
        if ($number === false) throw new ApiException(422, 'validation_failed', 'The pull request number is invalid.');
        return ['owner' => $matches[1], 'repository' => $matches[2], 'number' => $number];
    }

    private static function normalizePullRequest(array $pullRequest, int $expectedNumber, string $expectedRepository): array
    {
        $number = (int) ($pullRequest['number'] ?? 0);
        $title = $pullRequest['title'] ?? null;
        $url = $pullRequest['html_url'] ?? null;
        $state = $pullRequest['state'] ?? null;
        $updatedAt = $pullRequest['updated_at'] ?? null;
        if ($number !== $expectedNumber || !is_string($title) || !is_string($url) || !is_string($state)
            || !in_array($state, ['open', 'closed'], true) || !is_string($updatedAt)
            || strtotime($updatedAt) === false) {
            throw new ApiException(502, 'github_invalid_response', 'GitHub returned incomplete pull request details.');
        }
        try {
            $urlTarget = self::parsePullRequestUrl($url);
        } catch (ApiException) {
            throw new ApiException(502, 'github_invalid_response', 'GitHub returned an invalid pull request URL.');
        }
        if ($urlTarget['number'] !== $expectedNumber
            || strcasecmp($urlTarget['owner'] . '/' . $urlTarget['repository'], $expectedRepository) !== 0) {
            throw new ApiException(502, 'github_invalid_response', 'GitHub returned a pull request for a different repository.');
        }
        $mergedAt = $pullRequest['merged_at'] ?? null;
        $author = is_array($pullRequest['user'] ?? null) ? (string) ($pullRequest['user']['login'] ?? '') : '';
        return [
            'number' => $number,
            'title' => $title,
            'html_url' => $url,
            'state' => $mergedAt !== null ? 'merged' : $state,
            'is_draft' => (bool) ($pullRequest['draft'] ?? false),
            'author_login' => $author,
            'updated_at' => (new DateTimeImmutable($updatedAt))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s'),
        ];
    }
}
