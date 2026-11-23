<?php

declare(strict_types=1);

namespace Tangent\Modules\Agents;

use PDO;
use Throwable;
use Tangent\Core\ApiException;
use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Permissions;
use Tangent\Modules\Auth\RateLimiter;
use Tangent\Modules\Auth\TokenRepository;
use Tangent\Modules\Inbox\InboxEvents;
use Tangent\Modules\Issues\IssueDiscussionRepository;
use Tangent\Modules\Issues\IssueRepository;
use Tangent\Modules\Projects\ProjectLifecycle;
use Tangent\Modules\Projects\ProjectRepository;

final class AgentsService
{
    private const CAPABILITIES = ['issues.read', 'issues.comment', 'issues.status.update'];

    public function __construct(
        private readonly AgentRepository $agents,
        private readonly ProjectRepository $projects,
        private readonly TokenRepository $tokens,
        private readonly RateLimiter $rateLimiter,
        private readonly IssueRepository $issues,
        private readonly IssueDiscussionRepository $discussion,
        private readonly InboxEvents $inboxEvents,
        private readonly PDO $pdo,
    ) {
    }

    public function list(AuthenticatedUser $actor): array
    {
        $this->requireManagement($actor);
        return ['agents' => $this->agents->listForWorkspace($actor->workspaceId)];
    }

