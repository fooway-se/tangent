<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use Tangent\Core\Response;
use Tangent\Tests\Support\ApiTestCase;

final class InboxEventsTest extends ApiTestCase
{
    public function testMentionsAndRepliesNotifyProjectParticipantsWithoutDuplicates(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Inbox conversations');
        $secondDeveloper = $this->createDeveloper($admin, 'Mira Fox', 'mira@example.test');
        $outsider = $this->createDeveloper($admin, 'Outside Person', 'outside@example.test');
        $this->addMember($admin, $projectId, $this->developerId);
        $this->addMember($admin, $projectId, $secondDeveloper);

        $developer = $this->login($this->developerEmail);
        $mira = $this->login('mira@example.test');

        $mention = $this->sendMessage($projectId, $developer, ['body' => 'Could you check this, @Mira?']);
        self::assertSame(201, $mention->status, json_encode($mention->body));
        $sourceMessage = $this->cookieRequest(
            'GET',
            "/api/v1/projects/{$projectId}/messages/{$mention->body['message']['id']}",
            $developer['cookie'],
        );
        self::assertSame(200, $sourceMessage->status, json_encode($sourceMessage->body));
        self::assertSame('Could you check this, @Mira?', $sourceMessage->body['message']['body']);
        self::assertSame(404, $this->cookieRequest(
            'GET',
            "/api/v1/projects/{$projectId}/messages/{$mention->body['message']['id']}",
            $this->login('outside@example.test')['cookie'],
        )->status);
        $miraEvents = $this->events($mira['cookie']);
        self::assertCount(1, $miraEvents);
        self::assertSame('mention', $miraEvents[0]['type']);
        self::assertSame($mention->body['message']['id'], $miraEvents[0]['message_id']);
        self::assertSame('Inbox conversations', $miraEvents[0]['project_name']);
        self::assertSame('Developer', $miraEvents[0]['actor_name']);
        self::assertSame([], $this->events($developer['cookie']));
        self::assertSame([], $this->events($this->login('outside@example.test')['cookie']));

        $root = $this->sendMessage($projectId, $developer, ['body' => 'Please review the layout.']);
        self::assertSame(201, $root->status, json_encode($root->body));
        $replyWithMention = $this->sendMessage($projectId, $mira, [
            'body' => 'I am on it, @Developer.',
            'parent_id' => $root->body['message']['id'],
        ]);
        self::assertSame(201, $replyWithMention->status, json_encode($replyWithMention->body));
        $reply = $this->sendMessage($projectId, $mira, [
            'body' => 'The layout is fixed.',
            'parent_id' => $root->body['message']['id'],
        ]);

        $developerEvents = $this->events($developer['cookie']);
        $forMentionedReply = array_values(array_filter(
            $developerEvents,
            static fn (array $event): bool => $event['message_id'] === $replyWithMention->body['message']['id'],
        ));
        self::assertCount(1, $forMentionedReply, json_encode($developerEvents));
        self::assertSame('mention', $forMentionedReply[0]['type']);
        self::assertNotSame($replyWithMention->body['message']['id'], $reply->body['message']['id']);
        self::assertContains('reply', array_column($developerEvents, 'type'));
    }

    public function testIssueAssignmentAndStatusEventsGoToTheRightUsers(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Inbox issue events');
        $secondDeveloperId = $this->createDeveloper($admin, 'Mira Fox', 'mira@example.test');
        $this->addMember($admin, $projectId, $this->developerId);
        $this->addMember($admin, $projectId, $secondDeveloperId);

        $developer = $this->login($this->developerEmail);
        $mira = $this->login('mira@example.test');
        $issue = $this->createIssue($developer, $projectId, 'Review deployment', $secondDeveloperId);

        $miraEvents = $this->events($mira['cookie']);
        self::assertCount(1, $miraEvents);
        self::assertSame('assigned', $miraEvents[0]['type']);
        self::assertSame($issue, $miraEvents[0]['issue_id']);
        self::assertSame([], $this->events($developer['cookie']));

        $selfAssigned = $this->createIssue($developer, $projectId, 'My own follow-up', $this->developerId);
        self::assertNotContains($selfAssigned, array_column($this->events($developer['cookie']), 'issue_id'));

        $updated = $this->patchIssue($admin, $issue, ['status' => 'doing']);
        self::assertSame(200, $updated->status, json_encode($updated->body));
        $developerStatusEvents = array_values(array_filter(
            $this->events($developer['cookie']),
            static fn (array $event): bool => $event['issue_id'] === $issue && $event['type'] === 'status',
        ));
        $miraStatusEvents = array_values(array_filter(
            $this->events($mira['cookie']),
            static fn (array $event): bool => $event['issue_id'] === $issue && $event['type'] === 'status',
        ));
        self::assertCount(1, $developerStatusEvents);
        self::assertCount(1, $miraStatusEvents);
        self::assertSame([], array_values(array_filter(
            $this->events($admin['cookie']),
            static fn (array $event): bool => $event['issue_id'] === $issue,
        )));
    }

