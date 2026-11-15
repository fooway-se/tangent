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

final class ProjectService
{
    public function __construct(
        private readonly ProjectRepository $projects,
        private readonly UserRepository $users,
        private readonly PDO $pdo,
        private readonly ChatService $chat,
    ) {
    }

    /** @return list<array<string, mixed>> */
    public function list(AuthenticatedUser $user): array
    {
        return array_values(array_filter(
            $this->projects->listForWorkspace($user->workspaceId),
            fn (array $project): bool => Permissions::can($user, 'projects.view', [
                'is_member' => $this->projects->isMember($user->workspaceId, $project['id'], $user->id),
            ]),
        ));
    }

    /** @return array{project: array<string, mixed>, members: list<array<string, mixed>>} */
    public function get(AuthenticatedUser $user, int $projectId): array
    {
        $project = $this->findVisible($user, $projectId);
        return [
            'project' => $project,
            'members' => $this->projects->members($user->workspaceId, $projectId),
        ];
    }

    /** @param array<string, mixed> $body @return array<string, mixed> */
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

        $slug = self::slug($name);
        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) {
            $this->pdo->beginTransaction();
        }

        try {
            $project = $this->projects->create($user->workspaceId, $name, $slug, $description, $user->id);
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

    /** @param array<string, mixed> $body @return array<string, mixed> */
    public function update(AuthenticatedUser $user, int $projectId, array $body): array
    {
        $project = $this->projects->find($user->workspaceId, $projectId);
        if ($project === null) {
            throw new ApiException(404, 'not_found', 'The project was not found.');
        }
        if (!Permissions::can($user, 'projects.update')) {
            throw new ApiException(403, 'forbidden', 'You cannot update projects.');
        }

        $updated = [
            'name' => $project['name'],
            'description' => $project['description'],
            'status' => $project['status'],
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
        if (array_key_exists('status', $body)) {
            if (!is_string($body['status']) || !in_array($body['status'], ['active', 'archived'], true)) {
                throw new ApiException(422, 'validation_failed', 'Project status must be active or archived.');
            }
            $updated['status'] = $body['status'];
        }
        if (!array_intersect(['name', 'description', 'status'], array_keys($body))) {
            throw new ApiException(422, 'validation_failed', 'At least one project field must be supplied.');
        }

        $this->projects->update($user->workspaceId, $projectId, $updated);
        return $this->projects->find($user->workspaceId, $projectId) ?? [];
    }

    /** @return list<array<string, mixed>> */
    public function members(AuthenticatedUser $user, int $projectId): array
    {
        $this->findVisible($user, $projectId);
        return $this->projects->members($user->workspaceId, $projectId);
    }

    /** @return array<string, mixed> */
    public function addMember(AuthenticatedUser $user, int $projectId, int $userId): array
    {
        $this->requireMemberManagement($user, $projectId);
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
        if (!$this->projects->removeMember($user->workspaceId, $projectId, $userId)) {
            throw new ApiException(404, 'not_found', 'The project membership was not found.');
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

    /** @return array<string, mixed> */
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
