<?php

declare(strict_types=1);

namespace Tangent\Modules\GitHub;

use DateTimeImmutable;
use DateTimeZone;

final class GitHubCommitPayload
{
    public static function normalize(array $commit, string $repositoryFullName): ?array
    {
        $sha = $commit['id'] ?? null;
        $message = $commit['message'] ?? null;
        $timestamp = $commit['timestamp'] ?? null;
        if (!is_string($sha) || preg_match('/^[a-f0-9]{40,64}$/i', $sha) !== 1
            || !is_string($message) || !is_string($timestamp)
            || preg_match('~^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$~', $repositoryFullName) !== 1) {
            return null;
        }
        try {
            $committedAt = (new DateTimeImmutable($timestamp, new DateTimeZone('UTC')))
                ->setTimezone(new DateTimeZone('UTC'))
                ->format('Y-m-d H:i:s');
        } catch (\Throwable) {
            return null;
        }

        $author = is_array($commit['author'] ?? null) ? $commit['author'] : [];
        $authorLogin = $author['username'] ?? $author['login'] ?? '';
        if (!is_string($authorLogin)) $authorLogin = '';
        $message = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $message) ?? '';
        $message = trim($message);
        if ($message === '') $message = '(no commit message)';

        return [
            'sha' => strtolower($sha),
            'message' => $message,
            'html_url' => 'https://github.com/' . $repositoryFullName . '/commit/' . strtolower($sha),
            'author_login' => $authorLogin,
            'committed_at' => $committedAt,
        ];
    }
}
