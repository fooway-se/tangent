<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use Tangent\Core\Request;
use Tangent\Core\Response;
use Tangent\Tests\Support\ApiTestCase;

final class ChatIssueConversionTest extends ApiTestCase
{
    public function testProjectMemberCanCreateIssueFromReplyAndKeepTheThreadRoot(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Chat conversion');
        $membership = $this->apiCookieRequest(
            'PUT',
            "/api/v1/projects/{$projectId}/members/{$this->developerId}",
            $admin['cookie'],
            [],
            $admin['csrf'],
        );
        self::assertSame(200, $membership->status);

        $developer = $this->login($this->developerEmail);
        $parent = $this->postMessage($projectId, $developer, ['body' => 'The original context']);
        self::assertSame(201, $parent->status, json_encode($parent->body));
        $reply = $this->postMessage($projectId, $developer, [
            'body' => 'Handle the empty response from the API.',
            'parent_id' => $parent->body['message']['id'],
        ]);
        self::assertSame(201, $reply->status, json_encode($reply->body));

        $messageId = $reply->body['message']['id'];
        $created = $this->apiCookieRequest(
            'POST',
            "/api/v1/messages/{$messageId}/issue",
            $developer['cookie'],
            [],
            $developer['csrf'],
        );

        self::assertSame(201, $created->status, json_encode($created->body));
        self::assertSame($projectId, $created->body['issue']['project_id']);
        self::assertSame('Handle the empty response from the API.', $created->body['issue']['title']);
        self::assertSame('backlog', $created->body['issue']['status']);
        self::assertSame($reply->body['message']['channel_id'], $created->body['issue']['source_channel_id']);
        self::assertSame($parent->body['message']['id'], $created->body['issue']['source_message_id']);
    }

    public function testQuickAddCanCreateAnEditedIssueFromAChatMessage(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Edited chat issue');
        $parent = $this->postMessage($projectId, $admin, ['body' => 'Original thread context']);
        self::assertSame(201, $parent->status, json_encode($parent->body));
        $reply = $this->postMessage($projectId, $admin, [
            'body' => 'The source reply to turn into an issue',
            'parent_id' => $parent->body['message']['id'],
        ]);
        self::assertSame(201, $reply->status, json_encode($reply->body));

        $created = $this->apiCookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/issues",
            $admin['cookie'],
            [
                'title' => 'Edited issue title',
                'description' => 'Details added before submitting.',
                'source_message_id' => $reply->body['message']['id'],
            ],
            $admin['csrf'],
        );
        self::assertSame(201, $created->status, json_encode($created->body));
        self::assertSame('Edited issue title', $created->body['issue']['title']);
        self::assertSame('Details added before submitting.', $created->body['issue']['description']);
        self::assertSame($reply->body['message']['channel_id'], $created->body['issue']['source_channel_id']);
        self::assertSame($parent->body['message']['id'], $created->body['issue']['source_message_id']);

        $otherProjectId = $this->createProject($admin, 'Other source project');
        $otherMessage = $this->postMessage($otherProjectId, $admin, ['body' => 'Wrong project source']);
        self::assertSame(201, $otherMessage->status, json_encode($otherMessage->body));
        $mismatched = $this->apiCookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/issues",
            $admin['cookie'],
            ['title' => 'Must not link cross-project context', 'source_message_id' => $otherMessage->body['message']['id']],
            $admin['csrf'],
        );
        self::assertSame(422, $mismatched->status);
    }

    public function testNonMemberCannotCreateIssueFromAnotherProjectsMessage(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Hidden chat conversion');
        $message = $this->postMessage($projectId, $admin, ['body' => 'Private message']);
        self::assertSame(201, $message->status, json_encode($message->body));

        $developer = $this->login($this->developerEmail);
        $response = $this->apiCookieRequest(
            'POST',
            "/api/v1/messages/{$message->body['message']['id']}/issue",
            $developer['cookie'],
            [],
            $developer['csrf'],
        );

        self::assertSame(404, $response->status);
    }

    /** @param array{cookie: string, csrf: string} $user @param array<string, mixed> $body */
    private function postMessage(int $projectId, array $user, array $body): Response
    {
        return $this->apiCookieRequest(
            'POST',
            "/api/v1/projects/{$projectId}/messages",
            $user['cookie'],
            $body,
            $user['csrf'],
        );
    }

    /** @param array{cookie: string, csrf: string} $admin */
    private function createProject(array $admin, string $name): int
    {
        $response = $this->apiCookieRequest(
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