    public function testInboxIssuesAndEventsSupportConditionalPolling(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Conditional inbox');
        $this->addMember($admin, $projectId, $this->developerId);
        $issueId = $this->createIssue($admin, $projectId, 'Poll assigned work', $this->developerId);
        $developer = $this->login($this->developerEmail);

        $issuesPath = '/api/v1/inbox';
        $eventsPath = '/api/v1/inbox/events';
        $issues = $this->request('GET', $issuesPath, [], [], ['tangent_session' => $developer['cookie']]);
        $events = $this->request('GET', $eventsPath, [], [], ['tangent_session' => $developer['cookie']]);
        self::assertSame(200, $issues->status);
        self::assertSame(200, $events->status);
        self::assertSame($issueId, $issues->body['issues'][0]['id']);
        self::assertSame($issueId, $events->body['events'][0]['issue_id']);
        $issuesEtag = $issues->headers['etag'] ?? null;
        $eventsEtag = $events->headers['etag'] ?? null;
        self::assertIsString($issuesEtag);
        self::assertIsString($eventsEtag);

        self::assertSame(304, $this->request(
            'GET', $issuesPath, [], ['If-None-Match' => $issuesEtag], ['tangent_session' => $developer['cookie']],
        )->status);
        self::assertSame(304, $this->request(
            'GET', $eventsPath, [], ['If-None-Match' => $eventsEtag], ['tangent_session' => $developer['cookie']],
        )->status);

        $this->patchIssue($admin, $issueId, ['status' => 'doing']);
        $changedIssues = $this->request(
            'GET', $issuesPath, [], ['If-None-Match' => $issuesEtag], ['tangent_session' => $developer['cookie']],
        );
        $changedEvents = $this->request(
            'GET', $eventsPath, [], ['If-None-Match' => $eventsEtag], ['tangent_session' => $developer['cookie']],
        );
        self::assertSame(200, $changedIssues->status);
        self::assertSame('doing', $changedIssues->body['issues'][0]['status']);
        self::assertNotSame($issuesEtag, $changedIssues->headers['etag'] ?? null);
        self::assertSame(200, $changedEvents->status);
        self::assertCount(2, $changedEvents->body['events']);
        self::assertNotSame($eventsEtag, $changedEvents->headers['etag'] ?? null);
    }

