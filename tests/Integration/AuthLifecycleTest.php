<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use Tangent\Core\AppConfig;
use Tangent\Core\Application;
use Tangent\Core\Request;
use Tangent\Tests\Support\ApiTestCase;

final class AuthLifecycleTest extends ApiTestCase
{
    public function testLoginRequiresJsonWithoutDependingOnConfiguredOrigin(): void
    {
        $mobileOrigin = $this->request('POST', '/api/v1/auth/login', [
            'email' => $this->adminEmail,
            'password' => $this->password,
        ], ['Origin' => 'https://fooway.se']);

        self::assertSame(200, $mobileOrigin->status, json_encode($mobileOrigin->body));

        $nonJson = $this->application->handle(Request::fromHttp(
            'POST',
            '/api/v1/auth/login',
            [],
            ['Content-Type' => 'text/plain'],
            [],
            json_encode(['email' => $this->adminEmail, 'password' => $this->password], JSON_THROW_ON_ERROR),
            '192.0.2.10',
        ));

        self::assertSame(400, $nonJson->status);
        self::assertSame('invalid_json', $nonJson->body['error']['code']);
    }

    public function testOversizedRequestBodyIsRejectedBeforeAuthentication(): void
    {
        $body = json_encode(['unused' => str_repeat('x', 1_048_577)], JSON_THROW_ON_ERROR);
        $response = $this->application->handle(Request::fromHttp(
            'POST',
            '/api/v1/auth/login',
            [],
            ['Content-Type' => 'application/json'],
            [],
            $body,
            '192.0.2.11',
        ));

        self::assertSame(413, $response->status);
        self::assertSame('payload_too_large', $response->body['error']['code']);
    }

    public function testSessionCookiesAreScopedToTheConfiguredAppSubdirectory(): void
    {
        $application = Application::create(
            $this->pdo,
            new AppConfig($this->workspaceId, false, 43200, 'https://fooway.se/tangent'),
            null,
            $this->mailer,
        );
        $response = $application->handle(Request::json('POST', '/api/v1/auth/login', [
            'email' => $this->adminEmail,
            'password' => $this->password,
        ]));

        self::assertSame(200, $response->status);
        $cookies = (array) ($response->headers['set-cookie'] ?? []);
        self::assertStringContainsString('Path=/tangent/api/v1', $cookies[0]);
        self::assertStringContainsString('Path=/tangent/', $cookies[1]);
        self::assertStringContainsString('Path=/tangent/api/v1', $cookies[2]);

        self::assertSame(1, preg_match('/(?:^|;\s*)tangent_session=([^;]+)/', $cookies[0], $matches));
        $invite = $application->handle(Request::json(
            'POST',
            '/api/v1/users/invites',
            ['name' => 'Subdirectory invite', 'email' => 'subdirectory-invite@example.test', 'role' => 'developer'],
            ['X-CSRF-Token' => $response->body['csrf_token']],
            ['tangent_session' => rawurldecode($matches[1])],
        ));
        self::assertSame(201, $invite->status, json_encode($invite->body));
        self::assertStringStartsWith(
            'https://fooway.se/tangent/app.html#invite=',
            $invite->body['invite']['invite_url'],
        );
    }

    public function testAdminInvitesGuestWithProjectAccessAndAcceptanceCreatesSessionOnce(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->insertProject('Guest invite project', 'guest-invite-project', $this->adminId);
        $created = $this->cookieRequest('POST', '/api/v1/users/invites', $admin['cookie'], [
            'name' => 'Client Contact',
            'email' => 'client@example.test',
            'role' => 'guest',
            'project_ids' => [$projectId],
        ], $admin['csrf']);

        self::assertSame(201, $created->status, json_encode($created->body));
        self::assertArrayNotHasKey('token', $created->body['invite']);
        self::assertArrayHasKey('invite_url', $created->body['invite']);
        $plainToken = $this->tokenFromCredentialUrl($created->body['invite']['invite_url'], 'invite');

        $inspection = $this->request('POST', '/api/v1/auth/invites/inspect', ['token' => $plainToken]);
        self::assertSame(200, $inspection->status, json_encode($inspection->body));
        self::assertTrue($inspection->body['invite']['password_required']);
        self::assertSame('client@example.test', $inspection->body['invite']['email']);
        self::assertSame('Test workspace', $inspection->body['invite']['workspace_name']);
        self::assertSame(1, preg_match('/Verification code: ([a-f0-9]{64})/', $this->mailer->messages[0]['body'], $matches));
        $verificationCode = $matches[1];

        $stored = $this->pdo->prepare('SELECT token_hash, email_verification_hash, token_type FROM credential_tokens WHERE id = :id');
        $stored->execute(['id' => $created->body['invite']['id']]);
        self::assertSame([
            'token_hash' => hash('sha256', $plainToken),
            'email_verification_hash' => hash('sha256', $verificationCode),
            'token_type' => 'invite',
        ], $stored->fetch(\PDO::FETCH_ASSOC));

        $accepted = $this->request('POST', '/api/v1/auth/invites/accept', [
            'token' => $plainToken,
            'password' => 'a calm orchard under winter stars',
            'verification_code' => $verificationCode,
        ]);
        self::assertSame(200, $accepted->status, json_encode($accepted->body));
        self::assertSame('guest', $accepted->body['user']['role']);
        $cookies = (array) ($accepted->headers['set-cookie'] ?? []);
        self::assertStringContainsString('tangent_session=', implode(';', $cookies));
        self::assertStringContainsString('tangent_workspace=' . $this->workspaceId, implode(';', $cookies));

        $membership = $this->pdo->prepare(
            'SELECT u.id, u.account_id, u.role, ua.password_hash
             FROM users u INNER JOIN user_accounts ua ON ua.id = u.account_id
             WHERE u.workspace_id = :workspace_id AND u.email = :email'
        );
        $membership->execute(['workspace_id' => $this->workspaceId, 'email' => 'client@example.test']);
        $user = $membership->fetch(\PDO::FETCH_ASSOC);
        self::assertSame('guest', $user['role']);
        self::assertSame('argon2id', password_get_info($user['password_hash'])['algoName']);
        self::assertTrue($this->projectHasMember($projectId, (int) $user['id']));

        $me = $this->request('GET', '/api/v1/auth/me', cookies: ['tangent_session' => $this->cookieFrom($accepted)]);
        self::assertSame(200, $me->status);
        self::assertSame('client@example.test', $me->body['user']['email']);
        self::assertSame(400, $this->request('POST', '/api/v1/auth/invites/accept', ['token' => $plainToken])->status);
        self::assertSame(403, $this->cookieRequest('GET', '/api/v1/users', $this->cookieFrom($accepted))->status);
    }

