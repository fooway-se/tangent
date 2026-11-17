<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use Tangent\Core\Request;
use Tangent\Core\Response;
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

        $messages = $this->getMessages($projectId, $admin['cookie']);
        self::assertSame(200, $messages->status);
        self::assertCount(2, $messages->body['messages']);
        self::assertSame('Admin', $messages->body['messages'][0]['author_name']);
        self::assertSame('Admin', $messages->body['messages'][1]['parent_author_name']);
        self::assertSame('<script>alert("hello")</script>', $messages->body['messages'][1]['parent_body']);

        $replies = $this->getMessages($projectId, $admin['cookie'], [
            'since' => (string) $parent->body['message']['id'],
        ]);
        self::assertCount(1, $replies->body['messages']);
        self::assertSame('I will check this.', $replies->body['messages'][0]['body']);
        self::assertSame('<script>alert("hello")</script>', $replies->body['messages'][0]['parent_body']);

        $events = $this->getEvents($admin['cookie']);
        $replyEvent = array_values(array_filter(
            $events->body['events'],
            static fn (array $event): bool => $event['id'] === $reply->body['message']['id'],
        ))[0];
        self::assertSame('Admin', $replyEvent['parent_author_name']);
        self::assertSame('<script>alert("hello")</script>', $replyEvent['parent_body']);
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

    /** @param array{cookie: string, csrf: string} $user @param array<string, mixed> $body */
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

    /** @param array<string, mixed> $query @param array<string, string> $headers */
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

    /** @param array<string, string> $headers */
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

    /** @param array<string, mixed> $body @param array<string, string> $headers @param array<string, string> $cookies @param array<string, mixed> $query */
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
            $headers,
            $cookies,
            $body === [] ? '' : (string) json_encode($body),
            '127.0.0.1',
        ));
    }
}
