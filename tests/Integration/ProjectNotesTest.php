<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use Tangent\Tests\Support\ApiTestCase;

final class ProjectNotesTest extends ApiTestCase
{
    public function testProjectMembersCanSaveAndReadMarkdownNotes(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Notes project');
        $path = "/api/v1/projects/{$projectId}/notes";

        $empty = $this->cookieRequest('GET', $path, $admin['cookie']);
        self::assertSame(200, $empty->status, json_encode($empty->body));
        self::assertSame('', $empty->body['notes']);

        $markdown = "# Getting started\n\nRun `npm run build` before opening a PR.";
        $saved = $this->cookieRequest('PUT', $path, $admin['cookie'], ['notes' => $markdown], $admin['csrf']);
        self::assertSame(200, $saved->status, json_encode($saved->body));
        self::assertSame($markdown, $saved->body['notes']);

        $reloaded = $this->cookieRequest('GET', $path, $admin['cookie']);
        self::assertSame(200, $reloaded->status);
        self::assertSame($markdown, $reloaded->body['notes']);

        $membership = $this->cookieRequest(
            'PUT',
            "/api/v1/projects/{$projectId}/members/{$this->developerId}",
            $admin['cookie'],
            [],
            $admin['csrf'],
        );
        self::assertSame(200, $membership->status);
        $developer = $this->login($this->developerEmail);
        self::assertSame($markdown, $this->cookieRequest('GET', $path, $developer['cookie'])->body['notes']);

        $updated = $this->cookieRequest('PUT', $path, $developer['cookie'], ['notes' => 'Saved by a member'], $developer['csrf']);
        self::assertSame(200, $updated->status, json_encode($updated->body));
        self::assertSame('Saved by a member', $updated->body['notes']);
    }

    public function testProjectNotesAreUnavailableToGuestsAndNonMembers(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Internal notes');
        $path = "/api/v1/projects/{$projectId}/notes";
        $guestId = $this->createUser($admin, 'Customer', 'customer@example.test', 'guest');
        $this->addMember($admin, $projectId, $guestId);
        $guest = $this->login('customer@example.test');
        $developer = $this->login($this->developerEmail);

        self::assertSame(404, $this->cookieRequest('GET', $path, $guest['cookie'])->status);
        self::assertSame(404, $this->cookieRequest('PUT', $path, $guest['cookie'], ['notes' => 'secret'], $guest['csrf'])->status);
        self::assertSame(404, $this->cookieRequest('GET', $path, $developer['cookie'])->status);
    }

    public function testNotesMustBeTextWithinTheSupportedLength(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->createProject($admin, 'Validated notes');
        $path = "/api/v1/projects/{$projectId}/notes";

        $notText = $this->cookieRequest('PUT', $path, $admin['cookie'], ['notes' => ['bad']], $admin['csrf']);
        self::assertSame(422, $notText->status);

        $tooLong = $this->cookieRequest(
            'PUT',
            $path,
            $admin['cookie'],
            ['notes' => str_repeat('x', 50_001)],
            $admin['csrf'],
        );
        self::assertSame(422, $tooLong->status);
    }
}