    public function testEventUpdatesAreOwnerScopedAndReadAllOnlyChangesThatUsersEvents(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Inbox event privacy');
        $secondDeveloperId = $this->createDeveloper($admin, 'Mira Fox', 'mira@example.test');
        $this->addMember($admin, $projectId, $this->developerId);
        $this->addMember($admin, $projectId, $secondDeveloperId);
        $developer = $this->login($this->developerEmail);
        $mira = $this->login('mira@example.test');

        $this->createIssue($admin, $projectId, 'Assigned to Niklas', $this->developerId);
        $this->createIssue($admin, $projectId, 'Assigned to Mira', $secondDeveloperId);
        $developerEvent = $this->events($developer['cookie'])[0];
        $miraEvent = $this->events($mira['cookie'])[0];

        $hiddenFromOwner = $this->cookieRequest(
            'PATCH',
            '/api/v1/inbox/events/' . $developerEvent['id'],
            $admin['cookie'],
            ['read' => true],
            $admin['csrf'],
        );
        self::assertSame(404, $hiddenFromOwner->status);

        $emptyPatch = $this->cookieRequest(
            'PATCH',
            '/api/v1/inbox/events/' . $developerEvent['id'],
            $developer['cookie'],
            [],
            $developer['csrf'],
        );
        self::assertSame(422, $emptyPatch->status);

        $missingCsrf = $this->cookieRequest(
            'PATCH',
            '/api/v1/inbox/events/' . $developerEvent['id'],
            $developer['cookie'],
            ['read' => true],
        );
        self::assertSame(403, $missingCsrf->status);

        $marked = $this->cookieRequest(
            'PATCH',
            '/api/v1/inbox/events/' . $developerEvent['id'],
            $developer['cookie'],
            ['read' => true, 'done' => true],
            $developer['csrf'],
        );
        self::assertSame(200, $marked->status, json_encode($marked->body));
        self::assertTrue($marked->body['event']['read']);
        self::assertTrue($marked->body['event']['done']);

        $readAll = $this->cookieRequest(
            'POST',
            '/api/v1/inbox/events/read-all',
            $developer['cookie'],
            [],
            $developer['csrf'],
        );
        self::assertSame(204, $readAll->status);
        self::assertTrue($this->eventById($developer['cookie'], $developerEvent['id'])['read']);
        self::assertFalse($this->eventById($mira['cookie'], $miraEvent['id'])['read']);

        $noSession = $this->request('GET', '/api/v1/inbox/events');
        self::assertSame(401, $noSession->status);
    }

    public function testEventsFromProjectsTheRecipientLeftAreHidden(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Removed member inbox');
        $this->addMember($admin, $projectId, $this->developerId);
        $this->createIssue($admin, $projectId, 'A private follow-up', $this->developerId);
        $developer = $this->login($this->developerEmail);
        self::assertCount(1, $this->events($developer['cookie']));

        $removed = $this->cookieRequest(
            'DELETE',
            "/api/v1/projects/{$projectId}/members/{$this->developerId}",
            $admin['cookie'],
            [],
            $admin['csrf'],
        );
        self::assertSame(204, $removed->status);
        self::assertSame([], $this->events($developer['cookie']));
    }

    private function createProject(array $admin, string $name): int
    {
        $response = $this->cookieRequest('POST', '/api/v1/projects', $admin['cookie'], ['name' => $name], $admin['csrf']);
        self::assertSame(201, $response->status, json_encode($response->body));
        return (int) $response->body['project']['id'];
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
        self::assertSame(200, $response->status);
    }

    private function createDeveloper(array $admin, string $name, string $email): int
    {
        $response = $this->cookieRequest('POST', '/api/v1/users', $admin['cookie'], [
            'name' => $name,
            'email' => $email,
            'password' => $this->password,
        ], $admin['csrf']);
        self::assertSame(201, $response->status, json_encode($response->body));
        return (int) $response->body['user']['id'];
    }

    private function sendMessage(int $projectId, array $user, array $body): Response
    {
        return $this->cookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/messages",
            $user['cookie'],
            $body,
            $user['csrf'],
        );
    }

    private function createIssue(array $user, int $projectId, string $title, int $assigneeId): int
    {
        $response = $this->cookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/issues",
            $user['cookie'],
            ['title' => $title, 'assignee_id' => $assigneeId],
            $user['csrf'],
        );
        self::assertSame(201, $response->status, json_encode($response->body));
        return (int) $response->body['issue']['id'];
    }

    private function patchIssue(array $user, int $issueId, array $body): Response
    {
        return $this->cookieRequest('PATCH', "/api/v1/issues/{$issueId}", $user['cookie'], $body, $user['csrf']);
    }

    private function events(string $cookie): array
    {
        $response = $this->cookieRequest('GET', '/api/v1/inbox/events', $cookie);
        self::assertSame(200, $response->status, json_encode($response->body));
        return $response->body['events'];
    }

    private function eventById(string $cookie, int $eventId): array
    {
        foreach ($this->events($cookie) as $event) {
            if ($event['id'] === $eventId) return $event;
        }
        self::fail("Expected inbox event {$eventId}");
    }

}
