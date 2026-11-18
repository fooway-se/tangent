<?php

declare(strict_types=1);

namespace Tangent\Modules\Projects;

use Tangent\Core\ApiException;

final class ProjectLifecycle
{
    public const STATUSES = ['active', 'paused', 'completed', 'archived'];

    public static function isReadOnly(string $status): bool
    {
        return in_array($status, ['completed', 'archived'], true);
    }

    public static function requireWritable(string $status): void
    {
        if (self::isReadOnly($status)) {
            throw new ApiException(409, 'project_read_only', 'This project is read-only. Reopen it before making changes.');
        }
    }
}
