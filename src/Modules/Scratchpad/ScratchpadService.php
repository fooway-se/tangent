<?php

declare(strict_types=1);

namespace Tangent\Modules\Scratchpad;

use Tangent\Core\ApiException;
use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Permissions;

final class ScratchpadService
{
    public function __construct(private readonly ScratchpadRepository $notes)
    {
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
}
