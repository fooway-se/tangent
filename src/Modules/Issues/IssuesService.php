<?php

declare(strict_types=1);

namespace Tangent\Modules\Issues;

use Tangent\Core\ApiException;
use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Permissions;
use Tangent\Modules\Chat\ChatService;
use Tangent\Modules\Inbox\InboxEvents;
use Tangent\Modules\Projects\MilestoneRepository;
use Tangent\Modules\Projects\ProjectRepository;
use PDO;
use Throwable;

final class IssuesService
{
    private const ISSUE_TYPES = ['task', 'bug', 'feature', 'research', 'maintenance'];

    public function __construct(
        private readonly IssueRepository $issues,
        private readonly ProjectRepository $projects,
        private readonly ChatService $chat,
        private readonly InboxEvents $inboxEvents,
        private readonly PDO $pdo,
        private readonly MilestoneRepository $milestones,
    ) {
    }

    /** @return list<array<string, mixed>> */
    public function list(AuthenticatedUser $user, int $projectId): array
    {
        $this->requireProjectAccess($user, $projectId, 'issues.read');
        return $this->issues->listForProject($user->workspaceId, $projectId);
    }

    /** @return list<array<string, mixed>> */
    public function listDeleted(AuthenticatedUser $user, int $projectId): array
    {
        $this->requireProjectAccess($user, $projectId, 'issues.read');
        return $this->issues->listDeletedForProject($user->workspaceId, $projectId);
    }

