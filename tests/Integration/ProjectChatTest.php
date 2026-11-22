<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use Tangent\Core\Request;
use Tangent\Core\Response;
use Tangent\Modules\Chat\ChatRepository;
use Tangent\Tests\Support\ApiTestCase;

final class ProjectChatTest extends ApiTestCase
{
    public function testCreatingProjectAutomaticallyCreatesItsProjectChannel(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Chat project');

        $query = $this->pdo->prepare(
            'SELECT COUNT(*) FROM channels
             WHERE workspace_id = :workspace_id AND project_id = :project_id AND channel_type = :type'
        );
        $query->execute([
            'workspace_id' => $this->workspaceId,
            'project_id' => $projectId,
            'type' => 'project',
        ]);

        self::assertSame(1, (int) $query->fetchColumn());
    }

    public function testProjectPresenceReportsOnlyWhetherAnotherViewerIsActive(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Project presence');

        $adminHeartbeat = $this->postPresence($projectId, $admin);
        self::assertSame(200, $adminHeartbeat->status, json_encode($adminHeartbeat->body));
        self::assertSame(['someone_else_viewing' => false], $adminHeartbeat->body);

        $this->cookieRequest(
            'PUT',
            "/api/v1/projects/{$projectId}/members/{$this->developerId}",
            $admin['cookie'],
            [],
            $admin['csrf'],
        );
        $developer = $this->login($this->developerEmail);
        $developerHeartbeat = $this->postPresence($projectId, $developer);
        self::assertSame(200, $developerHeartbeat->status, json_encode($developerHeartbeat->body));
        self::assertSame(['someone_else_viewing' => true], $developerHeartbeat->body);

        $sameUserHeartbeat = $this->postPresence($projectId, $admin);
        self::assertSame(['someone_else_viewing' => true], $sameUserHeartbeat->body);

        $stalePresence = $this->pdo->prepare(
            'UPDATE project_presence SET last_seen_at = UTC_TIMESTAMP() - INTERVAL 2 MINUTE
             WHERE workspace_id = :workspace_id AND project_id = :project_id AND user_id = :user_id'
        );
        $stalePresence->execute([
            'workspace_id' => $this->workspaceId,
            'project_id' => $projectId,
            'user_id' => $this->developerId,
        ]);
        $afterExpiry = $this->postPresence($projectId, $admin);
        self::assertSame(['someone_else_viewing' => false], $afterExpiry->body);
    }

    public function testNonMembersCannotReportProjectPresence(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Private project presence');
        $developer = $this->login($this->developerEmail);

        self::assertSame(404, $this->postPresence($projectId, $developer)->status);
    }

    public function testProjectMembersCanPostMessagesAndThreadReplies(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Threaded chat');

        $parent = $this->postMessage($projectId, $admin, [
            'body' => '<script>alert("hello")</script>',
        ]);
        self::assertSame(201, $parent->status, json_encode($parent->body));
        self::assertSame('<script>alert("hello")</script>', $parent->body['message']['body']);

        $reply = $this->postMessage($projectId, $admin, [
            'body' => 'I will check this.',
            'parent_id' => $parent->body['message']['id'],
        ]);
        self::assertSame(201, $reply->status, json_encode($reply->body));
        self::assertSame($parent->body['message']['id'], $reply->body['message']['parent_id']);
        self::assertSame('Admin', $reply->body['message']['parent_author_name']);
        self::assertSame('<script>alert("hello")</script>', $reply->body['message']['parent_body']);

        $secondReply = $this->postMessage($projectId, $admin, [
            'body' => 'I will check too.',
            'parent_id' => $parent->body['message']['id'],
        ]);
        self::assertSame(201, $secondReply->status, json_encode($secondReply->body));
        $nestedReply = $this->postMessage($projectId, $admin, [
            'body' => 'One more detail.',
            'parent_id' => $reply->body['message']['id'],
        ]);
        self::assertSame(201, $nestedReply->status, json_encode($nestedReply->body));

        $messages = $this->getMessages($projectId, $admin['cookie']);
        self::assertSame(200, $messages->status);
        self::assertCount(4, $messages->body['messages']);
        self::assertSame('Admin', $messages->body['messages'][0]['author_name']);
        self::assertSame('Admin', $messages->body['messages'][1]['parent_author_name']);
        self::assertSame('<script>alert("hello")</script>', $messages->body['messages'][1]['parent_body']);
        self::assertSame(2, $messages->body['messages'][0]['reply_count']);
        self::assertSame($reply->body['message']['id'], $messages->body['messages'][0]['first_reply_id']);
        self::assertSame(1, $messages->body['messages'][1]['reply_count']);
        self::assertSame($nestedReply->body['message']['id'], $messages->body['messages'][1]['first_reply_id']);
        self::assertSame(0, $messages->body['messages'][2]['reply_count']);
        self::assertNull($messages->body['messages'][2]['first_reply_id']);

        $replies = $this->getMessages($projectId, $admin['cookie'], [
            'since' => (string) $parent->body['message']['id'],
        ]);
        self::assertCount(3, $replies->body['messages']);
        self::assertSame('I will check this.', $replies->body['messages'][0]['body']);
        self::assertSame('<script>alert("hello")</script>', $replies->body['messages'][0]['parent_body']);

        $events = $this->getEvents($admin['cookie']);
        $replyEvent = array_values(array_filter(
            $events->body['events'],
            static fn (array $event): bool => $event['id'] === $reply->body['message']['id'],
        ))[0];
        self::assertSame('Admin', $replyEvent['parent_author_name']);
        self::assertSame('<script>alert("hello")</script>', $replyEvent['parent_body']);
        $parentEvent = array_values(array_filter(
            $events->body['events'],
            static fn (array $event): bool => $event['id'] === $parent->body['message']['id'],
        ))[0];
        self::assertSame(2, $parentEvent['reply_count']);
        self::assertSame($reply->body['message']['id'], $parentEvent['first_reply_id']);
    }

