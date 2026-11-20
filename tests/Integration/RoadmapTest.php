<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use DateTimeImmutable;
use Tangent\Tests\Support\ApiTestCase;

final class RoadmapTest extends ApiTestCase
{
    public function testTeamRoadmapSummarizesInternalMilestoneWorkAcrossProjects(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Roadmap alpha');
        $unrelatedProjectId = $this->createProject($admin, 'Roadmap private project');
        $this->addMember($admin, $projectId, $this->developerId);
        $guestId = $this->createUser($admin, 'Guest', 'guest-roadmap@example.test', 'guest');
        $this->addMember($admin, $projectId, $guestId);

        $milestoneId = $this->createMilestone($admin, $projectId, 'Shared delivery');
        $privateMilestoneId = $this->createMilestone($admin, $projectId, 'Internal hardening');
        $unrelatedMilestoneId = $this->createMilestone($admin, $unrelatedProjectId, 'Unrelated delivery');

        $this->createIssue($admin, $projectId, 'Completed shared task', $milestoneId, 'done', true);
        $this->createIssue($admin, $projectId, 'SECRET internal task', $milestoneId, 'doing', false, $this->developerId);
        $this->createIssue($admin, $projectId, 'Guest-assigned task', $milestoneId, 'todo', false, $guestId);
        $this->createIssue($admin, $projectId, 'Unassigned task', $milestoneId, 'todo', false);
        $this->createIssue($admin, $projectId, 'Private milestone task', $privateMilestoneId, 'todo', false);
        $this->createIssue($admin, $unrelatedProjectId, 'Unrelated task', $unrelatedMilestoneId, 'todo', false);

        $adminResult = $this->cookieRequest('GET', '/api/v1/roadmap', $admin['cookie']);
        self::assertSame(200, $adminResult->status, json_encode($adminResult->body));
        $this->assertMilestoneSummary($adminResult->body['milestones'], $milestoneId, [
            'project_name' => 'Roadmap alpha',
            'total_tasks' => 4,
            'completed_tasks' => 1,
            'remaining_tasks' => 3,
            'assigned_team_members' => 1,
            'tasks_without_team_assignee' => 2,
        ]);
        self::assertStringNotContainsString('SECRET internal task', json_encode($adminResult->body));
        self::assertCount(3, $adminResult->body['milestones']);

        $developer = $this->login($this->developerEmail);
        $developerResult = $this->cookieRequest('GET', '/api/v1/roadmap', $developer['cookie']);
        self::assertSame(200, $developerResult->status, json_encode($developerResult->body));
        self::assertEqualsCanonicalizing([$milestoneId, $privateMilestoneId], array_column($developerResult->body['milestones'], 'id'));
        self::assertNotContains($unrelatedMilestoneId, array_column($developerResult->body['milestones'], 'id'));

        $guest = $this->login('guest-roadmap@example.test');
        self::assertSame(403, $this->cookieRequest('GET', '/api/v1/roadmap', $guest['cookie'])->status);

    }

    public function testRoadmapOmitsArchivedMilestonesAndProjects(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Roadmap current');
        $archivedProjectId = $this->createProject($admin, 'Roadmap archived');
        $currentId = $this->createMilestone($admin, $projectId, 'Current');
        $archivedId = $this->createMilestone($admin, $projectId, 'Archived milestone');
        $archivedMilestoneUpdate = $this->cookieRequest('PATCH', "/api/v1/projects/{$projectId}/milestones/{$archivedId}", $admin['cookie'], ['archived' => true], $admin['csrf']);
        self::assertSame(200, $archivedMilestoneUpdate->status);
        $archivedProjectUpdate = $this->cookieRequest('PATCH', "/api/v1/projects/{$archivedProjectId}", $admin['cookie'], ['status' => 'archived'], $admin['csrf']);
        self::assertSame(200, $archivedProjectUpdate->status);

        $result = $this->cookieRequest('GET', '/api/v1/roadmap', $admin['cookie']);
        self::assertSame(200, $result->status, json_encode($result->body));
        self::assertSame([$currentId], array_column($result->body['milestones'], 'id'));
    }

    private function assertMilestoneSummary(array $milestones, int $id, array $expected): void
    {
        foreach ($milestones as $milestone) {
            if ($milestone['id'] !== $id) continue;
            foreach ($expected as $field => $value) self::assertSame($value, $milestone[$field]);
            return;
        }
        self::fail("Milestone {$id} was missing from the roadmap.");
    }

    private function createProject(array $user, string $name): int
    {
        $response = $this->cookieRequest('POST', '/api/v1/projects', $user['cookie'], ['name' => $name], $user['csrf']);
        self::assertSame(201, $response->status, json_encode($response->body));
        return (int) $response->body['project']['id'];
    }

    private function createMilestone(array $user, int $projectId, string $name): int
    {
        $date = (new DateTimeImmutable('today'))->modify('+5 days')->format('Y-m-d');
        $response = $this->cookieRequest('POST', "/api/v1/projects/{$projectId}/milestones", $user['cookie'], [
            'name' => $name,
            'due_date' => $date,
        ], $user['csrf']);
        self::assertSame(201, $response->status, json_encode($response->body));
        return (int) $response->body['milestone']['id'];
    }

    private function createIssue(
        array $user,
        int $projectId,
        string $title,
        int $milestoneId,
        string $status,
        bool $shared,
        ?int $assigneeId = null,
    ): int {
        $created = $this->cookieRequest('POST', "/api/v1/projects/{$projectId}/issues", $user['cookie'], [
            'title' => $title,
            'milestone_id' => $milestoneId,
            'is_shared' => $shared,
            'assignee_id' => $assigneeId,
        ], $user['csrf']);
        self::assertSame(201, $created->status, json_encode($created->body));
        $issueId = (int) $created->body['issue']['id'];
        $updated = $this->cookieRequest('PATCH', "/api/v1/issues/{$issueId}", $user['cookie'], ['status' => $status], $user['csrf']);
        self::assertSame(200, $updated->status, json_encode($updated->body));
        return $issueId;
    }

    private function createUser(array $user, string $name, string $email, string $role): int
    {
        $response = $this->cookieRequest('POST', '/api/v1/users', $user['cookie'], [
            'name' => $name,
            'email' => $email,
            'password' => $this->password,
            'role' => $role,
        ], $user['csrf']);
        self::assertSame(201, $response->status, json_encode($response->body));
        return (int) $response->body['user']['id'];
    }

    private function addMember(array $user, int $projectId, int $userId): void
    {
        $response = $this->cookieRequest('PUT', "/api/v1/projects/{$projectId}/members/{$userId}", $user['cookie'], [], $user['csrf']);
        self::assertSame(200, $response->status, json_encode($response->body));
    }
}