    /** @param array<string, mixed> $input @return array<string, mixed> */
    public function create(AuthenticatedUser $user, int $projectId, array $input): array
    {
        $this->requireProjectAccess($user, $projectId, 'issues.create');
        $shareFields = ['is_shared', 'milestone_id', 'approval_requested'];
        if (array_intersect($shareFields, array_keys($input)) !== []) {
            $this->requireProjectAccess($user, $projectId, 'issues.share');
        }
        $title = is_string($input['title'] ?? null) ? trim($input['title']) : '';
        $description = is_string($input['description'] ?? null) ? trim($input['description']) : '';
        if (mb_strlen($title, 'UTF-8') < 1 || mb_strlen($title, 'UTF-8') > 200) {
            throw new ApiException(422, 'validation_failed', 'Issue title must be between 1 and 200 characters.');
        }
        if (mb_strlen($description, 'UTF-8') > 10_000) {
            throw new ApiException(422, 'validation_failed', 'Issue description cannot exceed 10000 characters.');
        }
        $type = self::issueType($input['type'] ?? 'task');
        $assigneeId = self::assigneeId($input['assignee_id'] ?? null);
        $this->requireProjectMemberAssignee($user->workspaceId, $projectId, $assigneeId);
        $milestoneId = $input['milestone_id'] ?? null;
        if ($milestoneId !== null && (!is_int($milestoneId) || $milestoneId < 1)) {
            throw new ApiException(422, 'validation_failed', 'milestone_id must be a positive integer or null.');
        }
        if ($milestoneId !== null && $this->milestones->find($user->workspaceId, $projectId, $milestoneId) === null) {
            throw new ApiException(422, 'validation_failed', 'Milestones must belong to the issue project.');
        }
        $isShared = $input['is_shared'] ?? false;
        if (!is_bool($isShared)) throw new ApiException(422, 'validation_failed', 'is_shared must be a boolean.');
        $approvalRequested = $input['approval_requested'] ?? false;
        if (!is_bool($approvalRequested)) {
            throw new ApiException(422, 'validation_failed', 'approval_requested must be a boolean.');
        }
        if ($approvalRequested && !$isShared) {
            throw new ApiException(422, 'validation_failed', 'Guest approval can only be requested for a shared issue.');
        }

        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) $this->pdo->beginTransaction();
        try {
            $issue = $this->issues->create(
                $user->workspaceId,
                $projectId,
                $title,
                $description,
                $user->id,
                null,
                null,
                $type,
                $assigneeId,
                $milestoneId,
                $isShared,
                $approvalRequested,
            );
            $this->inboxEvents->recordAssigned($user->workspaceId, $projectId, $user->id, $assigneeId, (int) $issue['id'], $title);
            if ($ownsTransaction) $this->pdo->commit();
            return $issue;
        } catch (Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        }
    }

    /** @return array<string, mixed> */
    public function createFromMessage(AuthenticatedUser $user, int $messageId): array
    {
        $context = $this->chat->issueContext($user, $messageId);
        $this->requireProjectAccess($user, $context['project_id'], 'issues.create');
        $title = mb_substr(trim($context['title']), 0, 200, 'UTF-8');
        if ($title === '') {
            throw new ApiException(422, 'validation_failed', 'The source message cannot create an empty issue title.');
        }

        return $this->issues->create(
            $user->workspaceId,
            $context['project_id'],
            $title,
            '',
            $user->id,
            $context['channel_id'],
            $context['root_message_id'],
        );
    }

    /** @param array<string, mixed> $input @return array<string, mixed> */
    public function update(AuthenticatedUser $user, int $issueId, array $input): array
    {
        $issue = $this->issues->find($user->workspaceId, $issueId);
        if ($issue === null) {
            throw new ApiException(404, 'not_found', 'The issue was not found.');
        }
        $shareFields = ['is_shared', 'milestone_id', 'approval_requested'];
        $issueFields = ['title', 'description', 'status', 'type', 'assignee_id'];
        $hasShareFields = array_intersect($shareFields, array_keys($input)) !== [];
        $hasIssueFields = array_intersect($issueFields, array_keys($input)) !== [];
        if (!$hasShareFields && !$hasIssueFields) {
            throw new ApiException(422, 'validation_failed', 'At least one issue field must be supplied.');
        }
        if ($hasIssueFields) $this->requireProjectAccess($user, $issue['project_id'], 'issues.update');
        if ($hasShareFields) $this->requireProjectAccess($user, $issue['project_id'], 'issues.share');

        $updated = [
            'title' => $issue['title'],
            'description' => $issue['description'],
            'type' => $issue['type'],
            'assignee_id' => $issue['assignee_id'],
            'status' => $issue['status'],
            'is_shared' => $issue['is_shared'],
            'milestone_id' => $issue['milestone_id'],
            'sort_order' => $issue['sort_order'],
            'approval_requested_at' => $issue['approval_requested_at'],
            'approved_by' => $issue['approved_by'],
            'approved_at' => $issue['approved_at'],
        ];
        if (array_key_exists('title', $input)) {
            if (!is_string($input['title'])) {
                throw new ApiException(422, 'validation_failed', 'Issue title must be text.');
            }
            $updated['title'] = trim($input['title']);
        }
        if (mb_strlen($updated['title'], 'UTF-8') < 1 || mb_strlen($updated['title'], 'UTF-8') > 200) {
            throw new ApiException(422, 'validation_failed', 'Issue title must be between 1 and 200 characters.');
        }
        if (array_key_exists('description', $input)) {
            if (!is_string($input['description'])) {
                throw new ApiException(422, 'validation_failed', 'Issue description must be text.');
            }
            $updated['description'] = trim($input['description']);
        }
        if (mb_strlen($updated['description'], 'UTF-8') > 10_000) {
            throw new ApiException(422, 'validation_failed', 'Issue description cannot exceed 10000 characters.');
        }
        if (array_key_exists('type', $input)) {
            $updated['type'] = self::issueType($input['type']);
        }
        if (array_key_exists('assignee_id', $input)) {
            $updated['assignee_id'] = self::assigneeId($input['assignee_id']);
            $this->requireProjectMemberAssignee($user->workspaceId, $issue['project_id'], $updated['assignee_id']);
        }
        if (array_key_exists('status', $input)) {
            if (!is_string($input['status']) || !in_array($input['status'], ['backlog', 'todo', 'doing', 'done', 'cancelled'], true)) {
                throw new ApiException(422, 'validation_failed', 'Issue status must be backlog, todo, doing, done, or cancelled.');
            }
            $updated['status'] = $input['status'];
        }
        if (array_key_exists('is_shared', $input)) {
            if (!is_bool($input['is_shared'])) throw new ApiException(422, 'validation_failed', 'is_shared must be a boolean.');
            $updated['is_shared'] = $input['is_shared'];
        }
        if (array_key_exists('milestone_id', $input)) {
            if ($input['milestone_id'] !== null && (!is_int($input['milestone_id']) || $input['milestone_id'] < 1)) {
                throw new ApiException(422, 'validation_failed', 'milestone_id must be a positive integer or null.');
            }
            $updated['milestone_id'] = $input['milestone_id'];
            if ($updated['milestone_id'] !== null
                && $this->milestones->find($user->workspaceId, $issue['project_id'], $updated['milestone_id']) === null) {
                throw new ApiException(422, 'validation_failed', 'Milestones must belong to the issue project.');
            }
            if ($updated['milestone_id'] !== $issue['milestone_id']) {
                $updated['sort_order'] = $this->issues->maxSortOrder(
                    $user->workspaceId,
                    $issue['project_id'],
                    $updated['milestone_id'],
                ) + 1;
            }
        }
        if (array_key_exists('approval_requested', $input)) {
            if (!is_bool($input['approval_requested'])) throw new ApiException(422, 'validation_failed', 'approval_requested must be a boolean.');
            if ($input['approval_requested']) {
                if ($issue['approval_requested_at'] === null) $updated['approval_requested_at'] = gmdate('Y-m-d H:i:s');
            } else {
                $updated['approval_requested_at'] = null;
                $updated['approved_by'] = null;
                $updated['approved_at'] = null;
            }
        }

        $assigneeChanged = $updated['assignee_id'] !== $issue['assignee_id'];
        $statusChanged = $updated['status'] !== $issue['status'];
        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) $this->pdo->beginTransaction();
        try {
            $this->issues->update($user->workspaceId, $issueId, $updated);
            if ($statusChanged) {
                $this->issues->recordStatusTransition($user->workspaceId, $issueId, $user->id, $issue['status'], $updated['status']);
            }
            if ($assigneeChanged) {
                $this->inboxEvents->recordAssigned($user->workspaceId, $issue['project_id'], $user->id, $updated['assignee_id'], $issueId, $updated['title']);
            }
            if ($statusChanged) {
                $this->inboxEvents->recordStatus(
                    $user->workspaceId,
                    $issue['project_id'],
                    $user->id,
                    [$updated['assignee_id'], $issue['created_by']],
                    $issueId,
                    $updated['title'],
                    $updated['status'],
                );
            }
            if ($ownsTransaction) $this->pdo->commit();
            return $this->issues->find($user->workspaceId, $issueId) ?? [];
        } catch (Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        }
    }

    public function approve(AuthenticatedUser $user, int $issueId): void
    {
        $issue = $this->issues->approvalIssue($user->workspaceId, $issueId);
        if ($issue === null) throw new ApiException(404, 'not_found', 'The approval was not found.');
        $isMember = $this->projects->isMember($user->workspaceId, $issue['project_id'], $user->id);
        if (!$isMember) throw new ApiException(404, 'not_found', 'The approval was not found.');
        if (!Permissions::can($user, 'approvals.approve', ['is_member' => $isMember])) {
            throw new ApiException(403, 'forbidden', 'You cannot approve this issue.');
        }
        if (!$issue['is_shared'] || $issue['approval_requested_at'] === null || $issue['status'] === 'cancelled') {
            throw new ApiException(404, 'not_found', 'The approval was not found.');
        }
        if ($issue['approved_at'] !== null) throw new ApiException(409, 'already_approved', 'This issue has already been approved.');

        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) $this->pdo->beginTransaction();
        try {
            if (!$this->issues->approve($user->workspaceId, $issueId, $user->id)) {
                $current = $this->issues->approvalIssue($user->workspaceId, $issueId);
                if ($current !== null && $current['is_shared'] && $current['approval_requested_at'] !== null
                    && $current['status'] !== 'cancelled' && $current['approved_at'] !== null) {
                    throw new ApiException(409, 'already_approved', 'This issue has already been approved.');
                }
                throw new ApiException(404, 'not_found', 'The approval was not found.');
            }
            $this->inboxEvents->recordApproval(
                $user->workspaceId,
                $issue['project_id'],
                $user->id,
                $issue['created_by'],
                $issueId,
                $issue['title'],
            );
            if ($ownsTransaction) $this->pdo->commit();
        } catch (Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        }
    }

    /** @param array<string, mixed> $input @return array<string, mixed> */
    public function move(AuthenticatedUser $user, int $issueId, array $input): array
    {
        $issue = $this->issues->find($user->workspaceId, $issueId);
        if ($issue === null) throw new ApiException(404, 'not_found', 'The issue was not found.');
        $this->requireProjectAccess($user, $issue['project_id'], 'issues.update');

        $direction = $input['direction'] ?? null;
        if (array_diff(array_keys($input), ['direction']) !== [] || !is_string($direction)
            || !in_array($direction, ['up', 'down'], true)) {
            throw new ApiException(422, 'validation_failed', 'direction must be up or down.');
        }
        if (!in_array($issue['status'], ['backlog', 'todo', 'doing'], true)) {
            throw new ApiException(422, 'validation_failed', 'Only open issues can be reordered.');
        }

        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) $this->pdo->beginTransaction();
        try {
            $this->issues->moveWithinMilestone(
                $user->workspaceId,
                $issue['project_id'],
                $issue['milestone_id'],
                $issueId,
                $direction,
            );
            if ($ownsTransaction) $this->pdo->commit();
            return $this->issues->find($user->workspaceId, $issueId) ?? [];
        } catch (Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        }
    }

    public function delete(AuthenticatedUser $user, int $issueId): void
    {
        $issue = $this->issues->find($user->workspaceId, $issueId);
        if ($issue === null) {
            throw new ApiException(404, 'not_found', 'The issue was not found.');
        }
        $this->requireProjectAccess($user, $issue['project_id'], 'issues.update');
        $this->issues->softDelete($user->workspaceId, $issueId);
    }

    /** @return array<string, mixed> */
    public function restore(AuthenticatedUser $user, int $issueId): array
    {
        $issue = $this->issues->findDeleted($user->workspaceId, $issueId);
        if ($issue === null) {
            throw new ApiException(404, 'not_found', 'The deleted issue was not found.');
        }
        $this->requireProjectAccess($user, $issue['project_id'], 'issues.update');
        $this->issues->restore($user->workspaceId, $issueId);
        return $this->issues->find($user->workspaceId, $issueId) ?? [];
    }

    public function unassignRemovedMember(AuthenticatedUser $user, int $projectId, int $userId): void
    {
        if (!Permissions::can($user, 'projects.manage_members')) {
            throw new ApiException(403, 'forbidden', 'You cannot manage project members.');
        }
        $this->requireProjectAccess($user, $projectId, 'issues.update');
        $this->issues->unassignMember($user->workspaceId, $projectId, $userId);
    }

    private function requireProjectMemberAssignee(int $workspaceId, int $projectId, ?int $assigneeId): void
    {
        if ($assigneeId !== null && !$this->projects->isMember($workspaceId, $projectId, $assigneeId)) {
            throw new ApiException(422, 'validation_failed', 'Issue assignees must be members of the project.');
        }
    }

    private static function issueType(mixed $value): string
    {
        if (!is_string($value) || !in_array($value, self::ISSUE_TYPES, true)) {
            throw new ApiException(422, 'validation_failed', 'Issue type must be task, bug, feature, research, or maintenance.');
        }
        return $value;
    }

    private static function assigneeId(mixed $value): ?int
    {
        if ($value === null) return null;
        if (!is_int($value) || $value < 1) {
            throw new ApiException(422, 'validation_failed', 'Issue assignee must be a project member or null.');
        }
        return $value;
    }

    private function requireProjectAccess(AuthenticatedUser $user, int $projectId, string $action): void
    {
        $project = $this->projects->find($user->workspaceId, $projectId);
        $isMember = $project !== null && $this->projects->isMember($user->workspaceId, $projectId, $user->id);
        if ($project === null || !Permissions::can($user, $action, ['is_member' => $isMember])) {
            throw new ApiException(404, 'not_found', 'The project was not found.');
        }
    }
}
