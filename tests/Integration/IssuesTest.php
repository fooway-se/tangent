<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use Tangent\Core\Request;
use Tangent\Core\Response;
use Tangent\Tests\Support\ApiTestCase;

final class IssuesTest extends ApiTestCase
{
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

        foreach (['todo', 'doing', 'done'] as $status) {
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
        self::assertCount(3, $history->body['transitions']);
        self::assertSame(['done', 'doing', 'todo'], array_column($history->body['transitions'], 'to_status'));
        self::assertSame(['doing', 'todo', 'backlog'], array_column($history->body['transitions'], 'from_status'));
        self::assertSame(['Admin', 'Admin', 'Admin'], array_column($history->body['transitions'], 'actor_name'));
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