    public function testSupportedThreadDepthLoadsFromHistoryAndEventsAndRejectsOneDeeperReply(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Maximum depth thread');
        $parentId = null;
        $maxDepth = 32;

        for ($depth = 1; $depth <= $maxDepth; $depth++) {
            $input = ['body' => 'Thread depth ' . $depth];
            if ($parentId !== null) $input['parent_id'] = $parentId;
            $message = $this->postMessage($projectId, $admin, $input);
            self::assertSame(201, $message->status, json_encode($message->body));
            $parentId = $message->body['message']['id'];
        }

        $history = $this->getMessages($projectId, $admin['cookie'], ['since' => '0']);
        self::assertSame(200, $history->status, json_encode($history->body));
        self::assertCount($maxDepth, $history->body['messages']);
        self::assertSame('Thread depth 1', $history->body['messages'][0]['body']);
        self::assertSame('Thread depth 32', $history->body['messages'][31]['body']);

        $events = $this->getEvents($admin['cookie']);
        self::assertSame(200, $events->status, json_encode($events->body));
        self::assertCount($maxDepth, $events->body['events']);
        self::assertSame('Thread depth 32', $events->body['events'][31]['body']);

        $tooDeep = $this->postMessage($projectId, $admin, [
            'body' => 'Thread depth 33',
            'parent_id' => $parentId,
        ]);
        self::assertSame(422, $tooDeep->status, json_encode($tooDeep->body));
        self::assertSame('validation_failed', $tooDeep->body['error']['code']);

        $this->pdo->prepare(
            'UPDATE chat_event_sequences SET last_cursor = last_cursor + 1 WHERE workspace_id = :workspace_id'
        )->execute(['workspace_id' => $this->workspaceId]);
        $legacyCursor = $this->pdo->prepare(
            'SELECT last_cursor FROM chat_event_sequences WHERE workspace_id = :workspace_id'
        );
        $legacyCursor->execute(['workspace_id' => $this->workspaceId]);
        $legacyInsert = $this->pdo->prepare(
            'INSERT INTO messages (workspace_id, channel_id, author_id, parent_id, body, is_client_visible, feed_cursor)
             VALUES (:workspace_id, :channel_id, :author_id, :parent_id, :body, 0, :feed_cursor)'
        );
        $legacyInsert->execute([
            'workspace_id' => $this->workspaceId,
            'channel_id' => $history->body['messages'][0]['channel_id'],
            'author_id' => $this->adminId,
            'parent_id' => $parentId,
            'body' => 'Legacy thread depth 33',
            'feed_cursor' => (int) $legacyCursor->fetchColumn(),
        ]);
        $legacyMessageId = (int) $this->pdo->lastInsertId();

        $legacyHistory = $this->getMessages($projectId, $admin['cookie'], ['since' => '0']);
        self::assertSame(200, $legacyHistory->status, json_encode($legacyHistory->body));
        self::assertCount($maxDepth + 1, $legacyHistory->body['messages']);
        $legacyEvents = $this->getEvents($admin['cookie']);
        self::assertSame(200, $legacyEvents->status, json_encode($legacyEvents->body));
        self::assertCount($maxDepth + 1, $legacyEvents->body['events']);

        $legacyReply = $this->postMessage($projectId, $admin, [
            'body' => 'Reply to a legacy over-depth thread',
            'parent_id' => $legacyMessageId,
        ]);
        self::assertSame(422, $legacyReply->status, json_encode($legacyReply->body));
        self::assertSame('validation_failed', $legacyReply->body['error']['code']);
    }