    public function testGuestInviteAcceptanceOmitsProjectsThatAreNoLongerEligible(): void
    {
        $admin = $this->login($this->adminEmail);
        $archivedProjectId = $this->insertProject('Guest invite archived project', 'guest-invite-archived', $this->adminId);
        $eligibleProjectId = $this->insertProject('Guest invite eligible project', 'guest-invite-eligible', $this->adminId);
        $created = $this->cookieRequest('POST', '/api/v1/users/invites', $admin['cookie'], [
            'name' => 'Partial guest invite',
            'email' => 'partial-guest@example.test',
            'role' => 'guest',
            'project_ids' => [$archivedProjectId, $eligibleProjectId],
        ], $admin['csrf']);
        self::assertSame(201, $created->status, json_encode($created->body));
        $plainToken = $this->tokenFromCredentialUrl($created->body['invite']['invite_url'], 'invite');
        self::assertSame(1, preg_match('/Verification code: ([a-f0-9]{64})/', $this->mailer->messages[0]['body'], $matches));

        $lifecycle = $this->pdo->prepare('UPDATE projects SET status = :status WHERE workspace_id = :workspace_id AND id = :id');
        $lifecycle->execute(['status' => 'archived', 'workspace_id' => $this->workspaceId, 'id' => $archivedProjectId]);
        $lifecycle->execute(['status' => 'paused', 'workspace_id' => $this->workspaceId, 'id' => $eligibleProjectId]);
        $accepted = $this->request('POST', '/api/v1/auth/invites/accept', [
            'token' => $plainToken,
            'password' => 'a thoughtful guest password phrase',
            'verification_code' => $matches[1],
        ]);

        self::assertSame(200, $accepted->status, json_encode($accepted->body));
        $guestId = (int) $accepted->body['user']['id'];
        self::assertFalse($this->projectHasMember($archivedProjectId, $guestId));
        self::assertTrue($this->projectHasMember($eligibleProjectId, $guestId));
        self::assertNotEmpty((array) ($accepted->headers['set-cookie'] ?? []));
    }

    public function testGuestInviteWithNoEligibleProjectsDoesNotCreateAccountMembershipOrSession(): void
    {
        $admin = $this->login($this->adminEmail);
        $projectId = $this->insertProject('Guest invite becomes read only', 'guest-invite-read-only', $this->adminId);
        $created = $this->cookieRequest('POST', '/api/v1/users/invites', $admin['cookie'], [
            'name' => 'Unavailable guest invite',
            'email' => 'unavailable-guest@example.test',
            'role' => 'guest',
            'project_ids' => [$projectId],
        ], $admin['csrf']);
        self::assertSame(201, $created->status, json_encode($created->body));
        $plainToken = $this->tokenFromCredentialUrl($created->body['invite']['invite_url'], 'invite');
        self::assertSame(1, preg_match('/Verification code: ([a-f0-9]{64})/', $this->mailer->messages[0]['body'], $matches));
        $this->pdo->prepare('UPDATE projects SET status = :status WHERE workspace_id = :workspace_id AND id = :id')
            ->execute(['status' => 'completed', 'workspace_id' => $this->workspaceId, 'id' => $projectId]);

        $failed = $this->request('POST', '/api/v1/auth/invites/accept', [
            'token' => $plainToken,
            'password' => 'a thoughtful guest password phrase',
            'verification_code' => $matches[1],
        ]);

        self::assertSame(409, $failed->status, json_encode($failed->body));
        self::assertSame('invite_projects_unavailable', $failed->body['error']['code']);
        self::assertSame([], (array) ($failed->headers['set-cookie'] ?? []));
        self::assertSame(0, $this->workspaceMembershipCount('unavailable-guest@example.test'));
        $account = $this->pdo->prepare('SELECT COUNT(*) FROM user_accounts WHERE email = :email');
        $account->execute(['email' => 'unavailable-guest@example.test']);
        self::assertSame(0, (int) $account->fetchColumn());
        $invite = $this->pdo->prepare('SELECT used_at FROM credential_tokens WHERE id = :id');
        $invite->execute(['id' => $created->body['invite']['id']]);
        self::assertNull($invite->fetchColumn());
    }

