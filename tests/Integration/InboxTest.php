<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use Tangent\Modules\Issues\IssueRepository;
use Tangent\Tests\Support\ApiTestCase;

final class InboxTest extends ApiTestCase
{
    public function testInboxReturnsOpenAssignedIssuesAcrossVisibleProjectsOnly(): void
    {
        $admin = $this->login($this->adminEmail);
        $firstProjectId = $this->createProject($admin, 'Inbox alpha');
        $secondProjectId = $this->createProject($admin, 'Inbox beta');
        $privateProjectId = $this->createProject($admin, 'Inbox private');
        $this->addDeveloperToProject($admin, $firstProjectId);
        $this->addDeveloperToProject($admin, $secondProjectId);

        $developer = $this->login($this->developerEmail);
        $firstIssue = $this->createAssignedIssue($developer, $firstProjectId, 'Fix login', 'bug');
        $secondIssue = $this->createAssignedIssue($developer, $secondProjectId, 'Study caching', 'research');
        $this->updateIssue($developer, $secondIssue, ['status' => 'testing']);

        $doneIssue = $this->createAssignedIssue($developer, $firstProjectId, 'Ship dashboard');
        $this->updateIssue($developer, $doneIssue, ['status' => 'done']);
        $cancelledIssue = $this->createAssignedIssue($developer, $firstProjectId, 'Old experiment');
        $this->updateIssue($developer, $cancelledIssue, ['status' => 'cancelled']);
        $deletedIssue = $this->createAssignedIssue($developer, $firstProjectId, 'Remove this draft');
        $deleted = $this->cookieRequest(
            'DELETE',
            "/api/v1/issues/{$deletedIssue}",
            $developer['cookie'],
            [],
            $developer['csrf'],
        );
        self::assertSame(204, $deleted->status);

        $privateIssue = $this->insertAssignedIssue($privateProjectId, 'Private legacy issue');
        $response = $this->cookieRequest('GET', '/api/v1/inbox', $developer['cookie']);

        self::assertSame(200, $response->status, json_encode($response->body));
        self::assertEqualsCanonicalizing([$firstIssue, $secondIssue], array_column($response->body['issues'], 'id'));
        self::assertNotContains($privateIssue, array_column($response->body['issues'], 'id'));

        $issueById = [];
        foreach ($response->body['issues'] as $issue) {
            $issueById[$issue['id']] = $issue;
        }
        self::assertSame('Inbox alpha', $issueById[$firstIssue]['project_name']);
        self::assertSame('inbox-alpha', $issueById[$firstIssue]['project_slug']);
        self::assertSame('bug', $issueById[$firstIssue]['type']);
        self::assertSame('backlog', $issueById[$firstIssue]['status']);
        self::assertSame('Inbox beta', $issueById[$secondIssue]['project_name']);
        self::assertSame('research', $issueById[$secondIssue]['type']);
        self::assertSame('testing', $issueById[$secondIssue]['status']);
    }

    public function testInboxRequiresAuthentication(): void
    {
        $response = $this->request('GET', '/api/v1/inbox');

        self::assertSame(401, $response->status);
    }

    public function testInboxIncludesMilestoneDetailsForAssignedIssues(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Inbox milestone details');
        $this->addDeveloperToProject($admin, $projectId);
        $milestone = $this->cookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/milestones",
            $admin['cookie'],
            ['name' => 'First delivery', 'due_date' => '2027-01-15'],
            $admin['csrf'],
        );
        self::assertSame(201, $milestone->status, json_encode($milestone->body));

        $developer = $this->login($this->developerEmail);
        $issueId = $this->createAssignedIssue($developer, $projectId, 'Prepare release');
        $this->updateIssue($developer, $issueId, ['milestone_id' => $milestone->body['milestone']['id']]);
        $response = $this->cookieRequest('GET', '/api/v1/inbox', $developer['cookie']);

