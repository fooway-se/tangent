<?php

declare(strict_types=1);

namespace Tangent\Modules\Projects;

use PDO;
use Throwable;
use Tangent\Core\ApiException;
use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Permissions;
use Tangent\Modules\Auth\UserRepository;
use Tangent\Modules\Chat\ChatService;
use Tangent\Modules\Issues\IssuesService;
use Tangent\Modules\GitHub\GitHubService;
use Tangent\Modules\Workspaces\WorkspaceRepository;

final class ProjectService
{
    public function __construct(
        private readonly ProjectRepository $projects,
        private readonly UserRepository $users,
        private readonly PDO $pdo,
        private readonly ChatService $chat,
        private readonly IssuesService $issues,
        private readonly WorkspaceRepository $workspaces,
        private readonly GitHubService $github,
    ) {
    }

    public function list(AuthenticatedUser $user): array
    {
        $projects = $this->projects->listForWorkspace($user->workspaceId, $user->id);
        if ($user->role === 'guest') {
            $visibleProjects = [];
            foreach ($projects as $project) {
                $isMember = $project['is_member'];
                unset($project['is_member']);
                if (Permissions::can($user, 'client_view.read', ['is_member' => $isMember])) {
                    $visibleProjects[] = ['id' => $project['id'], 'name' => $project['name'], 'slug' => $project['slug']];
                }
            }
            return $visibleProjects;
        }

        $visibleProjects = [];
        foreach ($projects as $project) {
            $isMember = $project['is_member'];
            unset($project['is_member']);
            if (Permissions::can($user, 'projects.view', ['is_member' => $isMember])) {
                $visibleProjects[] = $project;
            }
        }
        return $visibleProjects;
    }

    public function get(AuthenticatedUser $user, int $projectId): array
    {
        $project = $this->findVisible($user, $projectId);
        if ($user->role === 'guest') $project['github_repository'] = null;
        return [
            'project' => $project,
            'members' => $this->projects->members($user->workspaceId, $projectId),
        ];
    }

    public function notes(AuthenticatedUser $user, int $projectId): array
    {
        $this->findVisible($user, $projectId);
        return $this->projects->notes($user->workspaceId, $projectId);
    }

    public function saveNotes(AuthenticatedUser $user, int $projectId, array $body): array
    {
        $project = $this->findVisible($user, $projectId);
        ProjectLifecycle::requireWritable($project['status']);
        if (!is_string($body['notes'] ?? null)) {
            throw new ApiException(422, 'validation_failed', 'Project notes must be text.');
        }
        if (mb_strlen($body['notes'], 'UTF-8') > 50_000) {
            throw new ApiException(422, 'validation_failed', 'Project notes cannot exceed 50000 characters.');
        }

        return $this->projects->saveNotes($user->workspaceId, $projectId, $user->id, $body['notes']);
    }

    public function create(AuthenticatedUser $user, array $body): array
    {
        if (!Permissions::can($user, 'projects.create')) {
            throw new ApiException(403, 'forbidden', 'You cannot create projects.');
        }

        $name = is_string($body['name'] ?? null) ? trim($body['name']) : '';
        $description = is_string($body['description'] ?? null) ? trim($body['description']) : '';
        if (mb_strlen($name, 'UTF-8') < 2 || mb_strlen($name, 'UTF-8') > 120) {
            throw new ApiException(422, 'validation_failed', 'Project name must be between 2 and 120 characters.');
        }
        if (mb_strlen($description, 'UTF-8') > 5000) {
            throw new ApiException(422, 'validation_failed', 'Project description cannot exceed 5000 characters.');
        }

        $githubRepository = null;
        if (array_key_exists('github_repository_id', $body) && $body['github_repository_id'] !== null) {
            if (!is_int($body['github_repository_id']) || $body['github_repository_id'] < 1) {
                throw new ApiException(422, 'validation_failed', 'GitHub repository ID must be a positive integer or null.');
            }
            $githubRepository = $this->github->repositoryForWorkspace($user->workspaceId, $body['github_repository_id']);
        }

        $slug = self::slug($name);
        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) {
            $this->pdo->beginTransaction();
        }