    public function testNonMembersCannotReadOrPostProjectMessages(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Private chat');
        $developer = $this->login($this->developerEmail);

        $read = $this->getMessages($projectId, $developer['cookie']);
        self::assertSame(404, $read->status);

        $post = $this->postMessage($projectId, $developer, ['body' => 'Not a member']);
        self::assertSame(404, $post->status);
    }

    public function testPollingUsesEtagAndReturns304UntilANewMessageArrives(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Polling chat');

        $initial = $this->getMessages($projectId, $admin['cookie']);
        self::assertSame(200, $initial->status);
        self::assertSame([], $initial->body['messages']);
        $etag = $initial->headers['etag'] ?? null;
        self::assertIsString($etag);

        $unchangedInitial = $this->getMessages(
            $projectId,
            $admin['cookie'],
            [],
            ['If-None-Match' => $etag],
        );
        self::assertSame(304, $unchangedInitial->status);

        $unchanged = $this->getMessages(
            $projectId,
            $admin['cookie'],
            ['since' => '0'],
            ['If-None-Match' => $etag],
        );
        self::assertSame(304, $unchanged->status);

        $sent = $this->postMessage($projectId, $admin, ['body' => 'A new update']);
        self::assertSame(201, $sent->status);
        $changed = $this->getMessages(
            $projectId,
            $admin['cookie'],
            ['since' => '0'],
            ['If-None-Match' => $etag],
        );

        self::assertSame(200, $changed->status);
        self::assertCount(1, $changed->body['messages']);
        self::assertNotSame($etag, $changed->headers['etag'] ?? null);
    }

    public function testEventsEndpointUsesEtagForCheapPolling(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Event polling');
        $initial = $this->getEvents($admin['cookie']);

        self::assertSame(200, $initial->status);
        self::assertSame([], $initial->body['events']);
        $etag = $initial->headers['etag'] ?? null;
        self::assertIsString($etag);

        $unchanged = $this->getEvents($admin['cookie'], ['If-None-Match' => $etag]);
        self::assertSame(304, $unchanged->status);

        self::assertSame(201, $this->postMessage($projectId, $admin, ['body' => 'Polling event'])->status);
        $changed = $this->getEvents($admin['cookie'], ['If-None-Match' => $etag]);

        self::assertSame(200, $changed->status);
        self::assertCount(1, $changed->body['events']);
        self::assertSame($projectId, $changed->body['events'][0]['project_id']);
        self::assertNotSame($etag, $changed->headers['etag'] ?? null);
    }

    public function testEventsEndpointOnlyReturnsMessagesFromProjectsTheUserCanSee(): void
    {
        $admin = $this->login($this->adminEmail);
        $visibleProject = $this->createProject($admin, 'Visible event');
        $hiddenProject = $this->createProject($admin, 'Hidden event');
        self::assertSame(201, $this->postMessage($visibleProject, $admin, ['body' => 'Visible'])->status);
        self::assertSame(201, $this->postMessage($hiddenProject, $admin, ['body' => 'Hidden'])->status);

        $membership = $this->cookieRequest(
            'PUT',
            "/api/v1/projects/{$visibleProject}/members/{$this->developerId}",
            $admin['cookie'],
            [],
            $admin['csrf'],
        );
        self::assertSame(200, $membership->status);

        $developer = $this->login($this->developerEmail);
        $events = $this->getEvents($developer['cookie']);

        self::assertSame(200, $events->status);
        self::assertCount(1, $events->body['events']);
        self::assertSame($visibleProject, $events->body['events'][0]['project_id']);
        self::assertSame('Visible', $events->body['events'][0]['body']);
    }

