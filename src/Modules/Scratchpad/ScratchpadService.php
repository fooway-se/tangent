<?php

declare(strict_types=1);

namespace Tangent\Modules\Scratchpad;

use PDO;
use Throwable;
use Tangent\Core\ApiException;
use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Permissions;
use Tangent\Modules\Issues\IssuesService;

final class ScratchpadService
{
    public function __construct(
        private readonly ScratchpadRepository $notes,
        private readonly IssuesService $issues,
        private readonly PDO $pdo,
    ) {
    }

    public function read(AuthenticatedUser $user): array
    {
        $this->requirePermission($user, 'scratchpad.read');
        return $this->notes->readForUser($user->workspaceId, $user->id)
            ?? ['body' => '', 'updated_at' => null];
    }

    public function save(AuthenticatedUser $user, array $input): array
    {
        $this->requirePermission($user, 'scratchpad.update');
        return $this->notes->saveForUser(
            $user->workspaceId,
            $user->id,
            self::body($input['body'] ?? null),
        );
    }

    public function convertToIssue(AuthenticatedUser $user, array $input): array
    {
        $this->requirePermission($user, 'scratchpad.update');
        $projectId = $input['project_id'] ?? null;
        if (!is_int($projectId) || $projectId < 1) {
            throw new ApiException(422, 'validation_failed', 'project_id must be a positive integer.');
        }

        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) $this->pdo->beginTransaction();
        try {
            $note = $this->notes->readForUser($user->workspaceId, $user->id, true);
            if ($note === null || trim($note['body']) === '') {
                throw new ApiException(422, 'validation_failed', 'Write something in the scratchpad before creating an issue.');
            }

            [$title, $description] = self::issueText($note['body']);
            $issue = $this->issues->create($user, $projectId, [
                'title' => $title,
                'description' => $description,
            ]);
            $this->notes->saveForUser($user->workspaceId, $user->id, '');
            if ($ownsTransaction) $this->pdo->commit();
            return $issue;
        } catch (Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        }
    }

    private function requirePermission(AuthenticatedUser $user, string $action): void
    {
        if (!Permissions::can($user, $action)) {
            throw new ApiException(403, 'forbidden', 'You cannot access the scratchpad.');
        }
    }

    private static function body(mixed $value): string
    {
        if (!is_string($value)) {
            throw new ApiException(422, 'validation_failed', 'Scratchpad body must be text.');
        }
        if (mb_strlen($value, 'UTF-8') > 10_000) {
            throw new ApiException(422, 'validation_failed', 'Scratchpad body cannot exceed 10000 characters.');
        }
        return $value;
    }

    private static function issueText(string $body): array
    {
        $lines = preg_split('/\R/u', $body, 2);
        $firstLine = trim((string) ($lines[0] ?? ''));
        $title = mb_substr($firstLine, 0, 200, 'UTF-8');
        $description = trim((string) ($lines[1] ?? ''));
        if (mb_strlen($firstLine, 'UTF-8') > 200) {
            $description = $body;
        }
        return [$title, $description];
    }
}
