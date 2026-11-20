<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use DateTimeImmutable;
use Tangent\Tests\Support\ApiTestCase;

final class GuestViewTest extends ApiTestCase
{
    public function testGuestClientViewOnlyReturnsSharedIssuesAndSharedProgress(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Client project');
        $guestId = $this->createUser($admin, 'Customer', 'customer@example.test', 'guest');
        $this->addMember($admin, $projectId, $guestId);
        $guest = $this->login('customer@example.test');
        $milestone = $this->createMilestone($admin, $projectId, 'Beta launch');
        $internalMilestone = $this->createMilestone($admin, $projectId, 'SECRET INTERNAL MILESTONE');

        $done = $this->createIssue($admin, $projectId, 'Shared foundation');
        $this->updateIssue($admin, $done, [
            'status' => 'done',
            'is_shared' => true,
            'milestone_id' => $milestone,
        ]);
        $approval = $this->createIssue($admin, $projectId, 'Shared approval item');
        $this->updateIssue($admin, $approval, [
            'status' => 'testing',
            'is_shared' => true,
            'milestone_id' => $milestone,
            'approval_requested' => true,
        ]);
        $internal = $this->createIssue($admin, $projectId, 'SECRET INTERNAL ISSUE TITLE');
        $this->updateIssue($admin, $internal, ['status' => 'done', 'milestone_id' => $internalMilestone]);

        self::assertSame(404, $this->cookieRequest(
            'GET',
            "/api/v1/issues/{$internal}/history",
            $guest['cookie'],
        )->status);

        $response = $this->cookieRequest('GET', "/api/v1/projects/{$projectId}/client-view", $guest['cookie']);
        self::assertSame(200, $response->status, json_encode($response->body));
        self::assertSame('Client project', $response->body['project']['name']);
        self::assertSame(50, $response->body['progress']['percent']);
        self::assertSame(1, $response->body['progress']['done']);
        self::assertSame(2, $response->body['progress']['total']);
        self::assertSame(1, $response->body['completed_this_week']);
        self::assertSame('Beta launch', $response->body['next_milestone']['name']);
        self::assertNotContains($internalMilestone, array_column($response->body['milestones'], 'id'));
        self::assertStringNotContainsString('SECRET INTERNAL MILESTONE', json_encode($response->body));
        self::assertCount(1, $response->body['approvals']);
        self::assertSame($approval, $response->body['approvals'][0]['id']);
        self::assertEqualsCanonicalizing([$done, $approval], array_column($response->body['items'], 'id'));
        self::assertStringNotContainsString('SECRET INTERNAL ISSUE TITLE', json_encode($response->body));
        self::assertSame('done', $this->itemById($response->body['items'], $done)['status']);
        self::assertSame('doing', $this->itemById($response->body['items'], $approval)['status']);
        self::assertSame($milestone, $this->itemById($response->body['items'], $done)['milestone_id']);
        self::assertNotContains($internalMilestone, array_column($response->body['items'], 'milestone_id'));
        self::assertSame('Beta launch', $this->itemById($response->body['items'], $approval)['milestone_name']);
        self::assertNotContains('SECRET INTERNAL ISSUE TITLE', array_column($response->body['updates'], 'text'));

        $projects = $this->cookieRequest('GET', '/api/v1/projects', $guest['cookie']);
        self::assertSame(200, $projects->status);
        self::assertSame([['id' => $projectId, 'name' => 'Client project', 'slug' => 'client-project']], $projects->body['projects']);
    }

    public function testGuestCanCommentButCannotReadInternalProjectContent(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Client comments');
        $guestId = $this->createUser($admin, 'Customer', 'customer@example.test', 'guest');
        $this->addMember($admin, $projectId, $guestId);
        $guest = $this->login('customer@example.test');

        $empty = $this->cookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/client-comments",
            $guest['cookie'],
            ['body' => '   '],
            $guest['csrf'],
        );
        self::assertSame(422, $empty->status);

