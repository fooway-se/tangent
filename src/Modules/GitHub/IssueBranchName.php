<?php

declare(strict_types=1);

namespace Tangent\Modules\GitHub;

final class IssueBranchName
{
    public static function issueIdFromRef(mixed $ref): ?int
    {
        if (!is_string($ref) || !str_starts_with($ref, 'refs/heads/')) return null;
        return self::issueIdFromBranch(substr($ref, strlen('refs/heads/')));
    }

    public static function issueIdFromBranch(mixed $branch): ?int
    {
        if (!is_string($branch)
            || preg_match('~^tangent/issue-([1-9][0-9]*)(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?$~', $branch, $matches) !== 1) {
            return null;
        }

        $issueId = filter_var($matches[1], FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        return $issueId === false ? null : $issueId;
    }
}
