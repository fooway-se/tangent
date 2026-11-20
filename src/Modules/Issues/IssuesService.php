<?php

declare(strict_types=1);

namespace Tangent\Modules\Issues;

use Tangent\Core\ApiException;
use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Permissions;
use Tangent\Modules\Chat\ChatService;
use Tangent\Modules\Inbox\InboxEvents;
use Tangent\Modules\Projects\MilestoneRepository;
use Tangent\Modules\Projects\ProjectLifecycle;
use Tangent\Modules\Projects\ProjectRepository;
use PDO;
use Throwable;

final class IssuesService
{
    private const ISSUE_TYPES = ['task', 'bug', 'feature', 'research', 'maintenance'];
    private const ISSUE_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

    public function __construct(
        private readonly IssueRepository $issues,
        private readonly ProjectRepository $projects,
        private readonly ChatService $chat,
        private readonly InboxEvents $inboxEvents,
        private readonly PDO $pdo,
        private readonly MilestoneRepository $milestones,
        private readonly IssueDiscussionRepository $discussion,
    ) {
    }

    public function list(AuthenticatedUser $user, int $projectId): array
    {
        $this->requireProjectAccess($user, $projectId, 'issues.read');
        return $this->issues->listForProject($user->workspaceId, $projectId);
    }

    public function listDeleted(AuthenticatedUser $user, int $projectId): array
    {
        $this->requireProjectAccess($user, $projectId, 'issues.read');
        return $this->issues->listDeletedForProject($user->workspaceId, $projectId);
    }

    public function statusHistory(AuthenticatedUser $user, int $issueId): array
    {
        $issue = $this->issues->find($user->workspaceId, $issueId);
        if ($issue === null) {
            throw new ApiException(404, 'not_found', 'The issue was not found.');
        }
        $this->requireProjectAccess($user, $issue['project_id'], 'issues.read');
        return $this->issues->statusHistory($user->workspaceId, $issueId);
    }

    public function discussion(AuthenticatedUser $user, int $issueId): array
    {
        $issue = $this->issues->find($user->workspaceId, $issueId);
        if ($issue === null) throw new ApiException(404, 'not_found', 'The issue was not found.');
        $this->requireProjectAccess($user, $issue['project_id'], 'issues.read');
        return $this->discussion->listForIssue($user->workspaceId, $issueId);
    }

