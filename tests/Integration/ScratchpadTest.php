<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use Tangent\Core\Response;
use Tangent\Tests\Support\ApiTestCase;

final class ScratchpadTest extends ApiTestCase
{
    public function testEachUserHasOnePrivateScratchpadNoteSavedInPlace(): void
    {
        $admin = $this->login($this->adminEmail);
        $path = '/api/v1/scratchpad';

        $initial = $this->cookieRequest('GET', $path, $admin['cookie']);
        self::assertSame(200, $initial->status, json_encode($initial->body));
        self::assertSame('', $initial->body['body']);
        self::assertNull($initial->body['updated_at']);

        $firstSave = $this->cookieRequest('PUT', $path, $admin['cookie'], [
            'body' => 'Keep one thought here',
        ], $admin['csrf']);
        self::assertSame(200, $firstSave->status, json_encode($firstSave->body));
        self::assertSame('Keep one thought here', $firstSave->body['body']);

        $developer = $this->login($this->developerEmail);
        self::assertSame('', $this->cookieRequest('GET', $path, $developer['cookie'])->body['body']);
        $developerSave = $this->cookieRequest('PUT', $path, $developer['cookie'], [
            'body' => 'My separate scratchpad',
        ], $developer['csrf']);
        self::assertSame(200, $developerSave->status);
        self::assertSame('My separate scratchpad', $developerSave->body['body']);

        $updated = $this->cookieRequest('PUT', $path, $admin['cookie'], [
            'body' => 'Replace the previous thought',
        ], $admin['csrf']);
        self::assertSame(200, $updated->status);
        self::assertSame('Replace the previous thought', $updated->body['body']);
        self::assertSame('My separate scratchpad', $this->cookieRequest('GET', $path, $developer['cookie'])->body['body']);

        $rows = $this->pdo->prepare(
            'SELECT COUNT(*) FROM scratchpad_notes WHERE workspace_id = :workspace_id AND user_id = :user_id'
        );
        $rows->execute(['workspace_id' => $this->workspaceId, 'user_id' => $this->adminId]);
        self::assertSame(1, (int) $rows->fetchColumn());

        $cleared = $this->cookieRequest('PUT', $path, $admin['cookie'], ['body' => ''], $admin['csrf']);
        self::assertSame(200, $cleared->status);
        self::assertSame('', $this->cookieRequest('GET', $path, $admin['cookie'])->body['body']);
        $rows->execute(['workspace_id' => $this->workspaceId, 'user_id' => $this->adminId]);
        self::assertSame(1, (int) $rows->fetchColumn());
    }

    public function testScratchpadIsWorkspaceScopedAndUnavailableToGuests(): void
    {
        $admin = $this->login($this->adminEmail);
        $path = '/api/v1/scratchpad';
        $firstWorkspaceNote = $this->cookieRequest('PUT', $path, $admin['cookie'], [
            'body' => 'First workspace thought',
        ], $admin['csrf']);
        self::assertSame(200, $firstWorkspaceNote->status);

        $createdWorkspace = $this->cookieRequest(
            'POST',
            '/api/v1/workspaces',
            $admin['cookie'],
            ['name' => 'Scratchpad workspace'],
            $admin['csrf'],
        );
        self::assertSame(201, $createdWorkspace->status, json_encode($createdWorkspace->body));
        $secondWorkspaceId = (int) $createdWorkspace->body['workspace']['id'];
        $switched = $this->requestForWorkspace(
            'POST',
            '/api/v1/workspaces/' . $secondWorkspaceId . '/switch',
            $admin['cookie'],
            $this->workspaceId,
            ['csrf' => $admin['csrf']],
        );
        self::assertSame(200, $switched->status, json_encode($switched->body));
        $secondSession = $this->cookieValue($switched, 'tangent_session');
        $secondCsrf = $this->cookieValue($switched, 'tangent_csrf');

        $secondList = $this->requestForWorkspace('GET', $path, $secondSession, $secondWorkspaceId);
        self::assertSame('', $secondList->body['body']);
        $secondSave = $this->requestForWorkspace(
            'PUT',
            $path,
            $secondSession,
            $secondWorkspaceId,
            ['csrf' => $secondCsrf, 'body' => ['body' => 'Second workspace thought']],
        );
        self::assertSame(200, $secondSave->status, json_encode($secondSave->body));

        $back = $this->requestForWorkspace(
            'POST',
            '/api/v1/workspaces/' . $this->workspaceId . '/switch',
            $secondSession,
            $secondWorkspaceId,
            ['csrf' => $secondCsrf],
        );
        self::assertSame(200, $back->status, json_encode($back->body));
        $firstSession = $this->cookieValue($back, 'tangent_session');
        $firstList = $this->requestForWorkspace('GET', $path, $firstSession, $this->workspaceId);
        self::assertSame('First workspace thought', $firstList->body['body']);

        $admin = $this->login($this->adminEmail);
        $guestId = $this->createUser($admin, 'Customer', 'guest@example.test', 'guest');
        self::assertGreaterThan(0, $guestId);
        $guest = $this->login('guest@example.test');
        self::assertSame(403, $this->cookieRequest('GET', $path, $guest['cookie'])->status);
        self::assertSame(403, $this->cookieRequest(
            'PUT',
            $path,
            $guest['cookie'],
            ['body' => 'Not permitted'],
            $guest['csrf'],
        )->status);
    }