        self::assertSame(200, $response->status, json_encode($response->body));
        self::assertSame('First delivery', $response->body['issues'][0]['milestone_name']);
        self::assertSame('2027-01-15', $response->body['issues'][0]['milestone_due_date']);
    }

    public function testTaskInboxRevisionTracksVisibleFieldsDiscussionMilestonesAndProjectScope(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Task revision project');
        $this->addDeveloperToProject($admin, $projectId);
        $milestone = $this->cookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/milestones",
            $admin['cookie'],
            ['name' => 'First delivery', 'due_date' => '2027-01-15'],
            $admin['csrf'],
        );
        self::assertSame(201, $milestone->status, json_encode($milestone->body));

        $developer = $this->login($this->developerEmail);
        $issueId = $this->createAssignedIssue($developer, $projectId, 'Prepare release');
        $this->updateIssue($developer, $issueId, ['milestone_id' => $milestone->body['milestone']['id']]);
        $repository = new IssueRepository($this->pdo);
        $initialRevision = $repository->taskCollectionRevision($this->workspaceId, [$projectId]);
        $initial = $this->listInbox($developer);
        self::assertSame(200, $initial->status, json_encode($initial->body));
        $etag = $initial->headers['etag'];
        self::assertSame(304, $this->listInbox($developer, $etag)->status);

        $this->updateIssue($developer, $issueId, ['title' => 'Prepare production release']);
        self::assertNotSame($initialRevision, $repository->taskCollectionRevision($this->workspaceId, [$projectId]));
        $changedIssue = $this->listInbox($developer, $etag);
        self::assertSame(200, $changedIssue->status);
        self::assertSame('Prepare production release', $changedIssue->body['issues'][0]['title']);
        $etag = $changedIssue->headers['etag'];

        $milestoneUpdate = $this->cookieRequest(
            'PATCH',
            "/api/v1/projects/{$projectId}/milestones/{$milestone->body['milestone']['id']}",
            $admin['cookie'],
            ['name' => 'Second delivery', 'due_date' => '2027-02-15'],
            $admin['csrf'],
        );
        self::assertSame(200, $milestoneUpdate->status, json_encode($milestoneUpdate->body));
        $changedMilestone = $this->listInbox($developer, $etag);
        self::assertSame(200, $changedMilestone->status);
        self::assertSame('Second delivery', $changedMilestone->body['issues'][0]['milestone_name']);
        self::assertSame('2027-02-15', $changedMilestone->body['issues'][0]['milestone_due_date']);
        $etag = $changedMilestone->headers['etag'];

        $projectUpdate = $this->cookieRequest(
            'PATCH', "/api/v1/projects/{$projectId}", $admin['cookie'], ['name' => 'Renamed task project'], $admin['csrf'],
        );
        self::assertSame(200, $projectUpdate->status, json_encode($projectUpdate->body));
        $changedProject = $this->listInbox($developer, $etag);
        self::assertSame(200, $changedProject->status);
        self::assertSame('Renamed task project', $changedProject->body['issues'][0]['project_name']);
        $etag = $changedProject->headers['etag'];

        $discussion = $this->cookieRequest(
            'POST', "/api/v1/issues/{$issueId}/discussion", $developer['cookie'], ['body' => 'Release is ready.'], $developer['csrf'],
        );
        self::assertSame(201, $discussion->status, json_encode($discussion->body));
        $changedDiscussion = $this->listInbox($developer, $etag);
        self::assertSame(200, $changedDiscussion->status);
        self::assertSame(1, $changedDiscussion->body['issues'][0]['discussion_count']);
        $etag = $changedDiscussion->headers['etag'];

        $removed = $this->cookieRequest(
            'DELETE', "/api/v1/projects/{$projectId}/members/{$this->developerId}", $admin['cookie'], [], $admin['csrf'],
        );
        self::assertSame(204, $removed->status);
        $changedScope = $this->listInbox($developer, $etag);
        self::assertSame(200, $changedScope->status);
        self::assertSame([], $changedScope->body['issues']);
        self::assertNotSame($etag, $changedScope->headers['etag'] ?? null);
    }

    private function listInbox(array $user, ?string $etag = null): \Tangent\Core\Response
    {
        $headers = $etag === null ? [] : ['If-None-Match' => $etag];
        return $this->request('GET', '/api/v1/inbox', [], $headers, ['tangent_session' => $user['cookie']]);
    }

    private function createProject(array $admin, string $name): int
    {
        $response = $this->cookieRequest('POST', '/api/v1/projects', $admin['cookie'], ['name' => $name], $admin['csrf']);
        self::assertSame(201, $response->status, json_encode($response->body));
        return (int) $response->body['project']['id'];
    }

    private function addDeveloperToProject(array $admin, int $projectId): void
    {
        $response = $this->cookieRequest(
            'PUT',
            "/api/v1/projects/{$projectId}/members/{$this->developerId}",
            $admin['cookie'],
            [],
            $admin['csrf'],
        );
        self::assertSame(200, $response->status);
    }

    private function createAssignedIssue(
        array $developer,
        int $projectId,
        string $title,
        string $type = 'task',
    ): int {
        $response = $this->cookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/issues",
            $developer['cookie'],
            ['title' => $title, 'type' => $type, 'assignee_id' => $this->developerId],
            $developer['csrf'],
        );
        self::assertSame(201, $response->status, json_encode($response->body));
        return (int) $response->body['issue']['id'];
    }

    private function updateIssue(array $developer, int $issueId, array $fields): void
    {
        $response = $this->cookieRequest(
            'PATCH',
            "/api/v1/issues/{$issueId}",
            $developer['cookie'],
            $fields,
            $developer['csrf'],
        );
        self::assertSame(200, $response->status, json_encode($response->body));
    }

    private function insertAssignedIssue(int $projectId, string $title): int
    {
        $statement = $this->pdo->prepare(
            "INSERT INTO issues (workspace_id, project_id, title, description, issue_type, status, created_by, assignee_id)
             VALUES (:workspace_id, :project_id, :title, '', 'feature', 'todo', :created_by, :assignee_id)"
        );
        $statement->execute([
            'workspace_id' => $this->workspaceId,
            'project_id' => $projectId,
            'title' => $title,
            'created_by' => $this->adminId,
            'assignee_id' => $this->developerId,
        ]);
        return (int) $this->pdo->lastInsertId();
    }
}
