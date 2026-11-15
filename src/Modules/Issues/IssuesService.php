<?php

declare(strict_types=1);

namespace Tangent\Modules\Issues;

use Tangent\Core\ApiException;
use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Permissions;
use Tangent\Modules\Projects\ProjectRepository;

final class IssuesService
{
    public function __construct(
        private readonly IssueRepository $issues,
        private readonly ProjectRepository $projects,
    ) {
    }

    /** @return list<array<string, mixed>> */
    public function list(AuthenticatedUser $user, int $projectId): array
    {
        $this->requireProjectAccess($user, $projectId, 'issues.read');
        return $this->issues->listForProject($user->workspaceId, $projectId);
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

        return $this->issues->create($user->workspaceId, $projectId, $title, $description, $user->id);
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
        if (array_key_exists('status', $input)) {
            if (!is_string($input['status']) || !in_array($input['status'], ['backlog', 'todo', 'doing', 'done'], true)) {
                throw new ApiException(422, 'validation_failed', 'Issue status must be backlog, todo, doing, or done.');
            }
            $updated['status'] = $input['status'];
        }
        if (!array_intersect(['title', 'description', 'status'], array_keys($input))) {
            throw new ApiException(422, 'validation_failed', 'At least one issue field must be supplied.');
        }

        $this->issues->update($user->workspaceId, $issueId, $updated);
        return $this->issues->find($user->workspaceId, $issueId) ?? [];
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