    public function testExistingAccountInviteRequiresPasswordBeforeLinkingMembership(): void
    {
        $email = 'existing-account@example.test';
        $password = 'account owner secret, only they know';
        $account = $this->pdo->prepare(
            'INSERT INTO user_accounts (email, password_hash) VALUES (:email, :password_hash)'
        );
        $account->execute([
            'email' => $email,
            'password_hash' => password_hash($password, PASSWORD_ARGON2ID),
        ]);
        $accountId = (int) $this->pdo->lastInsertId();

        $admin = $this->login($this->adminEmail);
        $created = $this->cookieRequest('POST', '/api/v1/users/invites', $admin['cookie'], [
            'name' => 'Existing account owner',
            'email' => $email,
            'role' => 'developer',
        ], $admin['csrf']);
        self::assertSame(201, $created->status, json_encode($created->body));
        $inviteToken = $this->tokenFromCredentialUrl($created->body['invite']['invite_url'], 'invite');
        $inspection = $this->request('POST', '/api/v1/auth/invites/inspect', ['token' => $inviteToken]);
        self::assertSame(200, $inspection->status, json_encode($inspection->body));
        self::assertTrue($inspection->body['invite']['password_required']);
        self::assertFalse($inspection->body['invite']['email_verification_required']);

        $unauthenticated = $this->request('POST', '/api/v1/auth/invites/accept', ['token' => $inviteToken]);
        self::assertSame(401, $unauthenticated->status);
        self::assertSame(0, $this->workspaceMembershipCount($email));

        $wrongPassword = $this->request('POST', '/api/v1/auth/invites/accept', [
            'token' => $inviteToken,
            'password' => 'not the account password',
        ]);
        self::assertSame(401, $wrongPassword->status);
        self::assertSame(0, $this->workspaceMembershipCount($email));

        $accepted = $this->request('POST', '/api/v1/auth/invites/accept', [
            'token' => $inviteToken,
            'password' => $password,
        ]);
        self::assertSame(200, $accepted->status, json_encode($accepted->body));
        $membership = $this->pdo->prepare(
            'SELECT account_id FROM users WHERE workspace_id = :workspace_id AND email = :email'
        );
        $membership->execute(['workspace_id' => $this->workspaceId, 'email' => $email]);
        self::assertSame($accountId, (int) $membership->fetchColumn());
    }

    public function testNewAccountInviteRequiresEmailVerificationCode(): void
    {
        $admin = $this->login($this->adminEmail);
        $email = 'new-invitee@example.test';
        $created = $this->cookieRequest('POST', '/api/v1/users/invites', $admin['cookie'], [
            'name' => 'New Invitee',
            'email' => $email,
            'role' => 'developer',
        ], $admin['csrf']);

        self::assertSame(201, $created->status, json_encode($created->body));
        self::assertCount(1, $this->mailer->messages);
        self::assertSame($email, $this->mailer->messages[0]['to']);
        self::assertArrayNotHasKey('verification_code', $created->body['invite']);
        self::assertSame(1, preg_match('/Verification code: ([a-f0-9]{64})/', $this->mailer->messages[0]['body'], $matches));
        $verificationCode = $matches[1];
        $inviteToken = $this->tokenFromCredentialUrl($created->body['invite']['invite_url'], 'invite');

        $inspection = $this->request('POST', '/api/v1/auth/invites/inspect', ['token' => $inviteToken]);
        self::assertSame(200, $inspection->status, json_encode($inspection->body));
        self::assertTrue($inspection->body['invite']['password_required']);
        self::assertTrue($inspection->body['invite']['email_verification_required']);

        $withoutCode = $this->request('POST', '/api/v1/auth/invites/accept', [
            'token' => $inviteToken,
            'password' => 'a calm orchard under winter stars',
        ]);
        self::assertSame(400, $withoutCode->status);
        self::assertSame(0, $this->workspaceMembershipCount($email));

        $wrongCode = $this->request('POST', '/api/v1/auth/invites/accept', [
            'token' => $inviteToken,
            'password' => 'a calm orchard under winter stars',
            'verification_code' => str_repeat('0', 64),
        ]);
        self::assertSame(400, $wrongCode->status);
        self::assertSame(0, $this->workspaceMembershipCount($email));

        $accepted = $this->request('POST', '/api/v1/auth/invites/accept', [
            'token' => $inviteToken,
            'password' => 'a calm orchard under winter stars',
            'verification_code' => $verificationCode,
        ]);
        self::assertSame(200, $accepted->status, json_encode($accepted->body));
        self::assertSame($email, $accepted->body['user']['email']);
    }

    public function testInviteCanBeListedRegeneratedAndRevokedByWorkspaceAdmin(): void
    {
        $admin = $this->login($this->adminEmail);
        $created = $this->cookieRequest('POST', '/api/v1/users/invites', $admin['cookie'], [
            'name' => 'Mira Fox',
            'email' => 'mira@example.test',
            'role' => 'developer',
        ], $admin['csrf']);
        self::assertSame(201, $created->status, json_encode($created->body));
        $firstToken = $this->tokenFromCredentialUrl($created->body['invite']['invite_url'], 'invite');

        $listed = $this->cookieRequest('GET', '/api/v1/users/invites', $admin['cookie']);
        self::assertSame(200, $listed->status);
        self::assertCount(1, $listed->body['invites']);
        self::assertArrayNotHasKey('token', $listed->body['invites'][0]);
        self::assertArrayNotHasKey('invite_url', $listed->body['invites'][0]);

        $resent = $this->cookieRequest(
            'POST',
            '/api/v1/users/invites/' . $created->body['invite']['id'] . '/link',
            $admin['cookie'],
            [],
            $admin['csrf'],
        );
        self::assertSame(200, $resent->status, json_encode($resent->body));
        $secondToken = $this->tokenFromCredentialUrl($resent->body['invite']['invite_url'], 'invite');
        self::assertNotSame($firstToken, $secondToken);
        self::assertSame(400, $this->request('POST', '/api/v1/auth/invites/accept', [
            'token' => $firstToken,
            'password' => 'a strong password phrase under stars',
        ])->status);

        $revoked = $this->cookieRequest(
            'DELETE',
            '/api/v1/users/invites/' . $created->body['invite']['id'],
            $admin['cookie'],
            [],
            $admin['csrf'],
        );
        self::assertSame(204, $revoked->status);
        self::assertSame(400, $this->request('POST', '/api/v1/auth/invites/accept', [
            'token' => $secondToken,
            'password' => 'a strong password phrase under stars',
        ])->status);
        self::assertSame([], $this->cookieRequest('GET', '/api/v1/users/invites', $admin['cookie'])->body['invites']);
    }

