<?php

declare(strict_types=1);

namespace Tangent\Modules\Projects;

use DateTimeImmutable;
use PDO;
use Throwable;
use Tangent\Core\ApiException;
use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Permissions;
use Tangent\Modules\Issues\IssueRepository;

final class MilestoneService
{
    public function __construct(
        private readonly MilestoneRepository $milestones,
        private readonly IssueRepository $issues,
        private readonly ProjectRepository $projects,
        private readonly PDO $pdo,
    ) {
    }

    public function list(AuthenticatedUser $user, int $projectId): array
    {
        $this->requireManage($user, $projectId);
        return $this->milestones->list($user->workspaceId, $projectId);
    }

    public function create(AuthenticatedUser $user, int $projectId, array $input): array
    {
        $this->requireManage($user, $projectId);
        [$name, $dueDate] = self::fields($input, null, null, false);
        return $this->milestones->create($user->workspaceId, $projectId, $name, $dueDate);
    }

    public function update(AuthenticatedUser $user, int $projectId, int $milestoneId, array $input): array
    {
        $this->requireManage($user, $projectId);
        $current = $this->milestones->find($user->workspaceId, $projectId, $milestoneId);
        if ($current === null) throw new ApiException(404, 'not_found', 'The milestone was not found.');
        [$name, $dueDate] = self::fields($input, $current['name'], $current['due_date'], true);
        $this->milestones->update($user->workspaceId, $projectId, $milestoneId, $name, $dueDate);
        return $this->milestones->find($user->workspaceId, $projectId, $milestoneId) ?? [];
    }

    public function delete(AuthenticatedUser $user, int $projectId, int $milestoneId): void
    {
        $this->requireManage($user, $projectId);
        if ($this->milestones->find($user->workspaceId, $projectId, $milestoneId) === null) {
            throw new ApiException(404, 'not_found', 'The milestone was not found.');
        }
        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) $this->pdo->beginTransaction();
        try {
            $this->issues->unlinkMilestone($user->workspaceId, $projectId, $milestoneId);
            $this->milestones->delete($user->workspaceId, $projectId, $milestoneId);
            if ($ownsTransaction) $this->pdo->commit();
        } catch (Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        }
    }

    private static function fields(array $input, ?string $currentName, ?string $currentDate, bool $partial): array
    {
        if ($partial && !array_intersect(['name', 'due_date'], array_keys($input))) {
            throw new ApiException(422, 'validation_failed', 'At least one milestone field must be supplied.');
        }
        $name = array_key_exists('name', $input)
            ? (is_string($input['name']) ? trim($input['name']) : '')
            : (string) $currentName;
        if (mb_strlen($name, 'UTF-8') < 1 || mb_strlen($name, 'UTF-8') > 120) {
            throw new ApiException(422, 'validation_failed', 'Milestone name must be between 1 and 120 characters.');
        }
        $date = array_key_exists('due_date', $input) ? $input['due_date'] : $currentDate;
        if ($date !== null && (!is_string($date) || !self::validDate($date))) {
            throw new ApiException(422, 'validation_failed', 'Milestone due_date must be a valid YYYY-MM-DD date or null.');
        }
        return [$name, $date];
    }

    private static function validDate(string $value): bool
    {
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);
        return $date !== false && $date->format('Y-m-d') === $value;
    }

    private function requireManage(AuthenticatedUser $user, int $projectId): void
    {
        $project = $this->projects->find($user->workspaceId, $projectId);
        if ($project === null) throw new ApiException(404, 'not_found', 'The project was not found.');
        $isMember = $this->projects->isMember($user->workspaceId, $projectId, $user->id);
        if (!Permissions::can($user, 'milestones.manage', ['is_member' => $isMember])) {
            throw new ApiException(403, 'forbidden', 'You cannot manage milestones.');
        }
    }
}
