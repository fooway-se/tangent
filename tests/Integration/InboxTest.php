<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

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
    }

    public function testInboxRequiresAuthentication(): void
    {
        $response = $this->request('GET', '/api/v1/inbox');

        self::assertSame(401, $response->status);
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