    public function testNonAdminMembersCannotManageWorkspaceInvites(): void
    {
        $admin = $this->login($this->adminEmail);
        $created = $this->cookieRequest('POST', '/api/v1/users', $admin['cookie'], [
            'name' => 'Workspace Developer',
            'email' => 'workspace-developer@example.test',
            'password' => 'a secure developer password phrase',
            'role' => 'developer',
        ], $admin['csrf']);
        self::assertSame(201, $created->status, json_encode($created->body));
        $developer = $this->login('workspace-developer@example.test', 'a secure developer password phrase');

        self::assertSame(403, $this->cookieRequest('GET', '/api/v1/users/invites', $developer['cookie'])->status);
        self::assertSame(403, $this->cookieRequest('POST', '/api/v1/users/invites', $developer['cookie'], [
            'name' => 'Another Developer',
            'email' => 'another-developer@example.test',
            'role' => 'developer',
        ], $developer['csrf'])->status);
        self::assertSame(403, $this->cookieRequest(
            'POST',
            '/api/v1/users/invites/1/link',
            $developer['cookie'],
            [],
            $developer['csrf'],
        )->status);
        self::assertSame(403, $this->cookieRequest(
            'DELETE',
            '/api/v1/users/invites/1',
            $developer['cookie'],
            [],
            $developer['csrf'],
        )->status);
        self::assertSame(403, $this->cookieRequest(
            'POST',
            '/api/v1/users/' . $this->adminId . '/password-reset',
            $developer['cookie'],
            [],
            $developer['csrf'],
        )->status);
        self::assertSame(403, $this->cookieRequest(
            'PATCH',
            '/api/v1/users/' . $this->adminId . '/status',
            $developer['cookie'],
            ['is_active' => false],
            $developer['csrf'],
        )->status);
        self::assertSame(403, $this->cookieRequest(
            'PATCH',
            '/api/v1/users/' . $this->adminId . '/role',
            $developer['cookie'],
            ['role' => 'guest'],
            $developer['csrf'],
        )->status);
        self::assertSame(403, $this->cookieRequest(
            'GET',
            '/api/v1/users/' . $this->adminId . '/projects',
            $developer['cookie'],
        )->status);
        self::assertSame(403, $this->cookieRequest(
            'PUT',
            '/api/v1/users/' . $this->adminId . '/projects',
            $developer['cookie'],
            ['project_ids' => []],
            $developer['csrf'],
        )->status);
    }

    public function testWorkspaceAdminCanManageGuestProjectsInOnlyTheCurrentWorkspace(): void
    {
        $admin = $this->login($this->adminEmail);
        $createdGuest = $this->cookieRequest('POST', '/api/v1/users', $admin['cookie'], [
            'name' => 'Guest Contact',
            'email' => 'guest-access@example.test',
            'password' => 'a calm guest access password phrase',
            'role' => 'guest',
        ], $admin['csrf']);
        self::assertSame(201, $createdGuest->status, json_encode($createdGuest->body));
        $guestId = (int) $createdGuest->body['user']['id'];

        $firstProjectId = $this->insertProject('First guest project', 'first-guest-project', $this->adminId);
        $secondProjectId = $this->insertProject('Second guest project', 'second-guest-project', $this->adminId);
        $archivedProjectId = $this->insertProject('Archived guest project', 'archived-guest-project', $this->adminId);
        $completedProjectId = $this->insertProject('Completed guest project', 'completed-guest-project', $this->adminId);
        $archive = $this->pdo->prepare('UPDATE projects SET status = :status WHERE workspace_id = :workspace_id AND id = :id');
        $archive->execute(['status' => 'archived', 'workspace_id' => $this->workspaceId, 'id' => $archivedProjectId]);
        $archive->execute(['status' => 'completed', 'workspace_id' => $this->workspaceId, 'id' => $completedProjectId]);
        $memberships = $this->pdo->prepare(
            'INSERT INTO project_memberships (workspace_id, project_id, user_id)
             VALUES (:workspace_id, :project_id, :user_id)'
        );
        foreach ([$firstProjectId, $archivedProjectId, $completedProjectId] as $projectId) {
            $memberships->execute(['workspace_id' => $this->workspaceId, 'project_id' => $projectId, 'user_id' => $guestId]);
        }

        $read = $this->cookieRequest('GET', '/api/v1/users/' . $guestId . '/projects', $admin['cookie']);
        self::assertSame(200, $read->status, json_encode($read->body));
        self::assertEqualsCanonicalizing([$firstProjectId, $archivedProjectId, $completedProjectId], $read->body['project_ids']);
        self::assertEqualsCanonicalizing(
            [$firstProjectId, $secondProjectId, $archivedProjectId, $completedProjectId],
            array_column($read->body['projects'], 'id'),
        );
        $guest = $this->login('guest-access@example.test', 'a calm guest access password phrase');

        $updated = $this->cookieRequest('PUT', '/api/v1/users/' . $guestId . '/projects', $admin['cookie'], [
            'project_ids' => [$secondProjectId],
        ], $admin['csrf']);
        self::assertSame(200, $updated->status, json_encode($updated->body));
        self::assertSame([$secondProjectId], $updated->body['project_ids']);
        self::assertFalse($this->projectHasMember($firstProjectId, $guestId));
        self::assertTrue($this->projectHasMember($secondProjectId, $guestId));
        self::assertFalse($this->projectHasMember($archivedProjectId, $guestId));
        self::assertFalse($this->projectHasMember($completedProjectId, $guestId));
        self::assertSame(404, $this->cookieRequest(
            'GET',
            '/api/v1/projects/' . $archivedProjectId . '/client-view',
            $guest['cookie'],
        )->status);

        $empty = $this->cookieRequest('PUT', '/api/v1/users/' . $guestId . '/projects', $admin['cookie'], [
            'project_ids' => [],
        ], $admin['csrf']);
        self::assertSame(200, $empty->status, json_encode($empty->body));
        self::assertSame([], $empty->body['project_ids']);

        $otherWorkspaceId = $this->insertWorkspace('Other guest workspace');
        $otherAdminAccountId = $this->insertAccount('other-admin@example.test', 'another secure password phrase');
        $otherAdminId = $this->insertWorkspaceMembership(
            $otherWorkspaceId,
            $otherAdminAccountId,
            'Other Admin',
            'other-admin@example.test',
            'admin',
        );
        $otherProject = $this->pdo->prepare(
            'INSERT INTO projects (workspace_id, name, slug, description, status, created_by)
             VALUES (:workspace_id, :name, :slug, :description, :status, :created_by)'
        );
        $otherProject->execute([
            'workspace_id' => $otherWorkspaceId,
            'name' => 'Other workspace project',
            'slug' => 'other-workspace-project',
            'description' => '',
            'status' => 'active',
            'created_by' => $otherAdminId,
        ]);
        $otherProjectId = (int) $this->pdo->lastInsertId();
        $invalid = $this->cookieRequest('PUT', '/api/v1/users/' . $guestId . '/projects', $admin['cookie'], [
            'project_ids' => [$otherProjectId],
        ], $admin['csrf']);
        self::assertSame(422, $invalid->status);

        $notGuest = $this->cookieRequest('GET', '/api/v1/users/' . $this->developerId . '/projects', $admin['cookie']);
        self::assertSame(409, $notGuest->status, json_encode($notGuest->body));
    }

