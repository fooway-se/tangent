<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use Tangent\Core\Request;
use Tangent\Core\Response;
use Tangent\Tests\Support\ApiTestCase;

final class IssueDiscussionTest extends ApiTestCase
{
    public function testProjectMembersCanPostIssueDiscussionRepliesAndCannotReplyAcrossIssues(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Issue discussion');
        $this->addDeveloper($admin, $projectId);
        $developer = $this->login($this->developerEmail);
        $firstIssueId = $this->createIssue($admin, $projectId, 'First issue');
        $secondIssueId = $this->createIssue($admin, $projectId, 'Second issue');

        $empty = $this->apiCookieRequest('GET', "/api/v1/issues/{$firstIssueId}/discussion", $developer['cookie']);
        self::assertSame(200, $empty->status, json_encode($empty->body));
        self::assertSame([], $empty->body['messages']);

        $root = $this->apiCookieRequest(
            'POST',
            "/api/v1/issues/{$firstIssueId}/discussion",
            $developer['cookie'],
            ['body' => 'I am investigating this.'],
            $developer['csrf'],
        );
        self::assertSame(201, $root->status, json_encode($root->body));
        self::assertSame('I am investigating this.', $root->body['message']['body']);
        self::assertSame('Developer', $root->body['message']['author_name']);
        self::assertNull($root->body['message']['parent_id']);

        $reply = $this->apiCookieRequest(
            'POST',
            "/api/v1/issues/{$firstIssueId}/discussion",
            $admin['cookie'],
            ['body' => 'Here is a possible fix.', 'parent_id' => $root->body['message']['id']],
            $admin['csrf'],
        );
        self::assertSame(201, $reply->status, json_encode($reply->body));
        self::assertSame('Here is a possible fix.', $reply->body['message']['body']);
        self::assertSame($root->body['message']['id'], $reply->body['message']['parent_id']);
        self::assertSame('Developer', $reply->body['message']['parent_author_name']);

        $discussion = $this->apiCookieRequest('GET', "/api/v1/issues/{$firstIssueId}/discussion", $developer['cookie']);
        self::assertSame(200, $discussion->status);
        self::assertSame(['I am investigating this.', 'Here is a possible fix.'], array_column($discussion->body['messages'], 'body'));

        $crossIssueReply = $this->apiCookieRequest(
            'POST',
            "/api/v1/issues/{$secondIssueId}/discussion",
            $admin['cookie'],
            ['body' => 'This belongs somewhere else.', 'parent_id' => $root->body['message']['id']],
            $admin['csrf'],
        );
        self::assertSame(404, $crossIssueReply->status);
    }

    public function testIssueDiscussionRequiresIssueAccessAndValidMessageBodies(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Private issue discussion');
        $issueId = $this->createIssue($admin, $projectId, 'Private issue');
        $developer = $this->login($this->developerEmail);

        self::assertSame(404, $this->apiCookieRequest(
            'GET', "/api/v1/issues/{$issueId}/discussion", $developer['cookie'],
        )->status);
        self::assertSame(404, $this->apiCookieRequest(
            'POST', "/api/v1/issues/{$issueId}/discussion", $developer['cookie'], ['body' => 'No access.'], $developer['csrf'],
        )->status);

        self::assertSame(422, $this->apiCookieRequest(
            'POST', "/api/v1/issues/{$issueId}/discussion", $admin['cookie'], ['body' => '   '], $admin['csrf'],
        )->status);
    }

    public function testAuthorCanEditAndDeleteTheirLastDiscussionMessage(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Editable issue discussion');
        $this->addDeveloper($admin, $projectId);
        $developer = $this->login($this->developerEmail);
        $issueId = $this->createIssue($admin, $projectId, 'Editable discussion');

        $created = $this->postDiscussionMessage($developer, $issueId, ['body' => 'Initial note.']);
        self::assertSame(201, $created->status, json_encode($created->body));
        $messageId = (int) $created->body['message']['id'];

        $edited = $this->apiCookieRequest(
            'PATCH',
            "/api/v1/issues/{$issueId}/discussion/{$messageId}",
            $developer['cookie'],
            ['body' => 'Corrected note.'],
            $developer['csrf'],
        );
        self::assertSame(200, $edited->status, json_encode($edited->body));
        self::assertSame('Corrected note.', $edited->body['message']['body']);

        $deleted = $this->apiCookieRequest(
            'DELETE',
            "/api/v1/issues/{$issueId}/discussion/{$messageId}",
            $developer['cookie'],
            [],
            $developer['csrf'],
        );
        self::assertSame(204, $deleted->status);
        $discussion = $this->apiCookieRequest('GET', "/api/v1/issues/{$issueId}/discussion", $admin['cookie']);
        self::assertSame([], $discussion->body['messages']);
    }

    public function testOnlyTheAuthorCanEditOrDeleteTheirLastDiscussionMessage(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Author-only discussion actions');
        $this->addDeveloper($admin, $projectId);
        $developer = $this->login($this->developerEmail);
        $issueId = $this->createIssue($admin, $projectId, 'Author-only discussion');
        $created = $this->postDiscussionMessage($developer, $issueId, ['body' => 'Developer note.']);
        self::assertSame(201, $created->status, json_encode($created->body));
        $messageId = (int) $created->body['message']['id'];

        $edit = $this->apiCookieRequest(
            'PATCH',
            "/api/v1/issues/{$issueId}/discussion/{$messageId}",
            $admin['cookie'],
            ['body' => 'Admin edit.'],
            $admin['csrf'],
        );
        self::assertSame(403, $edit->status);
        $delete = $this->apiCookieRequest(
            'DELETE',
            "/api/v1/issues/{$issueId}/discussion/{$messageId}",
            $admin['cookie'],
            [],
            $admin['csrf'],
        );
        self::assertSame(403, $delete->status);
    }