    public function testScratchpadValidationAllowsClearingAndUsesConditionalReads(): void
    {
        $admin = $this->login($this->adminEmail);
        $path = '/api/v1/scratchpad';
        self::assertSame(422, $this->cookieRequest(
            'PUT',
            $path,
            $admin['cookie'],
            ['body' => ['not text']],
            $admin['csrf'],
        )->status);
        self::assertSame(422, $this->cookieRequest(
            'PUT',
            $path,
            $admin['cookie'],
            ['body' => str_repeat('x', 10_001)],
            $admin['csrf'],
        )->status);

        $saved = $this->cookieRequest('PUT', $path, $admin['cookie'], ['body' => 'A single note'], $admin['csrf']);
        self::assertSame(200, $saved->status);
        $whitespace = $this->cookieRequest('PUT', $path, $admin['cookie'], ['body' => '   '], $admin['csrf']);
        self::assertSame(200, $whitespace->status);
        self::assertSame('   ', $whitespace->body['body']);
        $list = $this->cookieRequest('GET', $path, $admin['cookie']);
        self::assertSame(200, $list->status);
        self::assertSame('   ', $list->body['body']);
        self::assertNotEmpty($list->headers['etag'] ?? null);
        $unchanged = $this->request('GET', $path, headers: [
            'If-None-Match' => $list->headers['etag'],
        ], cookies: ['tangent_session' => $admin['cookie']]);
        self::assertSame(304, $unchanged->status);
    }

    public function testSingleScratchpadNoteCanBecomeAnIssueAndIsClearedAfterConversion(): void
    {
        $admin = $this->login($this->adminEmail);
        $project = $this->cookieRequest('POST', '/api/v1/projects', $admin['cookie'], [
            'name' => 'Scratchpad conversion',
        ], $admin['csrf']);
        self::assertSame(201, $project->status, json_encode($project->body));
        $projectId = (int) $project->body['project']['id'];
        $developer = $this->login($this->developerEmail);
        $saved = $this->cookieRequest('PUT', '/api/v1/scratchpad', $developer['cookie'], [
            'body' => "Investigate stale cache results\n\nThe cache can return an older response.",
        ], $developer['csrf']);
        self::assertSame(200, $saved->status, json_encode($saved->body));

        $forbidden = $this->cookieRequest(
            'POST',
            '/api/v1/scratchpad/issue',
            $developer['cookie'],
            ['project_id' => $projectId],
            $developer['csrf'],
        );
        self::assertSame(404, $forbidden->status);
        self::assertSame($saved->body['body'], $this->cookieRequest('GET', '/api/v1/scratchpad', $developer['cookie'])->body['body']);

        $membership = $this->cookieRequest(
            'PUT',
            "/api/v1/projects/{$projectId}/members/{$this->developerId}",
            $admin['cookie'],
            [],
            $admin['csrf'],
        );
        self::assertSame(200, $membership->status);
        $converted = $this->cookieRequest(
            'POST',
            '/api/v1/scratchpad/issue',
            $developer['cookie'],
            ['project_id' => $projectId],
            $developer['csrf'],
        );
        self::assertSame(201, $converted->status, json_encode($converted->body));
        self::assertSame($projectId, $converted->body['issue']['project_id']);
        self::assertSame('Investigate stale cache results', $converted->body['issue']['title']);
        self::assertSame('The cache can return an older response.', $converted->body['issue']['description']);
        self::assertSame('', $this->cookieRequest('GET', '/api/v1/scratchpad', $developer['cookie'])->body['body']);
    }

    private function requestForWorkspace(
        string $method,
        string $path,
        string $session,
        int $workspaceId,
        array $options = [],
    ): Response {
        $headers = [];
        if (isset($options['csrf'])) $headers['X-CSRF-Token'] = $options['csrf'];
        return $this->request(
            $method,
            $path,
            $options['body'] ?? [],
            $headers,
            ['tangent_session' => $session, 'tangent_workspace' => (string) $workspaceId],
        );
    }

    private function cookieValue(Response $response, string $name): string
    {
        foreach ((array) ($response->headers['set-cookie'] ?? []) as $cookie) {
            if (preg_match('/(?:^|;\\s*)' . preg_quote($name, '/') . '=([^;]*)/', $cookie, $matches)) {
                return rawurldecode($matches[1]);
            }
        }
        self::fail("Expected {$name} cookie in response");
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
}