    public function testWorkspaceAdminCanChangeMemberRoleInOnlyTheCurrentWorkspace(): void
    {
        $accountId = $this->accountIdForUser($this->workspaceId, $this->developerId);
        $otherWorkspaceId = $this->insertWorkspace('Role change other workspace');
        $otherMembershipId = $this->insertWorkspaceMembership(
            $otherWorkspaceId,
            $accountId,
            'Workspace Developer',
            $this->developerEmail,
            'developer',
        );
        $projectId = $this->insertProject('Role change project', 'role-change-project', $this->adminId);
        $projectMembership = $this->pdo->prepare(
            'INSERT INTO project_memberships (workspace_id, project_id, user_id)
             VALUES (:workspace_id, :project_id, :user_id)'
        );
        $projectMembership->execute([
            'workspace_id' => $this->workspaceId,
            'project_id' => $projectId,
            'user_id' => $this->developerId,
        ]);
        $admin = $this->login($this->adminEmail);

        foreach (['guest', 'admin', 'developer'] as $role) {
            $response = $this->cookieRequest(
                'PATCH',
                '/api/v1/users/' . $this->developerId . '/role',
                $admin['cookie'],
                ['role' => $role],
                $admin['csrf'],
            );
            self::assertSame(200, $response->status, json_encode($response->body));
            self::assertSame($role, $response->body['user']['role']);
        }

        $otherRole = $this->pdo->prepare('SELECT role FROM users WHERE workspace_id = :workspace_id AND id = :id');
        $otherRole->execute(['workspace_id' => $otherWorkspaceId, 'id' => $otherMembershipId]);
        self::assertSame('developer', $otherRole->fetchColumn());
        self::assertTrue($this->projectHasMember($projectId, $this->developerId));

        $invalid = $this->cookieRequest(
            'PATCH',
            '/api/v1/users/' . $this->developerId . '/role',
            $admin['cookie'],
            ['role' => 'owner'],
            $admin['csrf'],
        );
        self::assertSame(422, $invalid->status);
    }

    public function testWorkspaceAdminCannotChangeTheirOwnRole(): void
    {
        $admin = $this->login($this->adminEmail);
        $response = $this->cookieRequest(
            'PATCH',
            '/api/v1/users/' . $this->adminId . '/role',
            $admin['cookie'],
            ['role' => 'developer'],
            $admin['csrf'],
        );

        self::assertSame(409, $response->status, json_encode($response->body));
        self::assertSame('self_role_change', $response->body['error']['code']);
        self::assertSame(200, $this->request('GET', '/api/v1/auth/me', cookies: [
            'tangent_session' => $admin['cookie'],
        ])->status);
    }

