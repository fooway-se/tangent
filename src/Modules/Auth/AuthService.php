<?php

declare(strict_types=1);

namespace Tangent\Modules\Auth;

use PDO;
use Throwable;
use Tangent\Core\ApiException;
use Tangent\Core\AppConfig;
use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Permissions;
use Tangent\Core\Request;
use Tangent\Modules\Workspaces\WorkspaceRepository;

final class AuthService
{
    private const LOGIN_IP_LIMIT = 100;
    private const LOGIN_WINDOW_SECONDS = 900;

    public function __construct(
        private readonly PDO $pdo,
        private readonly UserRepository $users,
        private readonly TokenRepository $tokens,
        private readonly RateLimiter $rateLimiter,
        private readonly AppConfig $config,
        private readonly PasswordSecurity $passwords,
        private readonly WorkspaceRepository $workspaces,
    ) {
    }

    public function login(Request $request): array
    {
        $this->assertLoginOrigin($request);
        $email = UserRepository::normalizeEmail((string) ($request->body['email'] ?? ''));
        $password = (string) ($request->body['password'] ?? '');

        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email, 'UTF-8') > 254 || $password === '') {
            throw new ApiException(401, 'invalid_credentials', 'Email or password is incorrect.');
        }

        if (!$this->rateLimiter->allow(
            $this->config->workspaceId,
            'login-ip:' . $request->remoteAddress,
            self::LOGIN_IP_LIMIT,
            self::LOGIN_WINDOW_SECONDS,
        )) {
            throw new ApiException(429, 'rate_limited', 'Too many login attempts. Try again later.');
        }

        $identityBucket = 'login:' . $request->remoteAddress . ':' . $email;
        if (!$this->rateLimiter->allow(
            $this->config->workspaceId,
            $identityBucket,
            5,
            self::LOGIN_WINDOW_SECONDS,
        )) {
            throw new ApiException(429, 'rate_limited', 'Too many login attempts. Try again later.');
        }

        $user = $this->users->findByEmail($this->config->workspaceId, $email);
        if ($user === null || !(bool) $user['is_active'] || !$this->passwords->verify($password, (string) $user['password_hash'])) {
            throw new ApiException(401, 'invalid_credentials', 'Email or password is incorrect.');
        }
        if ($this->passwords->needsRehash((string) $user['password_hash'])) {
            $this->users->updateAccountPassword((int) $user['account_id'], $password);
        }
        return $this->createSessionForMember($this->config->workspaceId, (int) $user['id']);
    }

    public function createSessionForMember(int $workspaceId, int $userId): array
    {
        $user = $this->users->findById($workspaceId, $userId);
        if ($user === null || !(bool) $user['is_active']) {
            throw new ApiException(404, 'not_found', 'The workspace member was not found.');
        }
        $sessionToken = bin2hex(random_bytes(32));
        $csrfToken = bin2hex(random_bytes(32));
        $expiresAt = gmdate('Y-m-d H:i:s', time() + $this->config->sessionLifetimeSeconds);
        $this->tokens->create(
            $workspaceId,
            $userId,
            hash('sha256', $sessionToken),
            'session',
            'Browser session',
            hash('sha256', $csrfToken),
            $expiresAt,
        );
        return [
            'user' => $this->publicUser($user),
            'session_token' => $sessionToken,
            'csrf_token' => $csrfToken,
            'expires_at' => $expiresAt,
        ];
    }

    public function createApiToken(AuthenticatedUser $user, string $label, string $remoteAddress): array
    {
        if (!Permissions::can($user, 'tokens.create')) {
            throw new ApiException(403, 'forbidden', 'You cannot create API tokens.');
        }

        $label = trim($label);
        if ($label === '' || mb_strlen($label, 'UTF-8') > 100) {
            throw new ApiException(422, 'validation_failed', 'Token label must be between 1 and 100 characters.');
        }

        if (!$this->rateLimiter->allow(
            $user->workspaceId,
            'token:' . $user->id . ':' . $remoteAddress,
            10,
            3600,
        )) {
            throw new ApiException(429, 'rate_limited', 'Too many token creation requests. Try again later.');
        }

        $token = bin2hex(random_bytes(32));
        $id = $this->tokens->create(
            $user->workspaceId,
            $user->id,
            hash('sha256', $token),
            'api',
            $label,
            null,
            null,
        );

        return ['id' => $id, 'label' => $label, 'token' => $token];
    }

    public function listApiTokens(AuthenticatedUser $user): array
    {
        if (!Permissions::can($user, 'tokens.list')) {
            throw new ApiException(403, 'forbidden', 'You cannot list API tokens.');
        }
        return $this->tokens->listForUser($user->workspaceId, $user->id);
    }

    public function revokeApiToken(AuthenticatedUser $user, int $tokenId): void
    {
        $ownerId = $this->tokens->findOwner($user->workspaceId, $tokenId);
        if ($ownerId === null) {
            throw new ApiException(404, 'not_found', 'The token was not found.');
        }
        if (!Permissions::can($user, 'tokens.revoke', ['user_id' => $ownerId])) {
            throw new ApiException(403, 'forbidden', 'You cannot revoke this token.');
        }
        $this->tokens->revoke($user->workspaceId, $tokenId, $ownerId);
    }

    public function logout(AuthenticatedUser $user): void
    {
        $this->tokens->revoke($user->workspaceId, $user->tokenId, $user->id);
    }

    public function listUsers(AuthenticatedUser $actor): array
    {
        if (!Permissions::can($actor, 'users.list')) {
            throw new ApiException(403, 'forbidden', 'You cannot list workspace users.');
        }
        return $this->users->list($actor->workspaceId);
    }

    public function setWorkspaceMemberActive(AuthenticatedUser $actor, int $memberId, array $body): array
    {
        if (!Permissions::can($actor, 'users.manage_members')) {
            throw new ApiException(403, 'forbidden', 'You cannot manage workspace members.');
        }
        if (!is_bool($body['is_active'] ?? null)) {
            throw new ApiException(422, 'validation_failed', 'is_active must be a boolean.');
        }

        $isActive = $body['is_active'];
        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) $this->pdo->beginTransaction();
        try {
            $this->workspaces->lockForMemberUpdate($actor->workspaceId);
            $this->assertCurrentWorkspaceAdmin($actor);
            $member = $this->users->findById($actor->workspaceId, $memberId);
            if ($member === null) {
                throw new ApiException(404, 'not_found', 'The workspace member was not found.');
            }

            $currentlyActive = (bool) $member['is_active'];
            if ($currentlyActive && !$isActive) {
                if ($member['role'] === 'admin' && $this->users->countActiveAdmins($actor->workspaceId) <= 1) {
                    throw new ApiException(409, 'last_active_admin', 'At least one active workspace admin must remain.');
                }
                if ((int) $member['id'] === $actor->id) {
                    throw new ApiException(409, 'self_deactivation', 'Ask another workspace admin to deactivate your membership.');
                }

                $this->users->setActive($actor->workspaceId, $memberId, false);
                $this->tokens->revokeSessionsForMember($actor->workspaceId, $memberId);
            } elseif (!$currentlyActive && $isActive) {
                $this->users->setActive($actor->workspaceId, $memberId, true);
            }

            $updatedMember = $this->users->findById($actor->workspaceId, $memberId);
            if ($updatedMember === null) {
                throw new ApiException(404, 'not_found', 'The workspace member was not found.');
            }
            if ($ownsTransaction) $this->pdo->commit();
            return [
                'id' => (int) $updatedMember['id'],
                'workspace_id' => (int) $updatedMember['workspace_id'],
                'name' => (string) $updatedMember['name'],
                'email' => (string) $updatedMember['email'],
                'role' => (string) $updatedMember['role'],
                'is_active' => (bool) $updatedMember['is_active'],
                'created_at' => (string) $updatedMember['created_at'],
            ];
        } catch (Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        }
    }

    public function setWorkspaceMemberRole(AuthenticatedUser $actor, int $memberId, array $body): array
    {
        if (!Permissions::can($actor, 'users.manage_members')) {
            throw new ApiException(403, 'forbidden', 'You cannot manage workspace members.');
        }
        $role = $body['role'] ?? null;
        if (!is_string($role) || !in_array($role, ['admin', 'developer', 'guest'], true)) {
            throw new ApiException(422, 'validation_failed', 'Role must be admin, developer, or guest.');
        }

        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) $this->pdo->beginTransaction();
        try {
            $this->workspaces->lockForMemberUpdate($actor->workspaceId);
            $this->assertCurrentWorkspaceAdmin($actor);
            $member = $this->users->findById($actor->workspaceId, $memberId);
            if ($member === null) {
                throw new ApiException(404, 'not_found', 'The workspace member was not found.');
            }

            if ($member['role'] !== $role) {
                if ((int) $member['id'] === $actor->id) {
                    throw new ApiException(409, 'self_role_change', 'Ask another workspace admin to change your role.');
                }
                if ((bool) $member['is_active'] && $member['role'] === 'admin' && $role !== 'admin'
                    && $this->users->countActiveAdmins($actor->workspaceId) <= 1) {
                    throw new ApiException(409, 'last_active_admin', 'At least one active workspace admin must remain.');
                }
                $this->users->setRole($actor->workspaceId, $memberId, $role);
            }

            $updatedMember = $this->users->findById($actor->workspaceId, $memberId);
            if ($updatedMember === null) {
                throw new ApiException(404, 'not_found', 'The workspace member was not found.');
            }
            if ($ownsTransaction) $this->pdo->commit();
            return [
                'id' => (int) $updatedMember['id'],
                'workspace_id' => (int) $updatedMember['workspace_id'],
                'name' => (string) $updatedMember['name'],
                'email' => (string) $updatedMember['email'],
                'role' => (string) $updatedMember['role'],
                'is_active' => (bool) $updatedMember['is_active'],
                'created_at' => (string) $updatedMember['created_at'],
            ];
        } catch (Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        }
    }

    private function assertCurrentWorkspaceAdmin(AuthenticatedUser $actor): void
    {
        $currentActor = $this->users->findById($actor->workspaceId, $actor->id);
        if ($currentActor === null || !(bool) $currentActor['is_active'] || $currentActor['role'] !== 'admin') {
            throw new ApiException(403, 'forbidden', 'You cannot manage workspace members.');
        }
    }

    public function createDeveloper(AuthenticatedUser $actor, array $body): array
    {
        if (!Permissions::can($actor, 'users.create')) {
            throw new ApiException(403, 'forbidden', 'You cannot create workspace users.');
        }

        $name = is_string($body['name'] ?? null) ? trim($body['name']) : '';
        $email = is_string($body['email'] ?? null) ? trim($body['email']) : '';
        $password = is_string($body['password'] ?? null) ? $body['password'] : '';
        $role = is_string($body['role'] ?? null) ? $body['role'] : 'developer';
        if (mb_strlen($name, 'UTF-8') < 2 || mb_strlen($name, 'UTF-8') > 120) {
            throw new ApiException(422, 'validation_failed', 'Name must be between 2 and 120 characters.');
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email, 'UTF-8') > 254) {
            throw new ApiException(422, 'validation_failed', 'A valid email address is required.');
        }
        $reason = $this->passwords->validate($password, [
            'name' => $name,
            'email' => $email,
            'workspace' => $this->workspaces->nameById($actor->workspaceId),
        ]);
        if ($reason !== null) throw new ApiException(422, 'password_rejected', $reason);
        if (!in_array($role, ['developer', 'guest'], true)) {
            throw new ApiException(422, 'validation_failed', 'Role must be developer or guest.');
        }

        return $this->users->createWorkspaceUser($actor->workspaceId, $name, $email, $password, $role);
    }

    private function publicUser(array $user): array
    {
        return [
            'id' => (int) $user['id'],
            'workspace_id' => (int) $user['workspace_id'],
            'name' => (string) $user['name'],
            'email' => (string) $user['email'],
            'role' => (string) $user['role'],
        ];
    }

    private function assertLoginOrigin(Request $request): void
    {
        $origin = $request->header('Origin');
        if ($origin === null) {
            return;
        }

        $actual = $this->parseOrigin($origin, false);
        $expected = $this->parseOrigin($this->config->publicAppUrl, true);
        if ($actual === null || $expected === null || $actual !== $expected) {
            throw new ApiException(403, 'origin_invalid', 'The request origin is not allowed.');
        }
    }

    /** @return array{scheme: string, host: string, port: int}|null */
    private function parseOrigin(string $url, bool $allowPath): ?array
    {
        try {
            $parts = parse_url(trim($url));
        } catch (\ValueError) {
            return null;
        }
        if (!is_array($parts)
            || !isset($parts['scheme'], $parts['host'])
            || !in_array(strtolower($parts['scheme']), ['http', 'https'], true)
            || isset($parts['user'])
            || isset($parts['pass'])
            || isset($parts['query'])
            || isset($parts['fragment'])
            || (!$allowPath && isset($parts['path']) && $parts['path'] !== '' && $parts['path'] !== '/')
        ) {
            return null;
        }

        $scheme = strtolower($parts['scheme']);
        return [
            'scheme' => $scheme,
            'host' => strtolower($parts['host']),
            'port' => (int) ($parts['port'] ?? ($scheme === 'https' ? 443 : 80)),
        ];
    }
}
