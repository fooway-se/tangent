<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use Tangent\Core\Request;
use Tangent\Core\Response;
use Tangent\Core\Database;
use Tangent\Modules\Issues\IssueRepository;
use Tangent\Tests\Support\ApiTestCase;

final class IssuesTest extends ApiTestCase
{
    public function testApprovalRepositoryRejectsOngoingIssuesAtomically(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Approval eligibility');
        $ongoingIssueId = $this->createIssue($admin, $projectId, 'Already ongoing');
        $eligibleIssueId = $this->createIssue($admin, $projectId, 'Eligible for approval');
        $prepare = $this->pdo->prepare(
            'UPDATE issues
             SET is_shared = 1, approval_requested_at = UTC_TIMESTAMP(), is_ongoing = :is_ongoing
             WHERE workspace_id = :workspace_id AND id = :id',
        );
        $prepare->execute(['is_ongoing' => 1, 'workspace_id' => $this->workspaceId, 'id' => $ongoingIssueId]);
        $prepare->execute(['is_ongoing' => 0, 'workspace_id' => $this->workspaceId, 'id' => $eligibleIssueId]);

        $issues = new IssueRepository($this->pdo);
        self::assertFalse($issues->approve($this->workspaceId, $ongoingIssueId, $this->developerId));
        self::assertTrue($issues->approve($this->workspaceId, $eligibleIssueId, $this->developerId));

        $approvals = $this->pdo->prepare(
            'SELECT approved_at FROM issues WHERE workspace_id = :workspace_id AND id = :id',
        );
        $approvals->execute(['workspace_id' => $this->workspaceId, 'id' => $ongoingIssueId]);
        self::assertNull($approvals->fetchColumn());
        $approvals->execute(['workspace_id' => $this->workspaceId, 'id' => $eligibleIssueId]);
        self::assertNotFalse($approvals->fetchColumn());
    }

    public function testConcurrentIssueChangesPreserveApprovalAndRecordEffectiveStatusHistory(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Concurrent issue updates');
        $issueIds = [];
        foreach (['Preserve independent state', 'Do not record skipped transitions'] as $title) {
            $created = $this->apiCookieRequest(
                'POST',
                "/api/v1/projects/{$projectId}/issues",
                $admin['cookie'],
                ['title' => $title],
                $admin['csrf'],
            );
            self::assertSame(201, $created->status, json_encode($created->body));
            $issueIds[] = (int) $created->body['issue']['id'];
        }
        [$updatedIssueId, $deletedIssueId] = $issueIds;
        $workspaceId = $this->workspaceId;

        $this->pdo->commit();
        $this->pdo->beginTransaction();
        foreach ($issueIds as $issueId) {
            $snapshot = $this->pdo->prepare('SELECT status FROM issues WHERE workspace_id = :workspace_id AND id = :id');
            $snapshot->execute(['workspace_id' => $workspaceId, 'id' => $issueId]);
            self::assertSame('backlog', $snapshot->fetchColumn());
        }

        $otherPdo = $this->testDatabaseConnection();
        try {
            $otherPdo->beginTransaction();
            $approval = $otherPdo->prepare(
                "UPDATE issues
                 SET status = 'doing', is_shared = 1, approval_requested_at = UTC_TIMESTAMP(),
                     approved_by = :approved_by, approved_at = UTC_TIMESTAMP()
                 WHERE workspace_id = :workspace_id AND id = :id"
            );
            $approval->execute([
                'approved_by' => $this->developerId,
                'workspace_id' => $workspaceId,
                'id' => $updatedIssueId,
            ]);
            $history = $otherPdo->prepare(
                "INSERT INTO issue_status_history (workspace_id, issue_id, actor_id, from_status, to_status)
                 VALUES (:workspace_id, :issue_id, :actor_id, 'backlog', 'doing')"
            );
            $history->execute([
                'workspace_id' => $workspaceId,
                'issue_id' => $updatedIssueId,
                'actor_id' => $this->developerId,
            ]);
            $otherPdo->prepare(
                'UPDATE issues SET deleted_at = UTC_TIMESTAMP() WHERE workspace_id = :workspace_id AND id = :id'
            )->execute(['workspace_id' => $workspaceId, 'id' => $deletedIssueId]);
            $otherPdo->commit();

            $updated = $this->apiCookieRequest(
                'PATCH',
                "/api/v1/issues/{$updatedIssueId}",
                $admin['cookie'],
                ['title' => 'Preserved title', 'status' => 'done'],
                $admin['csrf'],
            );
            self::assertSame(200, $updated->status, json_encode($updated->body));
            self::assertTrue($updated->body['issue']['is_shared']);
            self::assertSame($this->developerId, $updated->body['issue']['approved_by']);
            self::assertNotNull($updated->body['issue']['approved_at']);

            $skipped = $this->apiCookieRequest(
                'PATCH',
                "/api/v1/issues/{$deletedIssueId}",
                $admin['cookie'],
                ['status' => 'done'],
                $admin['csrf'],
            );
            self::assertSame(404, $skipped->status, json_encode($skipped->body));
            $this->pdo->commit();

            $finalIssue = $otherPdo->prepare(
                'SELECT status, is_shared, approved_by, approved_at FROM issues WHERE workspace_id = :workspace_id AND id = :id'
            );
            $finalIssue->execute(['workspace_id' => $workspaceId, 'id' => $updatedIssueId]);
            $final = $finalIssue->fetch(\PDO::FETCH_ASSOC);
            self::assertSame('done', $final['status']);
            self::assertSame(1, (int) $final['is_shared']);
            self::assertSame($this->developerId, (int) $final['approved_by']);
            self::assertNotNull($final['approved_at']);

            $statusHistory = $otherPdo->prepare(
                'SELECT from_status, to_status FROM issue_status_history WHERE workspace_id = :workspace_id AND issue_id = :id ORDER BY id'
            );
            $statusHistory->execute(['workspace_id' => $workspaceId, 'id' => $updatedIssueId]);
            self::assertSame([
                ['from_status' => 'backlog', 'to_status' => 'doing'],
                ['from_status' => 'doing', 'to_status' => 'done'],
            ], $statusHistory->fetchAll(\PDO::FETCH_ASSOC));

            $skippedHistory = $otherPdo->prepare(
                'SELECT COUNT(*) FROM issue_status_history WHERE workspace_id = :workspace_id AND issue_id = :id'
            );
            $skippedHistory->execute(['workspace_id' => $workspaceId, 'id' => $deletedIssueId]);
            self::assertSame(0, (int) $skippedHistory->fetchColumn());
            $skippedEvents = $otherPdo->prepare(
                "SELECT COUNT(*) FROM inbox_events WHERE workspace_id = :workspace_id AND issue_id = :id AND event_type = 'status'"
            );
            $skippedEvents->execute(['workspace_id' => $workspaceId, 'id' => $deletedIssueId]);
            self::assertSame(0, (int) $skippedEvents->fetchColumn());
        } finally {
            if ($otherPdo->inTransaction()) $otherPdo->rollBack();
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            $this->cleanCommittedWorkspace($workspaceId);
        }
    }

