<?php

declare(strict_types=1);

namespace Tangent\Modules\Issues;

use Tangent\Core\ApiException;
use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Permissions;
use Tangent\Modules\Chat\ChatService;
use Tangent\Modules\Projects\ProjectRepository;

final class IssuesService
{
    private const ISSUE_TYPES = ['task', 'bug', 'feature', 'research', 'maintenance'];

    public function __construct(
        private readonly IssueRepository $issues,
        private readonly ProjectRepository $projects,
        private readonly ChatService $chat,
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

        return $this->issues->create(
            $user->workspaceId,
            $projectId,
            $title,
            $description,
            $user->id,
            null,
            null,
            $type,
            $assigneeId,
        );
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
        $this->requireProjectAccess($user, $issue['project_id'], 'issues.update');

        $updated = [
            'title' => $issue['title'],
            'description' => $issue['description'],
            'type' => $issue['type'],
            'assignee_id' => $issue['assignee_id'],
            'status' => $issue['status'],
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
        if (!array_intersect(['title', 'description', 'status', 'type', 'assignee_id'], array_keys($input))) {
            throw new ApiException(422, 'validation_failed', 'At least one issue field must be supplied.');
        }

        $this->issues->update($user->workspaceId, $issueId, $updated);
        return $this->issues->find($user->workspaceId, $issueId) ?? [];
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