    public function testDiscussionMessagesCannotBeEditedOrDeletedAfterRepliesOrLaterMessages(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Ordered discussion actions');
        $this->addDeveloper($admin, $projectId);
        $developer = $this->login($this->developerEmail);
        $issueId = $this->createIssue($admin, $projectId, 'Ordered discussion');

        $parent = $this->postDiscussionMessage($developer, $issueId, ['body' => 'Parent note.']);
        self::assertSame(201, $parent->status);
        $parentId = (int) $parent->body['message']['id'];
        $reply = $this->postDiscussionMessage($admin, $issueId, ['body' => 'Reply.', 'parent_id' => $parentId]);
        self::assertSame(201, $reply->status);

        $blockedEdit = $this->apiCookieRequest(
            'PATCH',
            "/api/v1/issues/{$issueId}/discussion/{$parentId}",
            $developer['cookie'],
            ['body' => 'Changed parent.'],
            $developer['csrf'],
        );
        self::assertSame(409, $blockedEdit->status);
        $blockedDelete = $this->apiCookieRequest(
            'DELETE',
            "/api/v1/issues/{$issueId}/discussion/{$parentId}",
            $developer['cookie'],
            [],
            $developer['csrf'],
        );
        self::assertSame(409, $blockedDelete->status);

        $earlier = $this->postDiscussionMessage($developer, $issueId, ['body' => 'Earlier standalone note.']);
        self::assertSame(201, $earlier->status);
        $earlierId = (int) $earlier->body['message']['id'];
        $later = $this->postDiscussionMessage($admin, $issueId, ['body' => 'Later standalone note.']);
        self::assertSame(201, $later->status);

        $blockedLaterEdit = $this->apiCookieRequest(
            'PATCH',
            "/api/v1/issues/{$issueId}/discussion/{$earlierId}",
            $developer['cookie'],
            ['body' => 'Changed earlier note.'],
            $developer['csrf'],
        );
        self::assertSame(409, $blockedLaterEdit->status);
        $blockedLaterDelete = $this->apiCookieRequest(
            'DELETE',
            "/api/v1/issues/{$issueId}/discussion/{$earlierId}",
            $developer['cookie'],
            [],
            $developer['csrf'],
        );
        self::assertSame(409, $blockedLaterDelete->status);
    }

    public function testProjectIssueListIncludesTheCountOfDiscussionPostsAndReplies(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Discussion indicators');
        $issueId = $this->createIssue($admin, $projectId, 'Issue with discussion');
        $listPath = "/api/v1/projects/{$projectId}/issues";

        $initial = $this->apiCookieRequest('GET', $listPath, $admin['cookie']);
        self::assertSame(200, $initial->status);
        self::assertSame(0, $this->listedIssue($initial->body['issues'], $issueId)['discussion_count']);

        $root = $this->apiCookieRequest(
            'POST',
            "/api/v1/issues/{$issueId}/discussion",
            $admin['cookie'],
            ['body' => 'First detail'],
            $admin['csrf'],
        );
        self::assertSame(201, $root->status);
        $reply = $this->apiCookieRequest(
            'POST',
            "/api/v1/issues/{$issueId}/discussion",
            $admin['cookie'],
            ['body' => 'Follow-up detail', 'parent_id' => $root->body['message']['id']],
            $admin['csrf'],
        );
        self::assertSame(201, $reply->status);

        $updated = $this->apiCookieRequest('GET', $listPath, $admin['cookie']);
        self::assertSame(200, $updated->status);
        self::assertSame(2, $this->listedIssue($updated->body['issues'], $issueId)['discussion_count']);
    }

    private function listedIssue(array $issues, int $issueId): array
    {
        foreach ($issues as $issue) {
            if ($issue['id'] === $issueId) return $issue;
        }
        self::fail("Issue {$issueId} is missing from the project list.");
    }

    private function createProject(array $admin, string $name): int
    {
        $response = $this->cookieRequest('POST', '/api/v1/projects', $admin['cookie'], ['name' => $name], $admin['csrf']);
        self::assertSame(201, $response->status, json_encode($response->body));
        return (int) $response->body['project']['id'];
    }

    private function addDeveloper(array $admin, int $projectId): void
    {
        $response = $this->apiCookieRequest(
            'PUT', "/api/v1/projects/{$projectId}/members/{$this->developerId}",
            $admin['cookie'], [], $admin['csrf'],
        );
        self::assertSame(200, $response->status, json_encode($response->body));
    }

    private function createIssue(array $admin, int $projectId, string $title): int
    {
        $response = $this->apiCookieRequest(
            'POST', "/api/v1/projects/{$projectId}/issues", $admin['cookie'], ['title' => $title], $admin['csrf'],
        );
        self::assertSame(201, $response->status, json_encode($response->body));
        return (int) $response->body['issue']['id'];
    }

    private function postDiscussionMessage(array $user, int $issueId, array $input): Response
    {
        return $this->apiCookieRequest(
            'POST',
            "/api/v1/issues/{$issueId}/discussion",
            $user['cookie'],
            $input,
            $user['csrf'],
        );
    }

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