    public function testAdminCanDeactivateAndReactivateWorkspaceMembership(): void
    {
        $accountId = $this->accountIdForUser($this->workspaceId, $this->developerId);
        $otherWorkspaceId = $this->insertWorkspace('Developer other workspace');
        $otherMembershipId = $this->insertWorkspaceMembership(
            $otherWorkspaceId,
            $accountId,
            'Workspace Developer',
            $this->developerEmail,
            'developer',
        );
        $projectId = $this->insertProject('Membership access project', 'membership-access-project', $this->adminId);
        $projectMembership = $this->pdo->prepare(
            'INSERT INTO project_memberships (workspace_id, project_id, user_id)
             VALUES (:workspace_id, :project_id, :user_id)'
        );
        $projectMembership->execute([
            'workspace_id' => $this->workspaceId,
            'project_id' => $projectId,
            'user_id' => $this->developerId,
        ]);

        $developer = $this->login($this->developerEmail);
        $apiTokenResponse = $this->cookieRequest(
            'POST',
            '/api/v1/tokens',
            $developer['cookie'],
            ['label' => 'Membership access token'],
            $developer['csrf'],
        );
        self::assertSame(201, $apiTokenResponse->status, json_encode($apiTokenResponse->body));
        $apiToken = $apiTokenResponse->body['token'];

        $otherWorkspaceSource = $this->login($this->developerEmail);
        $otherWorkspaceSession = $this->cookieRequest(
            'POST',
            '/api/v1/workspaces/' . $otherWorkspaceId . '/switch',
            $otherWorkspaceSource['cookie'],
            [],
            $otherWorkspaceSource['csrf'],
        );
        self::assertSame(200, $otherWorkspaceSession->status, json_encode($otherWorkspaceSession->body));
        $otherWorkspaceCookie = $this->responseCookie($otherWorkspaceSession, 'tangent_session');
        $otherWorkspaceCsrf = $this->responseCookie($otherWorkspaceSession, 'tangent_csrf');
        $otherApiTokenResponse = $this->request(
            'POST',
            '/api/v1/tokens',
            ['label' => 'Other workspace token'],
            ['X-CSRF-Token' => $otherWorkspaceCsrf],
            [
                'tangent_session' => $otherWorkspaceCookie,
                'tangent_workspace' => (string) $otherWorkspaceId,
            ],
        );
        self::assertSame(201, $otherApiTokenResponse->status, json_encode($otherApiTokenResponse->body));
        $otherApiToken = $otherApiTokenResponse->body['token'];

        $admin = $this->login($this->adminEmail);
        $deactivated = $this->cookieRequest(
            'PATCH',
            '/api/v1/users/' . $this->developerId . '/status',
            $admin['cookie'],
            ['is_active' => false],
            $admin['csrf'],
        );

        self::assertSame(200, $deactivated->status, json_encode($deactivated->body));
        self::assertFalse((bool) $deactivated->body['user']['is_active']);
        self::assertSame(401, $this->request('GET', '/api/v1/auth/me', cookies: [
            'tangent_session' => $developer['cookie'],
        ])->status);
        self::assertSame(401, $this->request('GET', '/api/v1/auth/me', headers: [
            'Authorization' => 'Bearer ' . $apiToken,
            'X-Tangent-Workspace' => (string) $this->workspaceId,
        ])->status);
        self::assertSame(200, $this->request('GET', '/api/v1/auth/me', headers: [
            'Authorization' => 'Bearer ' . $otherApiToken,
            'X-Tangent-Workspace' => (string) $otherWorkspaceId,
        ])->status, 'Deactivation must preserve credentials for the account\'s other workspace.');
        $secondaryLogin = $this->request('POST', '/api/v1/auth/login', [
            'email' => $this->developerEmail,
            'password' => $this->password,
        ]);
        self::assertSame(200, $secondaryLogin->status, json_encode($secondaryLogin->body));
        self::assertSame($otherWorkspaceId, $secondaryLogin->body['user']['workspace_id']);

        $tokens = $this->pdo->prepare(
            'SELECT COUNT(*) FROM api_tokens
             WHERE workspace_id = :workspace_id AND user_id = :user_id
               AND token_type = :token_type AND revoked_at IS NULL'
        );
        $tokens->execute([
            'workspace_id' => $this->workspaceId,
            'user_id' => $this->developerId,
            'token_type' => 'session',
        ]);
        self::assertSame(0, (int) $tokens->fetchColumn());

        $membershipState = $this->pdo->prepare('SELECT is_active FROM users WHERE workspace_id = :workspace_id AND id = :id');
        $membershipState->execute(['workspace_id' => $otherWorkspaceId, 'id' => $otherMembershipId]);
        self::assertTrue((bool) $membershipState->fetchColumn());
        self::assertTrue($this->projectHasMember($projectId, $this->developerId));

        $reactivated = $this->cookieRequest(
            'PATCH',
            '/api/v1/users/' . $this->developerId . '/status',
            $admin['cookie'],
            ['is_active' => true],
            $admin['csrf'],
        );
        self::assertSame(200, $reactivated->status, json_encode($reactivated->body));
        self::assertTrue((bool) $reactivated->body['user']['is_active']);
        self::assertSame(401, $this->request('GET', '/api/v1/auth/me', cookies: [
            'tangent_session' => $developer['cookie'],
        ])->status, 'Deactivation revokes old sessions permanently.');
        self::assertSame(401, $this->request('GET', '/api/v1/auth/me', headers: [
            'Authorization' => 'Bearer ' . $apiToken,
            'X-Tangent-Workspace' => (string) $this->workspaceId,
        ])->status, 'Deactivation revokes API tokens permanently.');
        self::assertSame(200, $this->request('GET', '/api/v1/auth/me', headers: [
            'Authorization' => 'Bearer ' . $otherApiToken,
            'X-Tangent-Workspace' => (string) $otherWorkspaceId,
        ])->status, 'Reactivation must not affect API tokens for other workspaces.');

        $reactivatedDeveloper = $this->login($this->developerEmail);
        self::assertSame($this->workspaceId, $reactivatedDeveloper['user']['workspace_id']);
        $newApiTokenResponse = $this->cookieRequest(
            'POST',
            '/api/v1/tokens',
            $reactivatedDeveloper['cookie'],
            ['label' => 'Fresh membership token'],
            $reactivatedDeveloper['csrf'],
        );
        self::assertSame(201, $newApiTokenResponse->status, json_encode($newApiTokenResponse->body));
        self::assertSame(200, $this->request('GET', '/api/v1/auth/me', headers: [
            'Authorization' => 'Bearer ' . $newApiTokenResponse->body['token'],
            'X-Tangent-Workspace' => (string) $this->workspaceId,
        ])->status, 'A new API token works after the membership is reactivated.');
    }

    public function testWorkspaceAdminCannotDeactivateTheLastActiveAdmin(): void
    {
        $admin = $this->login($this->adminEmail);
        $response = $this->cookieRequest(
            'PATCH',
            '/api/v1/users/' . $this->adminId . '/status',
            $admin['cookie'],
            ['is_active' => false],
            $admin['csrf'],
        );

        self::assertSame(409, $response->status, json_encode($response->body));
        self::assertSame('last_active_admin', $response->body['error']['code']);
        self::assertSame(200, $this->request('GET', '/api/v1/auth/me', cookies: [
            'tangent_session' => $admin['cookie'],
        ])->status);
    }

    public function testInviteAcceptanceLinksAnExistingAccountFromAnotherWorkspace(): void
    {
        $otherWorkspace = $this->insertWorkspace('Other account workspace');
        $password = 'older secure password phrase';
        $accountId = $this->insertAccount('returning@example.test', $password);
        $otherUserId = $this->insertWorkspaceMembership($otherWorkspace, $accountId, 'Returning Member', 'returning@example.test', 'developer');
        $admin = $this->login($this->adminEmail);
        $invite = $this->cookieRequest('POST', '/api/v1/users/invites', $admin['cookie'], [
            'name' => 'Returning Member',
            'email' => 'returning@example.test',
            'role' => 'developer',
        ], $admin['csrf']);
        self::assertSame(201, $invite->status, json_encode($invite->body));
        $token = $this->tokenFromCredentialUrl($invite->body['invite']['invite_url'], 'invite');

        $inspection = $this->request('POST', '/api/v1/auth/invites/inspect', ['token' => $token]);
        self::assertSame(200, $inspection->status);
        self::assertTrue($inspection->body['invite']['password_required']);
        self::assertFalse($inspection->body['invite']['email_verification_required']);

        $accepted = $this->request('POST', '/api/v1/auth/invites/accept', ['token' => $token, 'password' => $password]);
        self::assertSame(200, $accepted->status, json_encode($accepted->body));
        self::assertSame('returning@example.test', $accepted->body['user']['email']);

        $newMembership = $this->pdo->prepare('SELECT account_id FROM users WHERE workspace_id = :workspace_id AND email = :email');
        $newMembership->execute(['workspace_id' => $this->workspaceId, 'email' => 'returning@example.test']);
        self::assertSame($accountId, (int) $newMembership->fetchColumn());
        self::assertSame($accountId, $this->accountIdForUser($otherWorkspace, $otherUserId));
        self::assertSame('returning@example.test', $this->login('returning@example.test', 'older secure password phrase')['user']['email']);
    }

