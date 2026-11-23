<?php

declare(strict_types=1);

namespace Tangent\Tests\Unit;

use PHPUnit\Framework\TestCase;
use Tangent\Modules\GitHub\IssueBranchName;

final class GitHubIssueBranchTest extends TestCase
{
    public function testGeneratedBranchReferenceResolvesToTheIssueId(): void
    {
        self::assertSame(12, IssueBranchName::issueIdFromRef('refs/heads/tangent/issue-12-fix-release-flow'));
        self::assertSame(12, IssueBranchName::issueIdFromRef('refs/heads/tangent/issue-12'));
    }

    public function testPullRequestHeadBranchResolvesToTheIssueId(): void
    {
        self::assertSame(12, IssueBranchName::issueIdFromBranch('tangent/issue-12-fix-release-flow'));
        self::assertSame(12, IssueBranchName::issueIdFromBranch('tangent/issue-12'));
        self::assertNull(IssueBranchName::issueIdFromBranch('feature/issue-12-fix-release-flow'));
        self::assertNull(IssueBranchName::issueIdFromBranch('refs/heads/tangent/issue-12-fix-release-flow'));
        self::assertNull(IssueBranchName::issueIdFromBranch('tangent/issue-999999999999999999999999-too-large'));
    }

    public function testUnrelatedOrMalformedBranchesDoNotResolveToAnIssue(): void
    {
        foreach ([
            'refs/heads/feature/fix-release-flow',
            'refs/heads/tangent/issue-0-fix-release-flow',
            'refs/heads/tangent/issue-12-Fix-release-flow',
            'refs/tags/tangent/issue-12-fix-release-flow',
            'refs/heads/tangent/issue-12-extra/slash',
            'refs/heads/tangent/issue-999999999999999999999999-too-large',
            null,
        ] as $ref) {
            self::assertNull(IssueBranchName::issueIdFromRef($ref));
        }
    }
}
