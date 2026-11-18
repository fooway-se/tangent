<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use Tangent\Tests\Support\ApiTestCase;

final class ProjectLifecycleTest extends ApiTestCase
{
    public function testProjectStatesCanBeChangedAndPausedProjectsRemainEditable(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Lifecycle project');

        $paused = $this->updateProject($admin, $projectId, ['status' => 'paused']);
        self::assertSame('paused', $paused->body['project']['status']);
        self::assertSame(201, $this->createIssue($admin, $projectId, 'Paused project follow-up')->status);

        $completed = $this->updateProject($admin, $projectId, ['status' => 'completed']);
        self::assertSame('completed', $completed->body['project']['status']);
        self::assertSame(200, $this->cookieRequest('GET', "/api/v1/projects/{$projectId}/issues", $admin['cookie'])->status);
        self::assertSame(409, $this->createIssue($admin, $projectId, 'Blocked while completed')->status);
        self::assertSame(409, $this->cookieRequest(
            'PATCH',
            "/api/v1/projects/{$projectId}",
            $admin['cookie'],
            ['name' => 'Renamed after completion', 'status' => 'completed'],
            $admin['csrf'],
        )->status);
        self::assertSame(409, $this->cookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/messages",
            $admin['cookie'],
            ['body' => 'New team message after completion'],
            $admin['csrf'],
        )->status);

        $reopened = $this->updateProject($admin, $projectId, ['status' => 'active']);
        self::assertSame('active', $reopened->body['project']['status']);
        self::assertSame(201, $this->createIssue($admin, $projectId, 'Reopened project work')->status);

        $this->updateProject($admin, $projectId, ['status' => 'paused']);
        $archived = $this->updateProject($admin, $projectId, ['status' => 'archived']);
        self::assertSame('archived', $archived->body['project']['status']);
        self::assertSame('paused', $archived->body['project']['archived_from_status']);
        self::assertSame(409, $this->createIssue($admin, $projectId, 'Blocked while archived')->status);
        self::assertSame(409, $this->cookieRequest(
            'PATCH',
            "/api/v1/projects/{$projectId}",
            $admin['cookie'],
            ['name' => 'Renamed while archived', 'status' => 'archived'],
            $admin['csrf'],
        )->status);
        $restored = $this->updateProject($admin, $projectId, ['status' => 'paused']);
        self::assertSame('paused', $restored->body['project']['status']);
        self::assertNull($restored->body['project']['archived_from_status']);
    }

    public function testCompletedProjectRemainsReadableToAnExistingGuestButIsReadOnly(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Completed client project');
        $guestId = $this->createUser($admin, 'Customer', 'customer@example.test', 'guest');
        $this->addMember($admin, $projectId, $guestId);
        $guest = $this->login('customer@example.test');
        $issueId = $this->createIssue($admin, $projectId, 'Awaiting approval')->body['issue']['id'];
        $this->updateIssue($admin, $issueId, ['is_shared' => true, 'approval_requested' => true]);
        $this->updateProject($admin, $projectId, ['status' => 'completed']);

        $clientView = $this->cookieRequest('GET', "/api/v1/projects/{$projectId}/client-view", $guest['cookie']);
        self::assertSame(200, $clientView->status);
        self::assertSame('completed', $clientView->body['project']['status']);
        $guestProjects = $this->cookieRequest('GET', '/api/v1/projects', $guest['cookie']);
        self::assertSame([$projectId], array_column($guestProjects->body['projects'], 'id'));
        self::assertSame(409, $this->cookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/client-comments",
            $guest['cookie'],
            ['body' => 'Please add one more feature.'],
            $guest['csrf'],
        )->status);
        self::assertSame(409, $this->cookieRequest(
            'POST',
            "/api/v1/approvals/{$issueId}/approve",
            $guest['cookie'],
            [],
            $guest['csrf'],
        )->status);
        self::assertSame(409, $this->cookieRequest(
            'PUT',
            "/api/v1/projects/{$projectId}/notes",
            $admin['cookie'],
            ['notes' => 'New notes after completion'],
            $admin['csrf'],
        )->status);

        $this->updateProject($admin, $projectId, ['status' => 'active']);
        self::assertSame(201, $this->cookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/client-comments",
            $guest['cookie'],
            ['body' => 'The client is back.'],
            $guest['csrf'],
        )->status);

        $this->updateProject($admin, $projectId, ['status' => 'archived']);
        $archivedView = $this->cookieRequest('GET', "/api/v1/projects/{$projectId}/client-view", $guest['cookie']);
        self::assertSame(200, $archivedView->status);
        self::assertSame('archived', $archivedView->body['project']['status']);
        self::assertSame(409, $this->cookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/client-comments",
            $guest['cookie'],
            ['body' => 'Please continue this work.'],
            $guest['csrf'],
        )->status);
    }

    private function createProject(array $admin, string $name): int
    {
        $response = $this->cookieRequest('POST', '/api/v1/projects', $admin['cookie'], ['name' => $name], $admin['csrf']);
        self::assertSame(201, $response->status, json_encode($response->body));
        return (int) $response->body['project']['id'];
    }

    private function updateProject(array $admin, int $projectId, array $fields): \Tangent\Core\Response
    {
        $response = $this->cookieRequest('PATCH', "/api/v1/projects/{$projectId}", $admin['cookie'], $fields, $admin['csrf']);
        self::assertSame(200, $response->status, json_encode($response->body));
        return $response;
    }

    private function createUser(array $admin, string $name, string $email, string $role): int
    {
        $response = $this->cookieRequest('POST', '/api/v1/users', $admin['cookie'], [
            'name' => $name,
            'email' => $email,
            'password' => $this->password,
            'role' => $role,
        ], $admin['csrf']);
        self::assertSame(201, $response->status, json_encode($response->body));
        return (int) $response->body['user']['id'];
    }

    private function addMember(array $admin, int $projectId, int $userId): void
    {
        $response = $this->cookieRequest(
            'PUT',
            "/api/v1/projects/{$projectId}/members/{$userId}",
            $admin['cookie'],
            [],
            $admin['csrf'],
        );
        self::assertSame(200, $response->status, json_encode($response->body));
    }

    private function createIssue(array $user, int $projectId, string $title): \Tangent\Core\Response
    {
        return $this->cookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/issues",
            $user['cookie'],
            ['title' => $title],
            $user['csrf'],
        );
    }

    private function updateIssue(array $user, int $issueId, array $fields): void
    {
        $response = $this->cookieRequest('PATCH', "/api/v1/issues/{$issueId}", $user['cookie'], $fields, $user['csrf']);
        self::assertSame(200, $response->status, json_encode($response->body));
    }
}
