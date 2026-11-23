<?php

declare(strict_types=1);

namespace Tangent\Tests\Unit;

use PHPUnit\Framework\TestCase;
use Tangent\Modules\GitHub\GitHubCommitPayload;

final class GitHubCommitPayloadTest extends TestCase
{
    public function testNormalizesACommitFromAValidGithubPush(): void
    {
        $commit = GitHubCommitPayload::normalize([
            'id' => str_repeat('A', 40),
            'message' => "  Add commit tracking\0 safely  ",
            'timestamp' => '2026-11-22T10:00:00Z',
            'author' => ['username' => 'sam'],
        ], 'tangent/app');

        self::assertSame([
            'sha' => str_repeat('a', 40),
            'message' => 'Add commit tracking safely',
            'html_url' => 'https://github.com/tangent/app/commit/' . str_repeat('a', 40),
            'author_login' => 'sam',
            'committed_at' => '2026-11-22 10:00:00',
        ], $commit);
    }

    public function testRejectsCommitValuesThatCannotBeStoredSafely(): void
    {
        $valid = [
            'id' => str_repeat('a', 40),
            'message' => 'A commit',
            'timestamp' => '2026-11-22T10:00:00Z',
            'author' => ['username' => 'sam'],
        ];
        foreach ([
            [array_replace($valid, ['id' => 'bad-sha']), 'tangent/app'],
            [array_replace($valid, ['timestamp' => 'not a date']), 'tangent/app'],
            [$valid, 'https://evil.example/tangent/app'],
            [$valid, 'tangent/app/with/slash'],
        ] as [$commit, $repository]) {
            self::assertNull(GitHubCommitPayload::normalize($commit, $repository));
        }
    }
}