    public function testAdminGeneratesOneUsePasswordResetLinkAndCompletionRevokesAllTokens(): void
    {
        $admin = $this->login($this->adminEmail);
        $sessionCookie = $admin['cookie'];
        $otherWorkspaceId = $this->insertWorkspace('Password reset token workspace');
        $adminAccountId = $this->accountIdForUser($this->workspaceId, $this->adminId);
        $this->insertWorkspaceMembership(
            $otherWorkspaceId,
            $adminAccountId,
            'Workspace Admin',
            $this->adminEmail,
            'admin',
        );
        $otherApplication = Application::create($this->pdo, new AppConfig($otherWorkspaceId, false));
        $otherLogin = $otherApplication->handle(Request::json('POST', '/api/v1/auth/login', [
            'email' => $this->adminEmail,
            'password' => $this->password,
        ]));
        self::assertSame(200, $otherLogin->status, json_encode($otherLogin->body));
        $otherSessionCookie = $this->cookieFrom($otherLogin);
        $otherApiTokenResponse = $otherApplication->handle(Request::json(
            'POST',
            '/api/v1/tokens',
            ['label' => 'cross-workspace reset security test'],
            ['X-CSRF-Token' => $otherLogin->body['csrf_token']],
            ['tangent_session' => $otherSessionCookie],
        ));
        self::assertSame(201, $otherApiTokenResponse->status, json_encode($otherApiTokenResponse->body));
        $otherApiToken = $otherApiTokenResponse->body['token'];

        $apiTokenResponse = $this->cookieRequest(
            'POST',
            '/api/v1/tokens',
            $admin['cookie'],
            ['label' => 'reset security test'],
            $admin['csrf'],
        );
        self::assertSame(201, $apiTokenResponse->status, json_encode($apiTokenResponse->body));
        $apiToken = $apiTokenResponse->body['token'];
        $generated = $this->cookieRequest(
            'POST',
            '/api/v1/users/' . $this->adminId . '/password-reset',
            $admin['cookie'],
            [],
            $admin['csrf'],
        );
        self::assertSame(200, $generated->status, json_encode($generated->body));
        self::assertArrayNotHasKey('reset_url', $generated->body, 'Workspace admins must not receive an account-wide recovery credential.');
        self::assertSame($this->adminEmail, $this->mailer->messages[0]['to']);
        self::assertCount(1, $this->mailer->messages);
        preg_match('/#reset=([a-f0-9]{64})/', $this->mailer->messages[0]['body'], $resetTokenMatch);
        self::assertArrayHasKey(1, $resetTokenMatch, 'The reset credential is delivered only in the account email.');
        $token = $resetTokenMatch[1];

        $completed = $this->request('POST', '/api/v1/auth/password-reset/complete', [
            'token' => $token,
            'password' => 'an entirely new password phrase',
        ]);
        self::assertSame(204, $completed->status);
        self::assertSame(401, $this->request('GET', '/api/v1/auth/me', cookies: ['tangent_session' => $sessionCookie])->status);
        self::assertSame(401, $otherApplication->handle(Request::json(
            'GET',
            '/api/v1/auth/me',
            cookies: ['tangent_session' => $otherSessionCookie],
        ))->status, 'Password reset revokes sessions across workspaces.');
        self::assertSame(401, $this->request('GET', '/api/v1/auth/me', headers: [
            'Authorization' => 'Bearer ' . $apiToken,
        ])->status, 'Password reset also revokes API tokens for the account.');
        self::assertSame(401, $otherApplication->handle(Request::json(
            'GET',
            '/api/v1/auth/me',
            headers: ['Authorization' => 'Bearer ' . $otherApiToken],
        ))->status, 'Password reset revokes API tokens across workspaces.');
        self::assertSame(401, $this->request('POST', '/api/v1/auth/login', [
            'email' => $this->adminEmail,
            'password' => $this->password,
        ])->status);
        self::assertSame($this->adminEmail, $this->login($this->adminEmail, 'an entirely new password phrase')['user']['email']);
        self::assertSame(400, $this->request('POST', '/api/v1/auth/password-reset/complete', [
            'token' => $token,
            'password' => 'yet another password phrase',
        ])->status);
    }

    public function testPasswordRecoveryEmailFailureDoesNotLeaveAUsableResetCredential(): void
    {
        $admin = $this->login($this->adminEmail);
        $this->mailer->deliveryResult = false;

        $response = $this->cookieRequest(
            'POST',
            '/api/v1/users/' . $this->developerId . '/password-reset',
            $admin['cookie'],
            [],
            $admin['csrf'],
        );

        self::assertSame(503, $response->status, json_encode($response->body));
        $credential = $this->pdo->query(
            "SELECT used_at, revoked_at FROM credential_tokens WHERE token_type = 'password_reset' ORDER BY id DESC LIMIT 1"
        )->fetch(\PDO::FETCH_ASSOC);
        self::assertNotFalse($credential);
        self::assertNull($credential['used_at']);
        self::assertNotNull($credential['revoked_at'], 'An undelivered recovery token must be unusable.');
    }

