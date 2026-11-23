<?php

declare(strict_types=1);

namespace Tangent\Modules\GitHub;

use DateTimeImmutable;
use DateTimeZone;

final class GitHubCheckRun
{
    public static function normalize(array $checkRun): ?array
    {
        $id = filter_var($checkRun['id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        $name = $checkRun['name'] ?? null;
        $htmlUrl = $checkRun['html_url'] ?? null;
        $status = $checkRun['status'] ?? null;
        $conclusion = $checkRun['conclusion'] ?? null;
        if ($id === false || !is_string($name) || trim($name) === ''
            || !is_string($htmlUrl) || !self::isGitHubUrl($htmlUrl)
            || !is_string($status) || !in_array($status, ['queued', 'in_progress', 'completed'], true)
            || ($conclusion !== null && (!is_string($conclusion) || preg_match('/^[a-z0-9_]{1,50}$/i', $conclusion) !== 1))) {
            return null;
        }

        $updatedAt = self::timestamp($checkRun['updated_at'] ?? null);
        if ($updatedAt === null) {
            $updatedAt = self::timestamp($checkRun['completed_at'] ?? null)
                ?? self::timestamp($checkRun['started_at'] ?? null)
                ?? self::timestamp($checkRun['created_at'] ?? null);
        }
        if ($updatedAt === null) return null;

        $startedAt = self::optionalTimestamp($checkRun, 'started_at');
        $completedAt = self::optionalTimestamp($checkRun, 'completed_at');
        if ($startedAt === false || $completedAt === false) return null;

        return [
            'id' => $id,
            'name' => mb_substr($name, 0, 500, 'UTF-8'),
            'html_url' => $htmlUrl,
            'status' => $status,
            'conclusion' => $conclusion,
            'started_at' => $startedAt,
            'completed_at' => $completedAt,
            'updated_at' => $updatedAt,
        ];
    }

    private static function isGitHubUrl(string $url): bool
    {
        $parts = parse_url($url);
        return is_array($parts)
            && ($parts['scheme'] ?? '') === 'https'
            && strcasecmp((string) ($parts['host'] ?? ''), 'github.com') === 0
            && !isset($parts['user'], $parts['pass'], $parts['port'])
            && isset($parts['path']);
    }

    private static function optionalTimestamp(array $checkRun, string $field): string|false|null
    {
        if (!array_key_exists($field, $checkRun) || $checkRun[$field] === null) return null;
        if (!is_string($checkRun[$field])) return false;
        return self::timestamp($checkRun[$field]) ?? false;
    }

    private static function timestamp(mixed $value): ?string
    {
        if (!is_string($value) || $value === '') return null;
        try {
            return (new DateTimeImmutable($value))
                ->setTimezone(new DateTimeZone('UTC'))
                ->format('Y-m-d H:i:s');
        } catch (\Throwable) {
            return null;
        }
    }
}