    public function addDiscussionMessage(AuthenticatedUser $user, int $issueId, array $input): array
    {
        $issue = $this->issues->find($user->workspaceId, $issueId);
        if ($issue === null) throw new ApiException(404, 'not_found', 'The issue was not found.');
        $this->requireProjectAccess($user, $issue['project_id'], 'issues.update');

        $body = self::discussionBody($input['body'] ?? null);
        $parentId = null;
        if (array_key_exists('parent_id', $input) && $input['parent_id'] !== null) {
            if (!is_int($input['parent_id']) || $input['parent_id'] < 1) {
                throw new ApiException(422, 'validation_failed', 'parent_id must be a positive integer or null.');
            }
            $parentId = $input['parent_id'];
        }

        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) $this->pdo->beginTransaction();
        try {
            if (!$this->discussion->lockIssue($user->workspaceId, $issueId)) {
                throw new ApiException(404, 'not_found', 'The issue was not found.');
            }
            if ($parentId !== null && $this->discussion->find($user->workspaceId, $issueId, $parentId) === null) {
                throw new ApiException(404, 'not_found', 'The discussion message was not found.');
            }
            $message = $this->discussion->create($user->workspaceId, $issueId, $user->id, $parentId, $body);
            if ($ownsTransaction) $this->pdo->commit();
            return $message;
        } catch (Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        }
    }

    public function editDiscussionMessage(
        AuthenticatedUser $user,
        int $issueId,
        int $messageId,
        array $input,
    ): array {
        $issue = $this->issues->find($user->workspaceId, $issueId);
        if ($issue === null) throw new ApiException(404, 'not_found', 'The issue was not found.');
        $this->requireProjectAccess($user, $issue['project_id'], 'issues.update');
        $body = self::discussionBody($input['body'] ?? null);

        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) $this->pdo->beginTransaction();
        try {
            if (!$this->discussion->lockIssue($user->workspaceId, $issueId)) {
                throw new ApiException(404, 'not_found', 'The issue was not found.');
            }
            $message = $this->discussion->find($user->workspaceId, $issueId, $messageId);
            if ($message === null) throw new ApiException(404, 'not_found', 'The discussion message was not found.');
            $this->requireDiscussionMessageAuthor($message, $user);
            $this->requireLastDiscussionMessage($user->workspaceId, $issueId, $messageId);

            $updated = $this->discussion->updateBody($user->workspaceId, $issueId, $messageId, $body);
            if ($ownsTransaction) $this->pdo->commit();
            return $updated;
        } catch (Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        }
    }

    public function deleteDiscussionMessage(AuthenticatedUser $user, int $issueId, int $messageId): void
    {
        $issue = $this->issues->find($user->workspaceId, $issueId);
        if ($issue === null) throw new ApiException(404, 'not_found', 'The issue was not found.');
        $this->requireProjectAccess($user, $issue['project_id'], 'issues.update');

        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) $this->pdo->beginTransaction();
        try {
            if (!$this->discussion->lockIssue($user->workspaceId, $issueId)) {
                throw new ApiException(404, 'not_found', 'The issue was not found.');
            }
            $message = $this->discussion->find($user->workspaceId, $issueId, $messageId);
            if ($message === null) throw new ApiException(404, 'not_found', 'The discussion message was not found.');
            $this->requireDiscussionMessageAuthor($message, $user);
            $this->requireLastDiscussionMessage($user->workspaceId, $issueId, $messageId);

            $this->discussion->delete($user->workspaceId, $issueId, $messageId);
            if ($ownsTransaction) $this->pdo->commit();
        } catch (Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        }
    }

    private static function discussionBody(mixed $value): string
    {
        $body = is_string($value) ? trim($value) : '';
        if ($body === '' || mb_strlen($body, 'UTF-8') > 10_000) {
            throw new ApiException(422, 'validation_failed', 'Discussion message must be between 1 and 10000 characters.');
        }
        return $body;
    }

    private function requireDiscussionMessageAuthor(array $message, AuthenticatedUser $user): void
    {
        if ($message['author_id'] !== $user->id) {
            throw new ApiException(403, 'forbidden', 'Only the message author can edit or delete it.');
        }
    }

    private function requireLastDiscussionMessage(int $workspaceId, int $issueId, int $messageId): void
    {
        if ($this->discussion->hasRepliesOrLaterMessages($workspaceId, $issueId, $messageId)) {
            throw new ApiException(409, 'discussion_message_not_last', 'Only the last discussion message without replies can be changed.');
        }
    }

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
        $priority = self::issuePriority($input['priority'] ?? 'medium');
        $dueDate = self::issueDueDate($input['due_date'] ?? null);
        $context = self::issueBriefText($input, 'context');
        $expectedOutcome = self::issueBriefText($input, 'expected_outcome');
        $acceptanceCriteria = self::issueBriefText($input, 'acceptance_criteria');
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

        $sourceChannelId = null;
        $sourceMessageId = null;
        if (array_key_exists('source_message_id', $input) && $input['source_message_id'] !== null) {
            if (!is_int($input['source_message_id']) || $input['source_message_id'] < 1) {
                throw new ApiException(422, 'validation_failed', 'source_message_id must be a positive integer or null.');
            }
            $sourceContext = $this->chat->issueContext($user, $input['source_message_id']);
            if ($sourceContext['project_id'] !== $projectId) {
                throw new ApiException(422, 'validation_failed', 'The source message must belong to the issue project.');
            }
            $sourceChannelId = $sourceContext['channel_id'];
            $sourceMessageId = $sourceContext['root_message_id'];
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
                $sourceChannelId,
                $sourceMessageId,
                $type,
                $assigneeId,
                $milestoneId,
                $isShared,
                $approvalRequested,
                $priority,
                $dueDate,
                $context,
                $expectedOutcome,
                $acceptanceCriteria,
            );
            $this->inboxEvents->recordAssigned($user->workspaceId, $projectId, $user->id, $assigneeId, (int) $issue['id'], $title);
            if ($ownsTransaction) $this->pdo->commit();
            return $issue;
        } catch (Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        }
    }

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

    public function update(AuthenticatedUser $user, int $issueId, array $input): array
    {
        $issue = $this->issues->find($user->workspaceId, $issueId);
        if ($issue === null) {
            throw new ApiException(404, 'not_found', 'The issue was not found.');
        }
        $shareFields = ['is_shared', 'milestone_id', 'approval_requested'];
        $issueFields = [
            'title', 'description', 'status', 'type', 'assignee_id', 'priority', 'due_date',
            'context', 'expected_outcome', 'acceptance_criteria',
        ];
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
            'context' => $issue['context'],
            'expected_outcome' => $issue['expected_outcome'],
            'acceptance_criteria' => $issue['acceptance_criteria'],
            'type' => $issue['type'],
            'assignee_id' => $issue['assignee_id'],
            'status' => $issue['status'],
            'priority' => $issue['priority'],
            'due_date' => $issue['due_date'],
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
        foreach (['context', 'expected_outcome', 'acceptance_criteria'] as $field) {
            $updated[$field] = self::issueBriefText($input, $field, $updated[$field]);
        }
        if (array_key_exists('type', $input)) {
            $updated['type'] = self::issueType($input['type']);
        }
        if (array_key_exists('assignee_id', $input)) {
            $updated['assignee_id'] = self::assigneeId($input['assignee_id']);
            $this->requireProjectMemberAssignee($user->workspaceId, $issue['project_id'], $updated['assignee_id']);
        }
        if (array_key_exists('priority', $input)) {
            $updated['priority'] = self::issuePriority($input['priority']);
        }
        if (array_key_exists('due_date', $input)) {
            $updated['due_date'] = self::issueDueDate($input['due_date']);
        }
        if (array_key_exists('status', $input)) {
            if (!is_string($input['status']) || !in_array($input['status'], ['backlog', 'todo', 'doing', 'testing', 'done', 'cancelled'], true)) {
                throw new ApiException(422, 'validation_failed', 'Issue status must be backlog, todo, doing, testing, done, or cancelled.');
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

    public function moveUnassignedToMilestone(AuthenticatedUser $user, int $projectId, array $input): int
    {
        $this->requireProjectAccess($user, $projectId, 'issues.share');
        $issueIds = $input['issue_ids'] ?? null;
        if (!is_array($issueIds) || $issueIds === [] || count($issueIds) > 500) {
            throw new ApiException(422, 'validation_failed', 'Select between 1 and 500 issues to move.');
        }
        $seen = [];
        foreach ($issueIds as $issueId) {
            if (!is_int($issueId) || $issueId < 1) {
                throw new ApiException(422, 'validation_failed', 'issue_ids must contain positive integers.');
            }
            if (isset($seen[$issueId])) {
                throw new ApiException(422, 'validation_failed', 'issue_ids cannot contain duplicates.');
            }
            $seen[$issueId] = true;
        }

        $milestoneId = $input['milestone_id'] ?? null;
        if (!is_int($milestoneId) || $milestoneId < 1) {
            throw new ApiException(422, 'validation_failed', 'milestone_id must be a positive integer.');
        }
        $milestone = $this->milestones->find($user->workspaceId, $projectId, $milestoneId);
        if ($milestone === null) throw new ApiException(404, 'not_found', 'The milestone was not found.');
        if ($milestone['archived_at'] !== null) {
            throw new ApiException(422, 'validation_failed', 'Issues can only be moved to an active milestone.');
        }

        foreach ($issueIds as $issueId) {
            $issue = $this->issues->find($user->workspaceId, $issueId);
            if ($issue === null || $issue['project_id'] !== $projectId) {
                throw new ApiException(404, 'not_found', 'One or more issues were not found in this project.');
            }
            if ($issue['milestone_id'] !== null) {
                throw new ApiException(409, 'issue_already_planned', 'One or more selected issues already belong to a milestone. Refresh and try again.');
            }
        }

        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) $this->pdo->beginTransaction();
        try {
            $sortOrder = $this->issues->maxSortOrder($user->workspaceId, $projectId, $milestoneId) + 1;
            foreach ($issueIds as $issueId) {
                if (!$this->issues->moveUnassignedToMilestone(
                    $user->workspaceId,
                    $projectId,
                    $issueId,
                    $milestoneId,
                    $sortOrder,
                )) {
                    throw new ApiException(409, 'issue_already_planned', 'One or more selected issues changed. Refresh and try again.');
                }
                $sortOrder += 1;
            }
            if ($ownsTransaction) $this->pdo->commit();
            return count($issueIds);
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
        $project = $this->projects->find($user->workspaceId, $issue['project_id']);
        if ($project === null) throw new ApiException(404, 'not_found', 'The project was not found.');
        ProjectLifecycle::requireWritable($project['status']);
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
        if (!in_array($issue['status'], ['backlog', 'todo', 'doing', 'testing'], true)) {
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
        $this->requireProjectAccess($user, $projectId, 'issues.update', false);
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

    private static function issuePriority(mixed $value): string
    {
        if (!is_string($value) || !in_array($value, self::ISSUE_PRIORITIES, true)) {
            throw new ApiException(422, 'validation_failed', 'Issue priority must be low, medium, high, or urgent.');
        }
        return $value;
    }

    private static function issueDueDate(mixed $value): ?string
    {
        if ($value === null) return null;
        if (!is_string($value) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D', $value, $matches)
            || (int) $matches[1] < 1000
            || !checkdate((int) $matches[2], (int) $matches[3], (int) $matches[1])) {
            throw new ApiException(422, 'validation_failed', 'Issue due date must be a valid YYYY-MM-DD date or null.');
        }
        return $value;
    }

    private static function issueBriefText(array $input, string $field, string $current = ''): string
    {
        if (!array_key_exists($field, $input)) return $current;
        if (!is_string($input[$field])) {
            throw new ApiException(422, 'validation_failed', "Issue {$field} must be text.");
        }
        $value = trim($input[$field]);
        if (mb_strlen($value, 'UTF-8') > 10_000) {
            throw new ApiException(422, 'validation_failed', "Issue {$field} cannot exceed 10000 characters.");
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

    private function requireProjectAccess(
        AuthenticatedUser $user,
        int $projectId,
        string $action,
        bool $requireWritable = true,
    ): void
    {
        $project = $this->projects->find($user->workspaceId, $projectId);
        $isMember = $project !== null && $this->projects->isMember($user->workspaceId, $projectId, $user->id);
        if ($project === null || !Permissions::can($user, $action, ['is_member' => $isMember])) {
            throw new ApiException(404, 'not_found', 'The project was not found.');
        }
        if ($requireWritable && in_array($action, ['issues.create', 'issues.update', 'issues.share'], true)) {
            ProjectLifecycle::requireWritable($project['status']);
        }
    }
}