    public function testProjectMemberCanCreateListAndChangeIssueStatus(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Issue project');
        $added = $this->apiCookieRequest(
            'PUT',
            "/api/v1/projects/{$projectId}/members/{$this->developerId}",
            $admin['cookie'],
            [],
            $admin['csrf'],
        );
        self::assertSame(200, $added->status);

        $developer = $this->login($this->developerEmail);
        $created = $this->apiCookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/issues",
            $developer['cookie'],
            ['title' => 'Add empty state', 'description' => 'Show a helpful empty state.'],
            $developer['csrf'],
        );

        self::assertSame(201, $created->status, json_encode($created->body));
        self::assertSame('backlog', $created->body['issue']['status']);
        self::assertSame('Add empty state', $created->body['issue']['title']);
        self::assertSame('medium', $created->body['issue']['priority']);
        self::assertNull($created->body['issue']['due_date']);

        $listed = $this->apiCookieRequest(
            'GET',
            "/api/v1/projects/{$projectId}/issues",
            $developer['cookie'],
        );
        self::assertSame(200, $listed->status);
        self::assertCount(1, $listed->body['issues']);

        $issueId = $created->body['issue']['id'];
        $updated = $this->apiCookieRequest(
            'PATCH',
            "/api/v1/issues/{$issueId}",
            $developer['cookie'],
            ['status' => 'doing'],
            $developer['csrf'],
        );
        self::assertSame(200, $updated->status, json_encode($updated->body));
        self::assertSame('doing', $updated->body['issue']['status']);
    }

    public function testIssueStatusHistoryShowsRecentTransitionsAndActor(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Issue status history');
        $created = $this->apiCookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/issues",
            $admin['cookie'],
            ['title' => 'Track status changes'],
            $admin['csrf'],
        );
        self::assertSame(201, $created->status, json_encode($created->body));
        $issueId = (int) $created->body['issue']['id'];

        foreach (['todo', 'doing', 'testing', 'done'] as $status) {
            $updated = $this->apiCookieRequest(
                'PATCH',
                "/api/v1/issues/{$issueId}",
                $admin['cookie'],
                ['status' => $status],
                $admin['csrf'],
            );
            self::assertSame(200, $updated->status, json_encode($updated->body));
        }
        $this->apiCookieRequest(
            'PATCH',
            "/api/v1/issues/{$issueId}",
            $admin['cookie'],
            ['title' => 'A title edit is not a status transition'],
            $admin['csrf'],
        );

        $history = $this->apiCookieRequest('GET', "/api/v1/issues/{$issueId}/history", $admin['cookie']);
        self::assertSame(200, $history->status, json_encode($history->body));
        self::assertCount(4, $history->body['transitions']);
        self::assertSame(['done', 'testing', 'doing', 'todo'], array_column($history->body['transitions'], 'to_status'));
        self::assertSame(['testing', 'doing', 'todo', 'backlog'], array_column($history->body['transitions'], 'from_status'));
        self::assertSame(['Admin', 'Admin', 'Admin', 'Admin'], array_column($history->body['transitions'], 'actor_name'));
        self::assertNotEmpty($history->body['transitions'][0]['created_at']);
    }

    public function testIssueListsSupportConditionalPollingForActiveAndDeletedIssues(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Issue list polling');
        $created = $this->apiCookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/issues",
            $admin['cookie'],
            ['title' => 'Pollable issue'],
            $admin['csrf'],
        );
        self::assertSame(201, $created->status, json_encode($created->body));
        $issueId = (int) $created->body['issue']['id'];

        $active = $this->apiCookieRequest('GET', "/api/v1/projects/{$projectId}/issues", $admin['cookie']);
        $deleted = $this->apiCookieRequest('GET', "/api/v1/projects/{$projectId}/issues/deleted", $admin['cookie']);
        self::assertSame(200, $active->status);
        self::assertSame(200, $deleted->status);
        $activeEtag = $active->headers['etag'] ?? null;
        $deletedEtag = $deleted->headers['etag'] ?? null;
        self::assertIsString($activeEtag);
        self::assertIsString($deletedEtag);

        self::assertSame(304, $this->request(
            'GET',
            "/api/v1/projects/{$projectId}/issues",
            [],
            ['If-None-Match' => $activeEtag],
            ['tangent_session' => $admin['cookie']],
        )->status);
        self::assertSame(304, $this->request(
            'GET',
            "/api/v1/projects/{$projectId}/issues/deleted",
            [],
            ['If-None-Match' => $deletedEtag],
            ['tangent_session' => $admin['cookie']],
        )->status);

        $removed = $this->apiCookieRequest(
            'DELETE',
            "/api/v1/issues/{$issueId}",
            $admin['cookie'],
            [],
            $admin['csrf'],
        );
        self::assertSame(204, $removed->status);
        $activeAfterDelete = $this->request(
            'GET',
            "/api/v1/projects/{$projectId}/issues",
            [],
            ['If-None-Match' => $activeEtag],
            ['tangent_session' => $admin['cookie']],
        );
        $deletedAfterDelete = $this->request(
            'GET',
            "/api/v1/projects/{$projectId}/issues/deleted",
            [],
            ['If-None-Match' => $deletedEtag],
            ['tangent_session' => $admin['cookie']],
        );
        self::assertSame(200, $activeAfterDelete->status);
        self::assertSame([], $activeAfterDelete->body['issues']);
        self::assertNotSame($activeEtag, $activeAfterDelete->headers['etag'] ?? null);
        self::assertSame(200, $deletedAfterDelete->status);
        self::assertCount(1, $deletedAfterDelete->body['issues']);
        self::assertNotSame($deletedEtag, $deletedAfterDelete->headers['etag'] ?? null);
    }

    public function testIssueCanBeCreatedWithMilestoneAndGuestVisibilityFields(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Complete quick add');
        $milestone = $this->apiCookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/milestones",
            $admin['cookie'],
            ['name' => 'First delivery'],
            $admin['csrf'],
        );
        self::assertSame(201, $milestone->status, json_encode($milestone->body));
        $milestoneId = (int) $milestone->body['milestone']['id'];

        $created = $this->apiCookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/issues",
            $admin['cookie'],
            [
                'title' => 'Share the first delivery',
                'description' => 'Give the client a clear status.',
                'type' => 'feature',
                'assignee_id' => $admin['user']['id'],
                'milestone_id' => $milestoneId,
                'is_shared' => true,
                'approval_requested' => true,
            ],
            $admin['csrf'],
        );
        self::assertSame(201, $created->status, json_encode($created->body));
        self::assertSame($milestoneId, $created->body['issue']['milestone_id']);
        self::assertTrue($created->body['issue']['is_shared']);
        self::assertNotNull($created->body['issue']['approval_requested_at']);
        self::assertSame('feature', $created->body['issue']['type']);
        self::assertSame($admin['user']['id'], $created->body['issue']['assignee_id']);

        $approvalWithoutSharing = $this->apiCookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/issues",
            $admin['cookie'],
            ['title' => 'Approval must be shared', 'approval_requested' => true],
            $admin['csrf'],
        );
        self::assertSame(422, $approvalWithoutSharing->status);
    }

    public function testOngoingIssueClearsItsMilestoneAndCannotBeCompletedUntilReclassified(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Ongoing work');
        $milestone = $this->apiCookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/milestones",
            $admin['cookie'],
            ['name' => 'First delivery'],
            $admin['csrf'],
        );
        self::assertSame(201, $milestone->status, json_encode($milestone->body));
        $milestoneId = (int) $milestone->body['milestone']['id'];
        $created = $this->apiCookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/issues",
            $admin['cookie'],
            ['title' => 'Monitor production', 'milestone_id' => $milestoneId],
            $admin['csrf'],
        );
        self::assertSame(201, $created->status, json_encode($created->body));
        $issueId = (int) $created->body['issue']['id'];

        $ongoing = $this->apiCookieRequest(
            'PATCH',
            "/api/v1/issues/{$issueId}",
            $admin['cookie'],
            ['is_ongoing' => true],
            $admin['csrf'],
        );
        self::assertSame(200, $ongoing->status, json_encode($ongoing->body));
        self::assertTrue($ongoing->body['issue']['is_ongoing']);
        self::assertNull($ongoing->body['issue']['milestone_id']);

        $cannotComplete = $this->apiCookieRequest(
            'PATCH',
            "/api/v1/issues/{$issueId}",
            $admin['cookie'],
            ['status' => 'done'],
            $admin['csrf'],
        );
        self::assertSame(422, $cannotComplete->status);

        $reclassified = $this->apiCookieRequest(
            'PATCH',
            "/api/v1/issues/{$issueId}",
            $admin['cookie'],
            ['is_ongoing' => false],
            $admin['csrf'],
        );
        self::assertSame(200, $reclassified->status, json_encode($reclassified->body));
        self::assertFalse($reclassified->body['issue']['is_ongoing']);

        $completed = $this->apiCookieRequest(
            'PATCH',
            "/api/v1/issues/{$issueId}",
            $admin['cookie'],
            ['status' => 'done'],
            $admin['csrf'],
        );
        self::assertSame(200, $completed->status, json_encode($completed->body));
        self::assertSame('done', $completed->body['issue']['status']);

        $createdOngoing = $this->apiCookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/issues",
            $admin['cookie'],
            ['title' => 'Review error reports', 'is_ongoing' => true],
            $admin['csrf'],
        );
        self::assertSame(201, $createdOngoing->status, json_encode($createdOngoing->body));
        self::assertTrue($createdOngoing->body['issue']['is_ongoing']);
        self::assertNull($createdOngoing->body['issue']['milestone_id']);
    }

    public function testIssuePriorityAndDueDateCanBeCreatedUpdatedAndCleared(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Issue planning fields');
        $created = $this->apiCookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/issues",
            $admin['cookie'],
            ['title' => 'Prepare launch notes', 'priority' => 'high', 'due_date' => '2026-11-30'],
            $admin['csrf'],
        );

        self::assertSame(201, $created->status, json_encode($created->body));
        self::assertSame('high', $created->body['issue']['priority']);
        self::assertSame('2026-11-30', $created->body['issue']['due_date']);
        $issueId = (int) $created->body['issue']['id'];

        $updated = $this->apiCookieRequest(
            'PATCH',
            "/api/v1/issues/{$issueId}",
            $admin['cookie'],
            ['priority' => 'low', 'due_date' => null],
            $admin['csrf'],
        );
        self::assertSame(200, $updated->status, json_encode($updated->body));
        self::assertSame('low', $updated->body['issue']['priority']);
        self::assertNull($updated->body['issue']['due_date']);

        $urgent = $this->apiCookieRequest(
            'PATCH',
            "/api/v1/issues/{$issueId}",
            $admin['cookie'],
            ['priority' => 'urgent'],
            $admin['csrf'],
        );
        self::assertSame(200, $urgent->status, json_encode($urgent->body));
        self::assertSame('urgent', $urgent->body['issue']['priority']);

        $invalidPriority = $this->apiCookieRequest(
            'PATCH',
            "/api/v1/issues/{$issueId}",
            $admin['cookie'],
            ['priority' => 'critical'],
            $admin['csrf'],
        );
        self::assertSame(422, $invalidPriority->status);

        $invalidDueDate = $this->apiCookieRequest(
            'PATCH',
            "/api/v1/issues/{$issueId}",
            $admin['cookie'],
            ['due_date' => '2026-02-30'],
            $admin['csrf'],
        );
        self::assertSame(422, $invalidDueDate->status);
    }

    public function testIssueBriefFieldsCanBeCreatedListedUpdatedAndCleared(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Issue brief fields');
        $created = $this->apiCookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/issues",
            $admin['cookie'],
            [
                'title' => 'Add structured issue brief',
                'context' => "  The current issue lacks implementation context.  ",
                'expected_outcome' => "  A coding assistant can understand the intended result.\n",
                'acceptance_criteria' => "  The fields persist on the issue.\nCriteria appear in exports.  ",
            ],
            $admin['csrf'],
        );

        self::assertSame(201, $created->status, json_encode($created->body));
        self::assertSame('The current issue lacks implementation context.', $created->body['issue']['context']);
        self::assertSame('A coding assistant can understand the intended result.', $created->body['issue']['expected_outcome']);
        self::assertSame("The fields persist on the issue.\nCriteria appear in exports.", $created->body['issue']['acceptance_criteria']);
        $issueId = (int) $created->body['issue']['id'];

        $listed = $this->apiCookieRequest('GET', "/api/v1/projects/{$projectId}/issues", $admin['cookie']);
        self::assertSame(200, $listed->status);
        self::assertSame($created->body['issue']['context'], $listed->body['issues'][0]['context']);
        self::assertSame($created->body['issue']['expected_outcome'], $listed->body['issues'][0]['expected_outcome']);
        self::assertSame($created->body['issue']['acceptance_criteria'], $listed->body['issues'][0]['acceptance_criteria']);

        $updated = $this->apiCookieRequest(
            'PATCH',
            "/api/v1/issues/{$issueId}",
            $admin['cookie'],
            [
                'context' => 'Context updated.',
                'expected_outcome' => 'Outcome updated.',
                'acceptance_criteria' => '',
            ],
            $admin['csrf'],
        );
        self::assertSame(200, $updated->status, json_encode($updated->body));
        self::assertSame('Context updated.', $updated->body['issue']['context']);
        self::assertSame('Outcome updated.', $updated->body['issue']['expected_outcome']);
        self::assertSame('', $updated->body['issue']['acceptance_criteria']);

        $invalidType = $this->apiCookieRequest(
            'PATCH',
            "/api/v1/issues/{$issueId}",
            $admin['cookie'],
            ['context' => ['internal' => 'array']],
            $admin['csrf'],
        );
        self::assertSame(422, $invalidType->status);

        $tooLong = $this->apiCookieRequest(
            'PATCH',
            "/api/v1/issues/{$issueId}",
            $admin['cookie'],
            ['acceptance_criteria' => str_repeat('a', 10_001)],
            $admin['csrf'],
        );
        self::assertSame(422, $tooLong->status);
    }

    public function testNonMemberCannotReadOrCreateProjectIssues(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Private issues');
        $existingIssue = $this->apiCookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/issues",
            $admin['cookie'],
            ['title' => 'Private issue'],
            $admin['csrf'],
        );
        self::assertSame(201, $existingIssue->status, json_encode($existingIssue->body));
        $developer = $this->login($this->developerEmail);

        $listed = $this->apiCookieRequest(
            'GET',
            "/api/v1/projects/{$projectId}/issues",
            $developer['cookie'],
        );
        self::assertSame(404, $listed->status);

        $created = $this->apiCookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/issues",
            $developer['cookie'],
            ['title' => 'Should not exist'],
            $developer['csrf'],
        );
        self::assertSame(404, $created->status);

        $updated = $this->apiCookieRequest(
            'PATCH',
            "/api/v1/issues/{$existingIssue->body['issue']['id']}",
            $developer['cookie'],
            ['status' => 'done'],
            $developer['csrf'],
        );
        self::assertSame(404, $updated->status);
        self::assertSame(404, $this->apiCookieRequest(
            'GET',
            "/api/v1/issues/{$existingIssue->body['issue']['id']}/history",
            $developer['cookie'],
        )->status);
    }

    public function testInvalidIssueFieldsAndStatusesAreRejected(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Validation issues');

        $invalidCreate = $this->apiCookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/issues",
            $admin['cookie'],
            ['title' => '  '],
            $admin['csrf'],
        );
        self::assertSame(422, $invalidCreate->status);

        $created = $this->apiCookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/issues",
            $admin['cookie'],
            ['title' => 'Valid issue'],
            $admin['csrf'],
        );
        self::assertSame(201, $created->status, json_encode($created->body));

        $invalidStatus = $this->apiCookieRequest(
            'PATCH',
            "/api/v1/issues/{$created->body['issue']['id']}",
            $admin['cookie'],
            ['status' => 'closed'],
            $admin['csrf'],
        );
        self::assertSame(422, $invalidStatus->status);
    }

    public function testIssueOrderCanBeMovedWithinItsMilestoneAndIsReturnedByTheApi(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Ordered issues');
        $milestone = $this->apiCookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/milestones",
            $admin['cookie'],
            ['name' => 'First delivery', 'due_date' => '2027-01-15'],
            $admin['csrf'],
        );
        self::assertSame(201, $milestone->status, json_encode($milestone->body));
        $milestoneId = (int) $milestone->body['milestone']['id'];

        $issueIds = [];
        foreach (['Prepare release notes', 'Finish sign-in', 'Update screenshots'] as $title) {
            $created = $this->apiCookieRequest(
                'POST',
                "/api/v1/projects/{$projectId}/issues",
                $admin['cookie'],
                ['title' => $title],
                $admin['csrf'],
            );
            self::assertSame(201, $created->status, json_encode($created->body));
            $issueIds[] = (int) $created->body['issue']['id'];
            $updated = $this->apiCookieRequest(
                'PATCH',
                "/api/v1/issues/{$created->body['issue']['id']}",
                $admin['cookie'],
                ['milestone_id' => $milestoneId],
                $admin['csrf'],
            );
            self::assertSame(200, $updated->status, json_encode($updated->body));
        }

        $listed = $this->apiCookieRequest('GET', "/api/v1/projects/{$projectId}/issues", $admin['cookie']);
        self::assertSame(200, $listed->status);
        $initialOrder = array_column($listed->body['issues'], 'sort_order', 'id');
        self::assertLessThan($initialOrder[$issueIds[1]], $initialOrder[$issueIds[0]]);
        self::assertLessThan($initialOrder[$issueIds[2]], $initialOrder[$issueIds[1]]);

        $moveUp = $this->apiCookieRequest(
            'POST', "/api/v1/issues/{$issueIds[1]}/move", $admin['cookie'], ['direction' => 'up'], $admin['csrf'],
        );
        self::assertSame(200, $moveUp->status, json_encode($moveUp->body));
        $afterMove = $this->apiCookieRequest('GET', "/api/v1/projects/{$projectId}/issues", $admin['cookie']);
        $movedOrder = array_column($afterMove->body['issues'], 'sort_order', 'id');
        self::assertLessThan($movedOrder[$issueIds[0]], $movedOrder[$issueIds[1]]);
        self::assertLessThan($movedOrder[$issueIds[2]], $movedOrder[$issueIds[0]]);

        $invalidDirection = $this->apiCookieRequest(
            'POST', "/api/v1/issues/{$issueIds[1]}/move", $admin['cookie'], ['direction' => 'sideways'], $admin['csrf'],
        );
        self::assertSame(422, $invalidDirection->status);
    }

    public function testDeletingMilestoneAppendsItsIssuesInTheirExistingOrder(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Delete milestone order');
        $createIssue = function (string $title, ?int $milestoneId = null) use ($admin, $projectId): int {
            $body = ['title' => $title];
            if ($milestoneId !== null) $body['milestone_id'] = $milestoneId;
            $created = $this->apiCookieRequest(
                'POST',
                "/api/v1/projects/{$projectId}/issues",
                $admin['cookie'],
                $body,
                $admin['csrf'],
            );
            self::assertSame(201, $created->status, json_encode($created->body));
            return (int) $created->body['issue']['id'];
        };
        $existingUnlinked = $createIssue('Already unlinked');
        $milestone = $this->apiCookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/milestones",
            $admin['cookie'],
            ['name' => 'To remove'],
            $admin['csrf'],
        );
        self::assertSame(201, $milestone->status, json_encode($milestone->body));
        $milestoneId = (int) $milestone->body['milestone']['id'];
        $movedIssues = [
            $createIssue('First moved issue', $milestoneId),
            $createIssue('Second moved issue', $milestoneId),
            $createIssue('Third moved issue', $milestoneId),
        ];

        $deleted = $this->apiCookieRequest(
            'DELETE',
            "/api/v1/projects/{$projectId}/milestones/{$milestoneId}",
            $admin['cookie'],
            [],
            $admin['csrf'],
        );
        self::assertSame(204, $deleted->status, json_encode($deleted->body));

        $listed = $this->apiCookieRequest('GET', "/api/v1/projects/{$projectId}/issues", $admin['cookie']);
        self::assertSame(200, $listed->status, json_encode($listed->body));
        $sortOrders = array_column($listed->body['issues'], 'sort_order', 'id');
        self::assertSame(1, $sortOrders[$existingUnlinked]);
        self::assertSame([2, 3, 4], array_map(static fn (int $issueId): int => $sortOrders[$issueId], $movedIssues));
    }

    public function testUnassignedIssuesMoveTogetherIntoAProjectMilestone(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Bulk milestone move');
        $milestone = $this->apiCookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/milestones",
            $admin['cookie'],
            ['name' => 'Next delivery'],
            $admin['csrf'],
        );
        self::assertSame(201, $milestone->status, json_encode($milestone->body));
        $milestoneId = (int) $milestone->body['milestone']['id'];
        $createIssue = function (string $title) use ($admin, $projectId): int {
            $created = $this->apiCookieRequest(
                'POST',
                "/api/v1/projects/{$projectId}/issues",
                $admin['cookie'],
                ['title' => $title],
                $admin['csrf'],
            );
            self::assertSame(201, $created->status, json_encode($created->body));
            return (int) $created->body['issue']['id'];
        };
        $issueIds = [$createIssue('Write the plan'), $createIssue('Review the plan'), $createIssue('Unselected issue')];

        $moved = $this->apiCookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/issues/move-to-milestone",
            $admin['cookie'],
            ['issue_ids' => array_slice($issueIds, 0, 2), 'milestone_id' => $milestoneId],
            $admin['csrf'],
        );
        self::assertSame(200, $moved->status, json_encode($moved->body));
        self::assertSame(2, $moved->body['moved_count']);

        $listed = $this->apiCookieRequest('GET', "/api/v1/projects/{$projectId}/issues", $admin['cookie']);
        self::assertSame(200, $listed->status);
        $byId = array_column($listed->body['issues'], null, 'id');
        self::assertSame($milestoneId, $byId[$issueIds[0]]['milestone_id']);
        self::assertSame($milestoneId, $byId[$issueIds[1]]['milestone_id']);
        self::assertNull($byId[$issueIds[2]]['milestone_id']);
    }

    public function testBulkMilestoneMoveRejectsIssuesFromAnotherProjectWithoutPartialChanges(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Bulk move target');
        $otherProjectId = $this->createProject($admin, 'Bulk move source');
        $targetIssue = $this->apiCookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/issues",
            $admin['cookie'],
            ['title' => 'Stay unassigned after failed move'],
            $admin['csrf'],
        );
        $otherIssue = $this->apiCookieRequest(
            'POST',
            "/api/v1/projects/{$otherProjectId}/issues",
            $admin['cookie'],
            ['title' => 'Wrong project'],
            $admin['csrf'],
        );
        $milestone = $this->apiCookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/milestones",
            $admin['cookie'],
            ['name' => 'Target milestone'],
            $admin['csrf'],
        );
        $moved = $this->apiCookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/issues/move-to-milestone",
            $admin['cookie'],
            [
                'issue_ids' => [$targetIssue->body['issue']['id'], $otherIssue->body['issue']['id']],
                'milestone_id' => $milestone->body['milestone']['id'],
            ],
            $admin['csrf'],
        );

        self::assertSame(404, $moved->status);
        $listed = $this->apiCookieRequest('GET', "/api/v1/projects/{$projectId}/issues", $admin['cookie']);
        self::assertSame(200, $listed->status);
        self::assertNull($listed->body['issues'][0]['milestone_id']);
    }

    public function testProjectMemberCanBulkAssignAndUnassignIssues(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Bulk issue assignment');
        $added = $this->apiCookieRequest(
            'PUT',
            "/api/v1/projects/{$projectId}/members/{$this->developerId}",
            $admin['cookie'],
            [],
            $admin['csrf'],
        );
        self::assertSame(200, $added->status, json_encode($added->body));

        $issueIds = [];
        foreach (['Prepare fixtures', 'Review implementation'] as $title) {
            $created = $this->apiCookieRequest(
                'POST',
                "/api/v1/projects/{$projectId}/issues",
                $admin['cookie'],
                ['title' => $title],
                $admin['csrf'],
            );
            self::assertSame(201, $created->status, json_encode($created->body));
            $issueIds[] = (int) $created->body['issue']['id'];
        }

        $assigned = $this->apiCookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/issues/assign",
            $admin['cookie'],
            ['issue_ids' => $issueIds, 'assignee_id' => $this->developerId],
            $admin['csrf'],
        );
        self::assertSame(200, $assigned->status, json_encode($assigned->body));
        self::assertSame(2, $assigned->body['assigned_count']);

        $developer = $this->login($this->developerEmail);
        $assignmentEvents = $this->apiCookieRequest('GET', '/api/v1/inbox/events', $developer['cookie']);
        self::assertSame(200, $assignmentEvents->status, json_encode($assignmentEvents->body));
        self::assertEqualsCanonicalizing(
            $issueIds,
            array_column($assignmentEvents->body['events'], 'issue_id'),
            'Bulk assignment should notify the newly assigned teammate for each issue.',
        );

        $unassigned = $this->apiCookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/issues/assign",
            $admin['cookie'],
            ['issue_ids' => $issueIds, 'assignee_id' => null],
            $admin['csrf'],
        );
        self::assertSame(200, $unassigned->status, json_encode($unassigned->body));
        self::assertSame(2, $unassigned->body['assigned_count']);

        $listed = $this->apiCookieRequest('GET', "/api/v1/projects/{$projectId}/issues", $admin['cookie']);
        $byId = array_column($listed->body['issues'], null, 'id');
        foreach ($issueIds as $issueId) self::assertNull($byId[$issueId]['assignee_id']);
    }

    public function testBulkIssueAssignmentRejectsMixedProjectsWithoutPartialChanges(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Bulk assignment target');
        $otherProjectId = $this->createProject($admin, 'Bulk assignment source');
        $createIssue = function (int $targetProjectId, string $title) use ($admin): int {
            $created = $this->apiCookieRequest(
                'POST',
                "/api/v1/projects/{$targetProjectId}/issues",
                $admin['cookie'],
                ['title' => $title],
                $admin['csrf'],
            );
            self::assertSame(201, $created->status, json_encode($created->body));
            return (int) $created->body['issue']['id'];
        };
        $targetIssueId = $createIssue($projectId, 'Keep this issue unassigned');
        $otherIssueId = $createIssue($otherProjectId, 'Wrong project');

        $assigned = $this->apiCookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/issues/assign",
            $admin['cookie'],
            ['issue_ids' => [$targetIssueId, $otherIssueId], 'assignee_id' => $this->adminId],
            $admin['csrf'],
        );
        self::assertSame(404, $assigned->status);

        $listed = $this->apiCookieRequest('GET', "/api/v1/projects/{$projectId}/issues", $admin['cookie']);
        self::assertNull($listed->body['issues'][0]['assignee_id']);
    }

    private function testDatabaseConnection(): \PDO
    {
        return Database::connect(
            getenv('TANGENT_TEST_DB_HOST') ?: '127.0.0.1',
            (int) (getenv('TANGENT_TEST_DB_PORT') ?: 3306),
            getenv('TANGENT_TEST_DB_NAME') ?: 'tangent_test_suite',
            getenv('TANGENT_TEST_DB_USER') ?: 'tangent',
            getenv('TANGENT_TEST_DB_PASSWORD') ?: 'tangent_dev_password',
        )->pdo();
    }

    private function cleanCommittedWorkspace(int $workspaceId): void
    {
        $cleanup = $this->testDatabaseConnection();
        $accounts = $cleanup->prepare('SELECT account_id FROM users WHERE workspace_id = :workspace_id');
        $accounts->execute(['workspace_id' => $workspaceId]);
        $accountIds = array_map('intval', $accounts->fetchAll(\PDO::FETCH_COLUMN));

        $cleanup->exec('SET FOREIGN_KEY_CHECKS = 0');
        $tables = $cleanup->query(
            'SELECT TABLE_NAME FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = \'workspace_id\'
             GROUP BY TABLE_NAME'
        )->fetchAll(\PDO::FETCH_COLUMN);
        foreach ($tables as $table) {
            $cleanup->prepare('DELETE FROM `' . str_replace('`', '``', (string) $table) . '` WHERE workspace_id = :workspace_id')
                ->execute(['workspace_id' => $workspaceId]);
        }
        $cleanup->prepare('DELETE FROM workspaces WHERE id = :id')->execute(['id' => $workspaceId]);
        foreach ($accountIds as $accountId) {
            $cleanup->prepare('DELETE FROM user_accounts WHERE id = :id')->execute(['id' => $accountId]);
        }
        $cleanup->exec('SET FOREIGN_KEY_CHECKS = 1');
    }

    private function createProject(array $admin, string $name): int
    {
        $response = $this->cookieRequest(
            'POST',
            '/api/v1/projects',
            $admin['cookie'],
            ['name' => $name],
            $admin['csrf'],
        );
        self::assertSame(201, $response->status, json_encode($response->body));
        return (int) $response->body['project']['id'];
    }

    private function createIssue(array $admin, int $projectId, string $title): int
    {
        $response = $this->apiCookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/issues",
            $admin['cookie'],
            ['title' => $title],
            $admin['csrf'],
        );
        self::assertSame(201, $response->status, json_encode($response->body));

        return (int) $response->body['issue']['id'];
    }

    private function apiCookieRequest(
        string $method,
        string $path,
        string $cookie,
        array $body = [],
        ?string $csrf = null,
    ): Response {
        $headers = [];
        if ($csrf !== null) $headers['X-CSRF-Token'] = $csrf;
        return $this->application->handle(Request::json(
            $method,
            $path,
            $body,
            $headers,
            ['tangent_session' => $cookie],
        ));
    }
}