    public function testProjectEventFeedIsScopedAndIgnoresUnrelatedTraffic(): void
    {
        $admin = $this->login($this->adminEmail);
        $busyProjectId = $this->createProject($admin, 'Busy feed project');
        $quietProjectId = $this->createProject($admin, 'Quiet feed project');
        $privateProjectId = $this->createProject($admin, 'Private feed project');

        $initial = $this->getProjectEvents($quietProjectId, $admin['cookie'], ['cursor' => '0']);
        self::assertSame(200, $initial->status, json_encode($initial->body));
        self::assertSame([], $initial->body['events']);
        $quietEtag = $initial->headers['etag'] ?? null;
        self::assertIsString($quietEtag);

        $this->insertProjectFeedMessages($busyProjectId, 105);
        $unchanged = $this->getProjectEvents(
            $quietProjectId,
            $admin['cookie'],
            ['cursor' => '0'],
            ['If-None-Match' => $quietEtag],
        );
        self::assertSame(304, $unchanged->status);
        self::assertSame($quietEtag, $unchanged->headers['etag'] ?? null);

        self::assertSame(201, $this->postMessage($quietProjectId, $admin, ['body' => 'Quiet project update'])->status);
        $active = $this->getProjectEvents(
            $quietProjectId,
            $admin['cookie'],
            ['cursor' => '0'],
            ['If-None-Match' => $quietEtag],
        );
        self::assertSame(200, $active->status, json_encode($active->body));
        self::assertCount(1, $active->body['events']);
        self::assertSame($quietProjectId, $active->body['events'][0]['project_id']);
        self::assertSame('Quiet project update', $active->body['events'][0]['body']);

        $developer = $this->login($this->developerEmail);
        self::assertSame(404, $this->getProjectEvents(
            $privateProjectId,
            $developer['cookie'],
            ['cursor' => '0'],
        )->status);
    }

    public function testThreadReplyMustBelongToTheSameProjectChannel(): void
    {
        $admin = $this->login($this->adminEmail);
        $firstProject = $this->createProject($admin, 'First chat');
        $secondProject = $this->createProject($admin, 'Second chat');
        $parent = $this->postMessage($firstProject, $admin, ['body' => 'Parent message']);

        $reply = $this->postMessage($secondProject, $admin, [
            'body' => 'Cross-project reply',
            'parent_id' => $parent->body['message']['id'],
        ]);

        self::assertSame(404, $reply->status);
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

    private function postMessage(int $projectId, array $user, array $body): Response
    {
        return $this->apiRequest(
            'POST',
            "/api/v1/projects/{$projectId}/messages",
            $body,
            ['X-CSRF-Token' => $user['csrf']],
            ['tangent_session' => $user['cookie']],
        );
    }

    private function postPresence(int $projectId, array $user): Response
    {
        return $this->apiRequest(
            'POST',
            "/api/v1/projects/{$projectId}/presence",
            [],
            ['X-CSRF-Token' => $user['csrf']],
            ['tangent_session' => $user['cookie']],
        );
    }

    private function getMessages(int $projectId, string $cookie, array $query = [], array $headers = []): Response
    {
        return $this->apiRequest(
            'GET',
            "/api/v1/projects/{$projectId}/messages",
            [],
            $headers,
            ['tangent_session' => $cookie],
            $query,
        );
    }

    private function getEvents(string $cookie, array $headers = []): Response
    {
        return $this->apiRequest(
            'GET',
            '/api/v1/events',
            [],
            $headers,
            ['tangent_session' => $cookie],
            ['since' => '0'],
        );
    }

    private function getProjectEvents(
        int $projectId,
        string $cookie,
        array $query = [],
        array $headers = [],
    ): Response {
        return $this->apiRequest(
            'GET',
            "/api/v1/projects/{$projectId}/events",
            [],
            $headers,
            ['tangent_session' => $cookie],
            $query,
        );
    }

    private function insertProjectFeedMessages(int $projectId, int $count): void
    {
        $channel = $this->pdo->prepare(
            "SELECT id FROM channels WHERE workspace_id = :workspace_id AND project_id = :project_id AND channel_type = 'project'"
        );
        $channel->execute(['workspace_id' => $this->workspaceId, 'project_id' => $projectId]);
        $channelId = (int) $channel->fetchColumn();
        $repository = new ChatRepository($this->pdo);
        $insert = $this->pdo->prepare(
            'INSERT INTO messages (workspace_id, channel_id, author_id, body, is_client_visible, feed_cursor)
             VALUES (:workspace_id, :channel_id, :author_id, :body, 0, :feed_cursor)'
        );

        for ($index = 0; $index < $count; $index++) {
            $insert->execute([
                'workspace_id' => $this->workspaceId,
                'channel_id' => $channelId,
                'author_id' => $this->adminId,
                'body' => "Unrelated message {$index}",
                'feed_cursor' => $repository->nextEventCursor($this->workspaceId),
            ]);
        }
    }

    private function apiRequest(
        string $method,
        string $path,
        array $body = [],
        array $headers = [],
        array $cookies = [],
        array $query = [],
    ): Response {
        return $this->application->handle(Request::fromHttp(
            $method,
            $path,
            $query,
            array_merge(['Content-Type' => 'application/json'], $headers),
            $cookies,
            $body === [] ? '' : (string) json_encode($body),
            '127.0.0.1',
        ));
    }
}
