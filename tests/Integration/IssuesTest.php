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

    /** @param array{cookie: string, csrf: string} $admin */
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

    /** @param array<string, mixed> $body */
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