        try {
            $project = $this->projects->create($user->workspaceId, $name, $slug, $description, $user->id, $githubRepository);
            $this->chat->createProjectChannel($user->workspaceId, (int) $project['id']);
            if ($ownsTransaction) {
                $this->pdo->commit();
            }
            return $project;
        } catch (Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $exception;
        }
    }

    public function update(AuthenticatedUser $user, int $projectId, array $body): array
    {
        if ($this->projects->find($user->workspaceId, $projectId) === null) {
            throw new ApiException(404, 'not_found', 'The project was not found.');
        }
        if (!Permissions::can($user, 'projects.update')) {
            throw new ApiException(403, 'forbidden', 'You cannot update projects.');
        }

        $requestedGitHubRepository = null;
        if (array_key_exists('github_repository_id', $body)) {
            if ($body['github_repository_id'] !== null
                && (!is_int($body['github_repository_id']) || $body['github_repository_id'] < 1)) {
                throw new ApiException(422, 'validation_failed', 'GitHub repository ID must be a positive integer or null.');
            }
            if ($body['github_repository_id'] !== null) {
                $requestedGitHubRepository = $this->github->repositoryForWorkspace(
                    $user->workspaceId,
                    $body['github_repository_id'],
                );
            }
        }

        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) $this->pdo->beginTransaction();
        try {
            $project = $this->projects->find($user->workspaceId, $projectId, true);
            if ($project === null) {
                throw new ApiException(404, 'not_found', 'The project was not found.');
            }

            $updated = [
                'name' => $project['name'],
                'description' => $project['description'],
                'status' => $project['status'],
                'archived_from_status' => $project['archived_from_status'],
                'github_repository' => $project['github_repository'],
            ];
            if (array_key_exists('name', $body)) {
                if (!is_string($body['name'])) {
                    throw new ApiException(422, 'validation_failed', 'Project name must be text.');
                }
                $updated['name'] = trim($body['name']);
            }
            if (mb_strlen($updated['name'], 'UTF-8') < 2 || mb_strlen($updated['name'], 'UTF-8') > 120) {
                throw new ApiException(422, 'validation_failed', 'Project name must be between 2 and 120 characters.');
            }
            if (array_key_exists('description', $body)) {
                if (!is_string($body['description'])) {
                    throw new ApiException(422, 'validation_failed', 'Project description must be text.');
                }
                $updated['description'] = trim($body['description']);
            }
            if (mb_strlen($updated['description'], 'UTF-8') > 5000) {
                throw new ApiException(422, 'validation_failed', 'Project description cannot exceed 5000 characters.');
            }
            if (array_key_exists('github_repository_id', $body)) {
                $updated['github_repository'] = $requestedGitHubRepository;
            }
            if (array_key_exists('status', $body)) {
                if (!is_string($body['status']) || !in_array($body['status'], ProjectLifecycle::STATUSES, true)) {
                    throw new ApiException(422, 'validation_failed', 'Project status must be active, paused, completed, or archived.');
                }
                $updated['status'] = $body['status'];
            }
            if (!array_intersect(['name', 'description', 'status', 'github_repository_id'], array_keys($body))) {
                throw new ApiException(422, 'validation_failed', 'At least one project field must be supplied.');
            }

            $metadataChanged = $updated['name'] !== $project['name']
                || $updated['description'] !== $project['description']
                || $updated['github_repository'] !== $project['github_repository'];
            $staysReadOnly = ($project['status'] === 'completed'
                    && !in_array($updated['status'], ['active', 'paused'], true))
                || ($project['status'] === 'archived' && $updated['status'] === 'archived');
            if ($staysReadOnly && $metadataChanged) {
                ProjectLifecycle::requireWritable($project['status']);
            }
            if ($updated['status'] === 'archived' && $project['status'] !== 'archived') {
                $updated['archived_from_status'] = $project['status'];
            } elseif ($project['status'] === 'archived' && $updated['status'] !== 'archived') {
                $updated['archived_from_status'] = null;
            }

            if ($requestedGitHubRepository !== null) {
                $this->github->revalidateRepositoryConnection($user->workspaceId, $requestedGitHubRepository);
            }
            if (!$this->projects->update($user->workspaceId, $projectId, $updated)) {
                throw new ApiException(404, 'not_found', 'The project was not found.');
            }
            if ($ownsTransaction) $this->pdo->commit();
            return $this->projects->find($user->workspaceId, $projectId) ?? [];
        } catch (Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        }

    }

    public function members(AuthenticatedUser $user, int $projectId): array
    {
        $this->findVisible($user, $projectId);
        return $this->projects->members($user->workspaceId, $projectId);
    }

    public function addMember(AuthenticatedUser $user, int $projectId, int $userId): array
    {
        $this->requireMemberManagement($user, $projectId);
        $project = $this->projects->find($user->workspaceId, $projectId);
        ProjectLifecycle::requireWritable($project['status'] ?? 'archived');
        $member = $this->users->findById($user->workspaceId, $userId);
        if ($member === null || !(bool) $member['is_active']) {
            throw new ApiException(404, 'not_found', 'The user was not found.');
        }

        $this->projects->addMember($user->workspaceId, $projectId, $userId);
        return $member;
    }

    public function removeMember(AuthenticatedUser $user, int $projectId, int $userId): void
    {
        $this->requireMemberManagement($user, $projectId);
        $member = $this->users->findById($user->workspaceId, $userId);
        if ($member === null) {
            throw new ApiException(404, 'not_found', 'The user was not found.');
        }
        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) {
            $this->pdo->beginTransaction();
        }

        try {
            if (!$this->projects->removeMember($user->workspaceId, $projectId, $userId)) {
                throw new ApiException(404, 'not_found', 'The project membership was not found.');
            }
            $this->issues->unassignRemovedMember($user, $projectId, $userId);
            if ($ownsTransaction) {
                $this->pdo->commit();
            }
        } catch (Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $exception;
        }
    }

    public function guestProjectAccess(AuthenticatedUser $actor, int $memberId): array
    {
        $this->requireWorkspaceAdmin($actor);
        $member = $this->users->findById($actor->workspaceId, $memberId);
        if ($member === null) {
            throw new ApiException(404, 'not_found', 'The workspace member was not found.');
        }
        if ($member['role'] !== 'guest') {
            throw new ApiException(409, 'not_guest', 'Project access can only be managed for guest members.');
        }

        $currentProjects = $this->projects->guestProjectMemberships($actor->workspaceId, $memberId);
        $projectsById = [];
        foreach ($this->projects->listForWorkspace($actor->workspaceId) as $project) {
            if (in_array($project['status'], ['active', 'paused'], true)) {
                $projectsById[$project['id']] = [
                    'id' => $project['id'],
                    'name' => $project['name'],
                    'status' => $project['status'],
                ];
            }
        }
        foreach ($currentProjects as $project) $projectsById[$project['id']] = $project;
        $projects = array_values($projectsById);
        usort($projects, static fn (array $left, array $right): int => [$left['name'], $left['id']] <=> [$right['name'], $right['id']]);

        return [
            'project_ids' => array_column($currentProjects, 'id'),
            'projects' => $projects,
        ];
    }

    public function updateGuestProjectAccess(AuthenticatedUser $actor, int $memberId, array $body): array
    {
        $this->requireWorkspaceAdmin($actor);
        $rawProjectIds = $body['project_ids'] ?? null;
        if (!is_array($rawProjectIds) || !array_is_list($rawProjectIds)) {
            throw new ApiException(422, 'validation_failed', 'Project selections must be a list.');
        }

        $projectIds = [];
        foreach ($rawProjectIds as $projectId) {
            if (!is_int($projectId) || $projectId < 1) {
                throw new ApiException(422, 'validation_failed', 'Each selected project must be valid.');
            }
            $projectIds[] = $projectId;
        }
        $projectIds = array_values(array_unique($projectIds));

        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) $this->pdo->beginTransaction();
        try {
            $this->workspaces->lockForMemberUpdate($actor->workspaceId);
            $currentActor = $this->users->findById($actor->workspaceId, $actor->id);
            if ($currentActor === null || !(bool) $currentActor['is_active'] || $currentActor['role'] !== 'admin') {
                throw new ApiException(403, 'forbidden', 'You cannot manage workspace members.');
            }
            $member = $this->users->findById($actor->workspaceId, $memberId);
            if ($member === null) {
                throw new ApiException(404, 'not_found', 'The workspace member was not found.');
            }
            if ($member['role'] !== 'guest') {
                throw new ApiException(409, 'not_guest', 'Project access can only be managed for guest members.');
            }

            $assignableProjectIds = $this->projects->assignableProjectIdsForWorkspaceForUpdate($actor->workspaceId);
            $currentProjects = $this->projects->guestProjectMemberships($actor->workspaceId, $memberId);
            $currentProjectIds = array_column($currentProjects, 'id');
            foreach ($projectIds as $projectId) {
                if (!in_array($projectId, $assignableProjectIds, true)
                    && !in_array($projectId, $currentProjectIds, true)) {
                    throw new ApiException(422, 'validation_failed', 'Choose active or paused projects in this workspace.');
                }
            }

            foreach (array_diff($currentProjectIds, $projectIds) as $projectId) {
                if ($this->projects->removeMember($actor->workspaceId, (int) $projectId, $memberId)) {
                    $this->issues->unassignRemovedMember($actor, (int) $projectId, $memberId);
                }
            }
            foreach (array_diff($projectIds, $currentProjectIds) as $projectId) {
                $this->projects->addMember($actor->workspaceId, (int) $projectId, $memberId);
            }

            if ($ownsTransaction) $this->pdo->commit();
            return ['project_ids' => array_column(
                $this->projects->guestProjectMemberships($actor->workspaceId, $memberId),
                'id',
            )];
        } catch (Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        }
    }

    private function requireWorkspaceAdmin(AuthenticatedUser $actor): void
    {
        if (!Permissions::can($actor, 'users.manage_members')) {
            throw new ApiException(403, 'forbidden', 'You cannot manage workspace members.');
        }
    }

    private function requireMemberManagement(AuthenticatedUser $user, int $projectId): void
    {
        if ($this->projects->find($user->workspaceId, $projectId) === null) {
            throw new ApiException(404, 'not_found', 'The project was not found.');
        }
        if (!Permissions::can($user, 'projects.manage_members')) {
            throw new ApiException(403, 'forbidden', 'You cannot manage project members.');
        }
    }

    private function findVisible(AuthenticatedUser $user, int $projectId): array
    {
        $project = $this->projects->find($user->workspaceId, $projectId);
        if ($project === null || !Permissions::can($user, 'projects.view', [
            'is_member' => $this->projects->isMember($user->workspaceId, $projectId, $user->id),
        ])) {
            throw new ApiException(404, 'not_found', 'The project was not found.');
        }
        return $project;
    }

    private static function slug(string $name): string
    {
        $ascii = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $name);
        $source = is_string($ascii) ? $ascii : $name;
        $slug = strtolower(trim((string) preg_replace('/[^a-zA-Z0-9]+/', '-', $source), '-'));
        return $slug === '' ? 'project' : mb_substr($slug, 0, 140, 'UTF-8');
    }
}