        $comment = $this->cookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/client-comments",
            $guest['cookie'],
            ['body' => 'Please include the due date.'],
            $guest['csrf'],
        );
        self::assertSame(201, $comment->status, json_encode($comment->body));
        self::assertSame('Please include the due date.', $comment->body['message']['body']);
        self::assertSame('guest', $comment->body['message']['author_role']);

        $reply = $this->cookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/messages",
            $admin['cookie'],
            ['body' => 'We will add it today.', 'parent_id' => $comment->body['message']['id']],
            $admin['csrf'],
        );
        self::assertSame(201, $reply->status, json_encode($reply->body));
        self::assertSame('admin', $reply->body['message']['author_role']);
        self::assertTrue($reply->body['message']['is_client_visible']);
        $legacyReply = $this->pdo->prepare(
            'UPDATE messages SET is_client_visible = 0 WHERE workspace_id = :workspace_id AND id = :id'
        );
        $legacyReply->execute(['workspace_id' => $this->workspaceId, 'id' => $reply->body['message']['id']]);
        $visibilityMigration = file_get_contents(
            dirname(__DIR__, 2) . '/migrations/023_index_client_conversation_visibility.sql'
        );
        self::assertIsString($visibilityMigration);
        $this->pdo->exec(trim(explode(';', $visibilityMigration, 2)[0]));
        $nestedReply = $this->cookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/messages",
            $admin['cookie'],
            ['body' => 'The nested answer is still public.', 'parent_id' => $reply->body['message']['id']],
            $admin['csrf'],
        );
        self::assertSame(201, $nestedReply->status, json_encode($nestedReply->body));
        self::assertTrue($nestedReply->body['message']['is_client_visible']);
        $internal = $this->cookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/messages",
            $admin['cookie'],
            ['body' => 'SECRET INTERNAL DISCUSSION'],
            $admin['csrf'],
        );
        self::assertSame(201, $internal->status, json_encode($internal->body));

        $clientView = $this->cookieRequest('GET', "/api/v1/projects/{$projectId}/client-view", $guest['cookie']);
        self::assertSame(200, $clientView->status, json_encode($clientView->body));
        self::assertSame(
            ['Please include the due date.', 'We will add it today.', 'The nested answer is still public.'],
            array_column($clientView->body['messages'], 'body'),
        );
        self::assertNotContains('SECRET INTERNAL DISCUSSION', array_column($clientView->body['messages'], 'body'));

        $visibility = $this->pdo->prepare(
            'SELECT is_client_visible FROM messages WHERE workspace_id = :workspace_id AND id = :id'
        );
        $visibility->execute(['workspace_id' => $this->workspaceId, 'id' => $comment->body['message']['id']]);
        self::assertSame(1, (int) $visibility->fetchColumn());

        self::assertSame(404, $this->cookieRequest('GET', "/api/v1/projects/{$projectId}/messages", $guest['cookie'])->status);
        self::assertSame(404, $this->cookieRequest('GET', "/api/v1/projects/{$projectId}/issues", $guest['cookie'])->status);

        $memberMessages = $this->cookieRequest('GET', "/api/v1/projects/{$projectId}/messages", $admin['cookie']);
        self::assertSame(200, $memberMessages->status);
        self::assertContains('Please include the due date.', array_column($memberMessages->body['messages'], 'body'));
        $replyInHistory = array_values(array_filter(
            $memberMessages->body['messages'],
            static fn (array $message): bool => $message['id'] === $reply->body['message']['id'],
        ))[0];
        self::assertTrue($replyInHistory['is_client_visible']);
        self::assertSame('admin', $replyInHistory['author_role']);

        $events = $this->cookieRequest('GET', '/api/v1/events', $admin['cookie']);
        self::assertSame(200, $events->status);
        $replyEvent = array_values(array_filter(
            $events->body['events'],
            static fn (array $event): bool => $event['id'] === $reply->body['message']['id'],
        ))[0];
        self::assertTrue($replyEvent['is_client_visible']);
        self::assertSame('admin', $replyEvent['author_role']);
    }

    public function testApprovalCanOnlyBeRecordedOnceForARequestedSharedIssue(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Client approval');
        $guestId = $this->createUser($admin, 'Customer', 'customer@example.test', 'guest');
        $this->addMember($admin, $projectId, $guestId);
        $guest = $this->login('customer@example.test');
        $developer = $this->login($this->developerEmail);

        $requested = $this->createIssue($admin, $projectId, 'Ready for sign-off');
        $this->updateIssue($admin, $requested, ['is_shared' => true, 'approval_requested' => true]);
        $internal = $this->createIssue($admin, $projectId, 'Internal draft');
        $this->updateIssue($admin, $internal, ['approval_requested' => true]);

        $approved = $this->cookieRequest(
            'POST',
            "/api/v1/approvals/{$requested}/approve",
            $guest['cookie'],
            [],
            $guest['csrf'],
        );
        self::assertSame(200, $approved->status, json_encode($approved->body));
        $again = $this->cookieRequest(
            'POST',
            "/api/v1/approvals/{$requested}/approve",
            $guest['cookie'],
            [],
            $guest['csrf'],
        );
        self::assertSame(409, $again->status);

        $internalApproval = $this->cookieRequest(
            'POST',
            "/api/v1/approvals/{$internal}/approve",
            $guest['cookie'],
            [],
            $guest['csrf'],
        );
        self::assertSame(404, $internalApproval->status);
        $developerApproval = $this->cookieRequest(
            'POST',
            "/api/v1/approvals/{$requested}/approve",
            $developer['cookie'],
            [],
            $developer['csrf'],
        );
        self::assertContains($developerApproval->status, [403, 404]);
    }

    public function testGuestCannotUseInternalRoutesOrManageMilestones(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Guest permissions');
        $guestId = $this->createUser($admin, 'Customer', 'customer@example.test', 'guest');
        $this->addMember($admin, $projectId, $guestId);
        $guest = $this->login('customer@example.test');

        foreach ([
            '/api/v1/users',
            '/api/v1/tokens',
            '/api/v1/workspaces',
            "/api/v1/projects/{$projectId}/members",
            "/api/v1/projects/{$projectId}/issues",
            "/api/v1/projects/{$projectId}/messages",
            "/api/v1/projects/{$projectId}",
            '/api/v1/inbox',
            '/api/v1/inbox/events',
        ] as $path) {
            $response = $this->cookieRequest('GET', $path, $guest['cookie']);
            self::assertContains($response->status, [403, 404], $path);
        }

        self::assertSame(403, $this->cookieRequest(
            'POST', '/api/v1/tokens', $guest['cookie'], ['label' => 'Guest token'], $guest['csrf'],
        )->status);
        self::assertSame(403, $this->cookieRequest(
            'POST', "/api/v1/projects/{$projectId}/milestones", $guest['cookie'], ['name' => 'No'], $guest['csrf'],
        )->status);
        self::assertSame(403, $this->cookieRequest('GET', "/api/v1/projects/{$projectId}/milestones", $guest['cookie'])->status);
        self::assertSame(404, $this->cookieRequest(
            'GET', '/api/v1/projects/999999/client-view', $guest['cookie'],
        )->status);
    }

    public function testMilestonesCanBeManagedByProjectMembersAndDeletingOneUnlinksIssues(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Milestone API');
        $developerId = $this->createDeveloper($admin, 'Developer Two', 'developer2@example.test', 'developer');
        $this->addMember($admin, $projectId, $developerId);
        $developer = $this->login('developer2@example.test');

        $created = $this->cookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/milestones",
            $developer['cookie'],
            ['name' => 'First delivery', 'due_date' => '2026-12-01'],
            $developer['csrf'],
        );
        self::assertSame(201, $created->status, json_encode($created->body));
        $milestoneId = $created->body['milestone']['id'];

        $issueId = $this->createIssue($developer, $projectId, 'Milestone item');
        $this->updateIssue($developer, $issueId, ['milestone_id' => $milestoneId]);
        $listed = $this->cookieRequest('GET', "/api/v1/projects/{$projectId}/milestones", $developer['cookie']);
        self::assertSame(200, $listed->status);
        self::assertSame('First delivery', $listed->body['milestones'][0]['name']);

        $updated = $this->cookieRequest(
            'PATCH',
            "/api/v1/projects/{$projectId}/milestones/{$milestoneId}",
            $developer['cookie'],
            ['name' => 'Updated delivery'],
            $developer['csrf'],
        );
        self::assertSame(200, $updated->status);
        self::assertSame('Updated delivery', $updated->body['milestone']['name']);

        $deleted = $this->cookieRequest(
            'DELETE',
            "/api/v1/projects/{$projectId}/milestones/{$milestoneId}",
            $admin['cookie'],
            [],
            $admin['csrf'],
        );
        self::assertSame(204, $deleted->status);
        $clientView = $this->cookieRequest('GET', "/api/v1/projects/{$projectId}/client-view", $admin['cookie']);
        self::assertSame(200, $clientView->status);
    }

    public function testIncompleteMilestoneCanBeArchivedAndRestoredWithoutHidingClientHistory(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Deferred milestone');
        $guestId = $this->createUser($admin, 'Customer', 'customer@example.test', 'guest');
        $this->addMember($admin, $projectId, $guestId);
        $guest = $this->login('customer@example.test');
        $milestoneId = $this->createMilestone($admin, $projectId, 'Later delivery');
        $issueId = $this->createIssue($admin, $projectId, 'Work to resume later');
        $this->updateIssue($admin, $issueId, [
            'status' => 'backlog',
            'is_shared' => true,
            'milestone_id' => $milestoneId,
        ]);

        $invalid = $this->cookieRequest(
            'PATCH',
            "/api/v1/projects/{$projectId}/milestones/{$milestoneId}",
            $admin['cookie'],
            ['name' => 'Must remain unchanged', 'archived' => 'yes'],
            $admin['csrf'],
        );
        self::assertSame(422, $invalid->status);

        $archived = $this->cookieRequest(
            'PATCH',
            "/api/v1/projects/{$projectId}/milestones/{$milestoneId}",
            $admin['cookie'],
            ['archived' => true],
            $admin['csrf'],
        );
        self::assertSame(200, $archived->status, json_encode($archived->body));
        self::assertNotNull($archived->body['milestone']['archived_at']);
        self::assertSame('Later delivery', $archived->body['milestone']['name']);

        $listed = $this->cookieRequest('GET', "/api/v1/projects/{$projectId}/issues", $admin['cookie']);
        self::assertSame(200, $listed->status);
        self::assertContains($issueId, array_column($listed->body['issues'], 'id'));
        $clientView = $this->cookieRequest('GET', "/api/v1/projects/{$projectId}/client-view", $guest['cookie']);
        self::assertSame(200, $clientView->status);
        self::assertContains($milestoneId, array_column($clientView->body['milestones'], 'id'));
        self::assertContains($issueId, array_column($clientView->body['items'], 'id'));

        $restored = $this->cookieRequest(
            'PATCH',
            "/api/v1/projects/{$projectId}/milestones/{$milestoneId}",
            $admin['cookie'],
            ['archived' => false],
            $admin['csrf'],
        );
        self::assertSame(200, $restored->status, json_encode($restored->body));
        self::assertNull($restored->body['milestone']['archived_at']);
    }

    private function createProject(array $admin, string $name): int
    {
        $response = $this->cookieRequest('POST', '/api/v1/projects', $admin['cookie'], ['name' => $name], $admin['csrf']);
        self::assertSame(201, $response->status, json_encode($response->body));
        return (int) $response->body['project']['id'];
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

    private function createDeveloper(array $admin, string $name, string $email, string $role): int
    {
        return $this->createUser($admin, $name, $email, $role);
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

    private function createMilestone(array $user, int $projectId, string $name): int
    {
        $date = (new DateTimeImmutable('tomorrow'))->modify('+14 days')->format('Y-m-d');
        $response = $this->cookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/milestones",
            $user['cookie'],
            ['name' => $name, 'due_date' => $date],
            $user['csrf'],
        );
        self::assertSame(201, $response->status, json_encode($response->body));
        return (int) $response->body['milestone']['id'];
    }

    private function createIssue(array $user, int $projectId, string $title): int
    {
        $response = $this->cookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/issues",
            $user['cookie'],
            ['title' => $title],
            $user['csrf'],
        );
        self::assertSame(201, $response->status, json_encode($response->body));
        return (int) $response->body['issue']['id'];
    }

    private function updateIssue(array $user, int $issueId, array $fields): void
    {
        $response = $this->cookieRequest(
            'PATCH',
            "/api/v1/issues/{$issueId}",
            $user['cookie'],
            $fields,
            $user['csrf'],
        );
        self::assertSame(200, $response->status, json_encode($response->body));
    }

    private function itemById(array $items, int $id): array
    {
        foreach ($items as $item) {
            if ($item['id'] === $id) return $item;
        }
        self::fail("Expected client item {$id}");
    }
}
