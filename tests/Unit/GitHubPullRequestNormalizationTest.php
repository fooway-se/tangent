<?php

declare(strict_types=1);

namespace Tangent\Tests\Unit;

use PHPUnit\Framework\TestCase;
use ReflectionMethod;
use Tangent\Modules\GitHub\GitHubService;

final class GitHubPullRequestNormalizationTest extends TestCase
{
    public function testNormalizesGithubTimestampsForTheDatabase(): void
    {
        $normalize = new ReflectionMethod(GitHubService::class, 'normalizePullRequest');
        $pullRequest = $normalize->invoke(null, [
            'number' => 17,
            'title' => 'Add project integration',
            'html_url' => 'https://github.com/test-org/test-repo/pull/17',
            'state' => 'open',
            'merged_at' => null,
            'draft' => true,
            'user' => ['login' => 'developer-one'],
            'updated_at' => '2026-11-18T10:00:00Z',
        ], 17, 'test-org/test-repo');

        self::assertSame('2026-11-18 10:00:00', $pullRequest['updated_at']);
        self::assertSame('open', $pullRequest['state']);
        self::assertTrue($pullRequest['is_draft']);
    }
}
