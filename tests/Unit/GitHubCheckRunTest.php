<?php

declare(strict_types=1);

namespace Tangent\Tests\Unit;

use PHPUnit\Framework\TestCase;
use Tangent\Modules\GitHub\GitHubCheckRun;

final class GitHubCheckRunTest extends TestCase
{
    public function testNormalizesCheckRunAndItsTimestamps(): void
    {
        $checkRun = GitHubCheckRun::normalize([
            'id' => 991122,
            'name' => 'PHP tests',
            'html_url' => 'https://github.com/test-org/test-repo/runs/991122',
            'status' => 'completed',
            'conclusion' => 'failure',
            'started_at' => '2026-11-18T10:05:00+02:00',
            'completed_at' => '2026-11-18T10:08:00+02:00',
            'updated_at' => '2026-11-18T10:08:00+02:00',
        ]);

        self::assertSame([
            'id' => 991122,
            'name' => 'PHP tests',
            'html_url' => 'https://github.com/test-org/test-repo/runs/991122',
            'status' => 'completed',
            'conclusion' => 'failure',
            'started_at' => '2026-11-18 08:05:00',
            'completed_at' => '2026-11-18 08:08:00',
            'updated_at' => '2026-11-18 08:08:00',
        ], $checkRun);
    }

    public function testRejectsInvalidCheckRunIdentityStatusAndUrl(): void
    {
        $valid = [
            'id' => 991122,
            'name' => 'PHP tests',
            'html_url' => 'https://github.com/test-org/test-repo/runs/991122',
            'status' => 'in_progress',
            'updated_at' => '2026-11-18T10:05:00Z',
        ];

        self::assertNull(GitHubCheckRun::normalize([...$valid, 'id' => 0]));
        self::assertNull(GitHubCheckRun::normalize([...$valid, 'status' => 'pending']));
        self::assertNull(GitHubCheckRun::normalize([...$valid, 'html_url' => 'https://example.com/run']));
    }
}