    public function testLegacyPasswordHashesAreUpgradedOnLogin(): void
    {
        $legacyHash = password_hash($this->password, PASSWORD_BCRYPT);
        $update = $this->pdo->prepare('UPDATE user_accounts SET password_hash = :hash WHERE email = :email');
        $update->execute(['hash' => $legacyHash, 'email' => $this->adminEmail]);

        self::assertSame($this->adminEmail, $this->login($this->adminEmail)['user']['email']);

        $query = $this->pdo->prepare('SELECT password_hash FROM user_accounts WHERE email = :email');
        $query->execute(['email' => $this->adminEmail]);
        self::assertSame('argon2id', password_get_info((string) $query->fetchColumn())['algoName']);
    }

    public function testInviteAcceptanceAndResetCompletionUseRateLimitsAndPasswordPolicy(): void
    {
        $admin = $this->login($this->adminEmail);
        $created = $this->cookieRequest('POST', '/api/v1/users', $admin['cookie'], [
            'name' => 'Long Password User',
            'email' => 'long-password@example.test',
            'password' => 'short-enough-1',
        ], $admin['csrf']);
        self::assertSame(422, $created->status);
        self::assertSame('password_rejected', $created->body['error']['code']);

        for ($attempt = 0; $attempt < 3; $attempt++) {
            self::assertSame(400, $this->request(
                'POST',
                '/api/v1/auth/invites/accept',
                ['token' => str_repeat('0', 64)],
                remoteAddress: '192.0.2.44',
            )->status);
        }
        for ($attempt = 0; $attempt < 2; $attempt++) {
            self::assertSame(400, $this->request(
                'POST',
                '/api/v1/auth/invites/inspect',
                ['token' => str_repeat('2', 64)],
                remoteAddress: '192.0.2.44',
            )->status);
        }
        self::assertSame(429, $this->request(
            'POST',
            '/api/v1/auth/invites/accept',
            ['token' => str_repeat('1', 64)],
            remoteAddress: '192.0.2.44',
        )->status);

        for ($attempt = 0; $attempt < 5; $attempt++) {
            self::assertSame(400, $this->request(
                'POST',
                '/api/v1/auth/password-reset/complete',
                ['token' => str_repeat((string) ($attempt + 3), 64), 'password' => 'another secure password phrase'],
                remoteAddress: '192.0.2.45',
            )->status);
        }
        self::assertSame(429, $this->request(
            'POST',
            '/api/v1/auth/password-reset/complete',
            ['token' => str_repeat('9', 64), 'password' => 'another secure password phrase'],
            remoteAddress: '192.0.2.45',
        )->status);
    }

    private function tokenFromCredentialUrl(string $url, string $type): string
    {
        self::assertMatchesRegularExpression('/#' . preg_quote($type, '/') . '=([a-f0-9]{64})$/', $url);
        preg_match('/#' . preg_quote($type, '/') . '=([a-f0-9]{64})$/', $url, $matches);
        return $matches[1];
    }

    private function cookieFrom(\Tangent\Core\Response $response): string
    {
        foreach ((array) ($response->headers['set-cookie'] ?? []) as $cookie) {
            if (preg_match('/(?:^|;\s*)tangent_session=([^;]*)/', $cookie, $matches) === 1) {
                return rawurldecode($matches[1]);
            }
        }
        self::fail('Expected session cookie.');
    }

    private function responseCookie(\Tangent\Core\Response $response, string $name): string
    {
        foreach ((array) ($response->headers['set-cookie'] ?? []) as $cookie) {
            if (preg_match('/(?:^|;\s*)' . preg_quote($name, '/') . '=([^;]*)/', $cookie, $matches) === 1) {
                return rawurldecode($matches[1]);
            }
        }
        self::fail("Expected {$name} cookie.");
    }

    private function projectHasMember(int $projectId, int $userId): bool
    {
        $statement = $this->pdo->prepare('SELECT 1 FROM project_memberships WHERE workspace_id = :workspace_id AND project_id = :project_id AND user_id = :user_id');
        $statement->execute(['workspace_id' => $this->workspaceId, 'project_id' => $projectId, 'user_id' => $userId]);
        return $statement->fetchColumn() !== false;
    }

    private function insertWorkspace(string $name): int
    {
        $statement = $this->pdo->prepare('INSERT INTO workspaces (name, slug) VALUES (:name, :slug)');
        $statement->execute(['name' => $name, 'slug' => 'other-' . bin2hex(random_bytes(5))]);
        return (int) $this->pdo->lastInsertId();
    }

    private function insertAccount(string $email, string $password): int
    {
        $statement = $this->pdo->prepare('INSERT INTO user_accounts (email, password_hash) VALUES (:email, :password_hash)');
        $statement->execute([
            'email' => $email,
            'password_hash' => password_hash($password, PASSWORD_ARGON2ID),
        ]);
        return (int) $this->pdo->lastInsertId();
    }

    private function insertWorkspaceMembership(int $workspaceId, int $accountId, string $name, string $email, string $role): int
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO users (workspace_id, account_id, name, email, role, is_active)
             VALUES (:workspace_id, :account_id, :name, :email, :role, 1)'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'account_id' => $accountId,
            'name' => $name,
            'email' => $email,
            'role' => $role,
        ]);
        return (int) $this->pdo->lastInsertId();
    }

    private function accountIdForUser(int $workspaceId, int $userId): int
    {
        $statement = $this->pdo->prepare('SELECT account_id FROM users WHERE workspace_id = :workspace_id AND id = :id');
        $statement->execute(['workspace_id' => $workspaceId, 'id' => $userId]);
        return (int) $statement->fetchColumn();
    }

    private function workspaceMembershipCount(string $email): int
    {
        $statement = $this->pdo->prepare('SELECT COUNT(*) FROM users WHERE workspace_id = :workspace_id AND email = :email');
        $statement->execute(['workspace_id' => $this->workspaceId, 'email' => $email]);
        return (int) $statement->fetchColumn();
    }
}