    public function create(AuthenticatedUser $actor, array $input, string $remoteAddress): array
    {
        $this->requireManagement($actor);
        $name = is_string($input['name'] ?? null) ? trim($input['name']) : '';
        if (mb_strlen($name, 'UTF-8') < 2 || mb_strlen($name, 'UTF-8') > 120) {
            throw new ApiException(422, 'validation_failed', 'Agent name must be between 2 and 120 characters.');
        }
        $projectIds = self::projectIds($input['project_ids'] ?? null);
        $capabilities = self::capabilities($input['capabilities'] ?? null);
        $expiresInDays = self::expiresInDays($input['expires_in_days'] ?? 90);

        $this->limitTokenCreation($actor, $remoteAddress);

        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) $this->pdo->beginTransaction();
        try {
            if (count($this->projects->eligibleProjectIdsForUpdate($actor->workspaceId, $projectIds)) !== count($projectIds)) {
                throw new ApiException(422, 'validation_failed', 'Every agent project must be active or paused in this workspace.');
            }
            $agentId = $this->agents->create(
                $actor->workspaceId,
                $actor->id,
                $name,
                $projectIds,
                $capabilities,
            );
            $token = $this->createAgentToken($actor, $agentId, $name, $expiresInDays);
            $agent = $this->agents->find($actor->workspaceId, $agentId);
            if ($ownsTransaction) $this->pdo->commit();
            return ['agent' => $agent, ...$token];
        } catch (Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        }
    }

    public function rotateToken(AuthenticatedUser $actor, int $agentId, array $input, string $remoteAddress): array
    {
        $this->requireManagement($actor);
        $expiresInDays = self::expiresInDays($input['expires_in_days'] ?? 90);
        $this->limitTokenCreation($actor, $remoteAddress);
        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) $this->pdo->beginTransaction();
        try {
            $agent = $this->agents->find($actor->workspaceId, $agentId, true);
            if ($agent === null || !$agent['is_active']) {
                throw new ApiException(404, 'not_found', 'The agent was not found.');
            }
            $this->agents->revokeActiveTokens($actor->workspaceId, $agentId);
            $token = $this->createAgentToken($actor, $agentId, $agent['name'], $expiresInDays);
            if ($ownsTransaction) $this->pdo->commit();
            return ['agent_id' => $agentId, ...$token];
        } catch (Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        }
    }

    public function revoke(AuthenticatedUser $actor, int $agentId): void
    {
        $this->requireManagement($actor);
        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) $this->pdo->beginTransaction();
        try {
            if ($this->agents->find($actor->workspaceId, $agentId, true) === null) {
                throw new ApiException(404, 'not_found', 'The agent was not found.');
            }
            $this->agents->setInactive($actor->workspaceId, $agentId);
            if ($ownsTransaction) $this->pdo->commit();
        } catch (Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        }
    }

    public function listProjects(AuthenticatedUser $agent): array
    {
        if (!$agent->isAgent()) throw new ApiException(403, 'forbidden', 'This endpoint requires an agent token.');
        if (!in_array('issues.read', $agent->agentCapabilities, true)) {
            throw new ApiException(403, 'forbidden', 'The agent does not have this capability.');
        }

        $projects = [];
        foreach ($this->projects->listForWorkspace($agent->workspaceId, $agent->id) as $project) {
            $projectId = (int) $project['id'];
            if (!in_array($projectId, $agent->agentProjectIds, true)
                || !in_array($project['status'], ['active', 'paused'], true)
                || !Permissions::can($agent, 'agent.issues.read', [
                    'project_id' => $projectId,
                    'is_member' => $project['is_member'],
                ])) {
                continue;
            }

            $projects[] = [
                'id' => $projectId,
                'name' => $project['name'],
                'status' => $project['status'],
            ];
        }

        return ['projects' => $projects];
    }

    public function listIssues(AuthenticatedUser $agent, int $projectId): array
    {
        $this->requireProjectAccess($agent, $projectId, 'issues.read');
        return ['issues' => $this->issues->listForAgent($agent->workspaceId, $projectId)];
    }

    public function issue(AuthenticatedUser $agent, int $issueId): array
    {
        $issue = $this->issues->findForAgent($agent->workspaceId, $issueId);
        if ($issue === null) throw new ApiException(404, 'not_found', 'The issue was not found.');
        $this->requireProjectAccess($agent, $issue['project_id'], 'issues.read');
        return ['issue' => $issue];
    }

    public function addComment(AuthenticatedUser $agent, int $issueId, array $input): array
    {
        $issue = $this->issues->findForAgent($agent->workspaceId, $issueId);
        if ($issue === null) throw new ApiException(404, 'not_found', 'The issue was not found.');
        $this->requireProjectAccess($agent, $issue['project_id'], 'issues.comment');
        $this->requireWritableProject($agent, $issue['project_id']);
        $body = is_string($input['body'] ?? null) ? trim($input['body']) : '';
        if ($body === '' || mb_strlen($body, 'UTF-8') > 10_000) {
            throw new ApiException(422, 'validation_failed', 'Discussion message must be between 1 and 10000 characters.');
        }

        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) $this->pdo->beginTransaction();
        try {
            if (!$this->discussion->lockIssue($agent->workspaceId, $issueId)) {
                throw new ApiException(404, 'not_found', 'The issue was not found.');
            }
            $message = $this->discussion->create(
                $agent->workspaceId,
                $issueId,
                $agent->id,
                null,
                $body,
                $agent->agentId,
            );
            $this->issues->bumpDiscussionRevision($agent->workspaceId, $issue['project_id']);
            if ($ownsTransaction) $this->pdo->commit();
            return ['message' => $message];
        } catch (Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        }
    }

    public function updateStatus(AuthenticatedUser $agent, int $issueId, array $input): array
    {
        $issue = $this->issues->find($agent->workspaceId, $issueId);
        if ($issue === null) throw new ApiException(404, 'not_found', 'The issue was not found.');
        $this->requireProjectAccess($agent, $issue['project_id'], 'issues.status.update');
        $this->requireWritableProject($agent, $issue['project_id']);
        $status = $input['status'] ?? null;
        if (!is_string($status) || !in_array($status, ['doing', 'testing'], true)) {
            throw new ApiException(422, 'validation_failed', 'Agents may set issue status to doing or testing.');
        }
        if (in_array($issue['status'], ['done', 'cancelled'], true)) {
            throw new ApiException(409, 'issue_closed', 'Agents cannot reopen a completed or cancelled issue.');
        }
        if ($issue['status'] === $status) {
            return ['issue' => $this->issues->findForAgent($agent->workspaceId, $issueId) ?? []];
        }

        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) $this->pdo->beginTransaction();
        try {
            $current = $this->issues->find($agent->workspaceId, $issueId, true);
            if ($current === null) throw new ApiException(404, 'not_found', 'The issue was not found.');
            if (in_array($current['status'], ['done', 'cancelled'], true)) {
                throw new ApiException(409, 'issue_closed', 'Agents cannot reopen a completed or cancelled issue.');
            }
            if ($current['status'] !== $status) {
                $this->issues->setAgentStatus($agent->workspaceId, $issueId, $status);
                $this->issues->recordStatusTransition(
                    $agent->workspaceId,
                    $issueId,
                    $agent->id,
                    $current['status'],
                    $status,
                    $agent->agentId,
                );
                $this->inboxEvents->recordStatus(
                    $agent->workspaceId,
                    $issue['project_id'],
                    $agent->id,
                    [$issue['created_by'], $issue['assignee_id']],
                    $issueId,
                    $issue['title'],
                    $status,
                );
            }
            $updated = $this->issues->findForAgent($agent->workspaceId, $issueId);
            if ($ownsTransaction) $this->pdo->commit();
            return ['issue' => $updated ?? []];
        } catch (Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        }
    }

    private function requireManagement(AuthenticatedUser $actor): void
    {
        if (!Permissions::can($actor, 'agents.manage')) {
            throw new ApiException(403, 'forbidden', 'Only workspace admins can manage agents.');
        }
    }

    private function requireProjectAccess(AuthenticatedUser $agent, int $projectId, string $capability): void
    {
        if (!$agent->isAgent()) throw new ApiException(403, 'forbidden', 'This endpoint requires an agent token.');
        $project = $this->projects->find($agent->workspaceId, $projectId);
        $isMember = $project !== null && $this->projects->isMember($agent->workspaceId, $projectId, $agent->id);
        if ($project === null || !in_array($projectId, $agent->agentProjectIds, true)
            || !in_array($project['status'], ['active', 'paused'], true)
            || !($agent->role === 'admin' || ($agent->role === 'developer' && $isMember))) {
            throw new ApiException(404, 'not_found', 'The project was not found.');
        }
        if (!Permissions::can($agent, 'agent.' . $capability, [
            'project_id' => $projectId,
            'is_member' => $isMember,
        ])) {
            throw new ApiException(403, 'forbidden', 'The agent does not have this capability.');
        }
    }

    private function requireWritableProject(AuthenticatedUser $agent, int $projectId): void
    {
        $project = $this->projects->find($agent->workspaceId, $projectId);
        if ($project === null) throw new ApiException(404, 'not_found', 'The project was not found.');
        ProjectLifecycle::requireWritable($project['status']);
    }

    private function createAgentToken(
        AuthenticatedUser $owner,
        int $agentId,
        string $name,
        int $expiresInDays,
    ): array {
        $token = bin2hex(random_bytes(32));
        $expiresAt = gmdate('Y-m-d H:i:s', time() + ($expiresInDays * 86_400));
        $this->tokens->create(
            $owner->workspaceId,
            $owner->id,
            hash('sha256', $token),
            'api',
            'Agent: ' . mb_substr($name, 0, 93, 'UTF-8'),
            null,
            $expiresAt,
            $agentId,
        );
        return ['token' => $token, 'expires_at' => $expiresAt];
    }

    private function limitTokenCreation(AuthenticatedUser $actor, string $remoteAddress): void
    {
        if (!$this->rateLimiter->allow(
            $actor->workspaceId,
            'agent-token:' . $actor->id . ':' . $remoteAddress,
            10,
            3600,
        )) {
            throw new ApiException(429, 'rate_limited', 'Too many agent token requests. Try again later.');
        }
    }

    private static function projectIds(mixed $value): array
    {
        if (!is_array($value) || $value === [] || count($value) > 100) {
            throw new ApiException(422, 'validation_failed', 'Choose between 1 and 100 agent projects.');
        }
        $ids = [];
        foreach ($value as $id) {
            if (!is_int($id) || $id < 1 || isset($ids[$id])) {
                throw new ApiException(422, 'validation_failed', 'project_ids must contain unique positive integers.');
            }
            $ids[$id] = $id;
        }
        return array_values($ids);
    }

    private static function capabilities(mixed $value): array
    {
        if (!is_array($value) || $value === [] || count($value) > count(self::CAPABILITIES)) {
            throw new ApiException(422, 'validation_failed', 'Choose one or more supported agent capabilities.');
        }
        $capabilities = [];
        foreach ($value as $capability) {
            if (!is_string($capability) || !in_array($capability, self::CAPABILITIES, true)
                || isset($capabilities[$capability])) {
                throw new ApiException(422, 'validation_failed', 'One or more agent capabilities are invalid.');
            }
            $capabilities[$capability] = $capability;
        }
        return array_values($capabilities);
    }

    private static function expiresInDays(mixed $value): int
    {
        if (!is_int($value) || $value < 1 || $value > 365) {
            throw new ApiException(422, 'validation_failed', 'expires_in_days must be between 1 and 365.');
        }
        return $value;
    }
}
