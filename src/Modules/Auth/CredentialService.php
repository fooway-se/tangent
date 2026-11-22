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
use Tangent\Core\Mailer;
use Tangent\Modules\Projects\ProjectRepository;
use Tangent\Modules\Workspaces\WorkspaceRepository;

final class CredentialService
{
    private const INVITE_LIFETIME_SECONDS = 604800;
    private const RESET_LIFETIME_SECONDS = 3600;
    private const PUBLIC_TOKEN_LIMIT = 5;
    private const PUBLIC_TOKEN_WINDOW_SECONDS = 900;

    public function __construct(
        private readonly PDO $pdo,
        private readonly UserRepository $users,
        private readonly CredentialTokenRepository $credentialTokens,
        private readonly TokenRepository $tokens,
        private readonly RateLimiter $rateLimiter,
        private readonly ProjectRepository $projects,
        private readonly WorkspaceRepository $workspaces,
        private readonly AuthService $auth,
        private readonly PasswordSecurity $passwords,
        private readonly AppConfig $config,
        private readonly Mailer $mailer,
    ) {
    }

    public function createInvite(AuthenticatedUser $actor, array $body, string $remoteAddress): array
    {
        $this->requireAdmin($actor);
        $this->limitAdminInvites($actor, $remoteAddress);
        $name = is_string($body['name'] ?? null) ? trim($body['name']) : '';
        $email = is_string($body['email'] ?? null) ? UserRepository::normalizeEmail($body['email']) : '';
        $role = is_string($body['role'] ?? null) ? $body['role'] : 'developer';
        $projectIds = $this->validateProjectIds($actor->workspaceId, $body['project_ids'] ?? [], $role);

        if (mb_strlen($name, 'UTF-8') < 2 || mb_strlen($name, 'UTF-8') > 120) {
            throw new ApiException(422, 'validation_failed', 'Name must be between 2 and 120 characters.');
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email, 'UTF-8') > 254) {
            throw new ApiException(422, 'validation_failed', 'A valid email address is required.');
        }
        if (!in_array($role, ['developer', 'guest'], true)) {
            throw new ApiException(422, 'validation_failed', 'Role must be developer or guest.');
        }
        if ($this->users->findByEmail($actor->workspaceId, $email) !== null) {
            throw new ApiException(409, 'membership_exists', 'This email is already a member of the workspace.');
        }

        $plainToken = bin2hex(random_bytes(32));
        $verificationCode = $this->users->findAccountByEmail($email) === null
            ? bin2hex(random_bytes(32))
            : null;
        $expiresAt = gmdate('Y-m-d H:i:s', time() + self::INVITE_LIFETIME_SECONDS);
        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) $this->pdo->beginTransaction();
        try {
            $inviteId = $this->credentialTokens->createInvite(
                $actor->workspaceId,
                $actor->id,
                $name,
                $email,
                $role,
                $projectIds,
                hash('sha256', $plainToken),
                $verificationCode === null ? null : hash('sha256', $verificationCode),
                $expiresAt,
            );
            if ($ownsTransaction) $this->pdo->commit();
        } catch (Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        }

        if ($verificationCode !== null
            && !$this->sendInviteVerificationCode($email, $name, $actor->workspaceId, $verificationCode, $expiresAt)
        ) {
            $this->credentialTokens->revokeInvite($actor->workspaceId, $inviteId);
            throw $this->emailDeliveryFailure();
        }

        $invite = [
            'id' => $inviteId,
            'email' => $email,
            'name' => $name,
            'role' => $role,
            'project_ids' => $projectIds,
            'expires_at' => $expiresAt,
            'invite_url' => $this->credentialUrl('invite', $plainToken),
        ];
        return $invite;
    }

    public function listInvites(AuthenticatedUser $actor): array
    {
        $this->requireAdmin($actor);
        return array_map(function (array $invite) use ($actor): array {
            $invite['project_ids'] = $this->credentialTokens->projectIds($actor->workspaceId, (int) $invite['id']);
            return $invite;
        }, $this->credentialTokens->listInvites($actor->workspaceId));
    }

    public function regenerateInviteLink(AuthenticatedUser $actor, int $inviteId, string $remoteAddress): array
    {
        $this->requireAdmin($actor);
        $this->limitAdminInvites($actor, $remoteAddress);
        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) $this->pdo->beginTransaction();
        try {
            $invite = $this->credentialTokens->findInvite($actor->workspaceId, $inviteId, true);
            if ($invite === null) throw new ApiException(404, 'not_found', 'The invite was not found.');
            if ($this->users->findByEmail($actor->workspaceId, (string) $invite['email']) !== null) {
                throw new ApiException(409, 'membership_exists', 'This account is already a member of the workspace.');
            }
            $plainToken = bin2hex(random_bytes(32));
            $verificationCode = $this->users->findAccountByEmail((string) $invite['email']) === null
                ? bin2hex(random_bytes(32))
                : null;
            $expiresAt = gmdate('Y-m-d H:i:s', time() + self::INVITE_LIFETIME_SECONDS);
            $projectIds = $this->credentialTokens->projectIds($actor->workspaceId, $inviteId);
            if (!$this->credentialTokens->replaceInviteToken(
                $actor->workspaceId,
                $inviteId,
                hash('sha256', $plainToken),
                $verificationCode === null ? null : hash('sha256', $verificationCode),
                $expiresAt,
                $projectIds,
            )) {
                throw new ApiException(404, 'not_found', 'The invite was not found.');
            }
            if ($ownsTransaction) $this->pdo->commit();
        } catch (Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        }

        if ($verificationCode !== null
            && !$this->sendInviteVerificationCode(
                (string) $invite['email'],
                (string) $invite['name'],
                $actor->workspaceId,
                $verificationCode,
                $expiresAt,
            )
        ) {
            $this->credentialTokens->revokeInvite($actor->workspaceId, $inviteId);
            throw $this->emailDeliveryFailure();
        }

        $invite['id'] = (int) $invite['id'];
        $invite['project_ids'] = $projectIds;
        $invite['expires_at'] = $expiresAt;
        $invite['invite_url'] = $this->credentialUrl('invite', $plainToken);
        return $invite;
    }

    public function revokeInvite(AuthenticatedUser $actor, int $inviteId): void
    {
        $this->requireAdmin($actor);
        if (!$this->credentialTokens->revokeInvite($actor->workspaceId, $inviteId)) {
            throw new ApiException(404, 'not_found', 'The invite was not found.');
        }
    }

    public function inspectInvite(Request $request): array
    {
        $this->limitPublicTokenRequest('invite-accept:' . $request->remoteAddress);
        $token = $this->rawToken($request->body['token'] ?? null);
        $invite = $this->credentialTokens->findValid(hash('sha256', $token), 'invite');
        if ($invite === null) throw $this->invalidToken();
        $workspaceId = (int) $invite['workspace_id'];
        $account = $this->users->findAccountByEmail((string) $invite['email']);
        return [
            'invite' => [
                'name' => (string) $invite['name'],
                'email' => (string) $invite['email'],
                'workspace_name' => $this->workspaces->nameById($workspaceId),
                'role' => (string) $invite['role'],
                'project_ids' => $this->credentialTokens->projectIds($workspaceId, (int) $invite['id']),
                'password_required' => true,
                'email_verification_required' => $account === null,
            ],
        ];
    }

    public function acceptInvite(Request $request): array
    {
        $this->limitPublicTokenRequest('invite-accept:' . $request->remoteAddress);
        $token = $this->rawToken($request->body['token'] ?? null);
        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) $this->pdo->beginTransaction();
        try {
            $invite = $this->credentialTokens->findValid(hash('sha256', $token), 'invite', true);
            if ($invite === null) throw $this->invalidToken();
            $workspaceId = (int) $invite['workspace_id'];
            $email = (string) $invite['email'];
            $name = (string) $invite['name'];
            $role = (string) $invite['role'];
            if ($this->users->findByEmail($workspaceId, $email) !== null) {
                throw new ApiException(409, 'membership_exists', 'This account is already a member of the workspace.');
            }

            $account = $this->users->findAccountByEmail($email);
            if ($account === null) {
                $verificationCode = $this->rawToken($request->body['verification_code'] ?? null);
                $verificationHash = $invite['email_verification_hash'] ?? null;
                if (!is_string($verificationHash) || !hash_equals($verificationHash, hash('sha256', $verificationCode))) {
                    throw $this->invalidToken();
                }
                $password = is_string($request->body['password'] ?? null) ? $request->body['password'] : '';
                $reason = $this->passwords->validate($password, [
                    'name' => $name,
                    'email' => $email,
                    'workspace' => $this->workspaces->nameById($workspaceId),
                ]);
                if ($reason !== null) throw new ApiException(422, 'password_rejected', $reason);
            } else {
                $password = is_string($request->body['password'] ?? null) ? $request->body['password'] : '';
                if (!password_verify($password, (string) $account['password_hash'])) {
                    throw new ApiException(401, 'invalid_credentials', 'The invite token or password is not valid.');
                }
            }

            $projectIds = $this->credentialTokens->projectIds($workspaceId, (int) $invite['id']);
            if ($role === 'guest') {
                $projectIds = $this->projects->eligibleProjectIdsForUpdate($workspaceId, $projectIds);
                if ($projectIds === []) {
                    throw new ApiException(409, 'invite_projects_unavailable', 'The guest projects in this invite are no longer available. Ask the workspace admin to send a new invite.');
                }
            }

            $member = $account === null
                ? $this->users->createWorkspaceUser($workspaceId, $name, $email, $password, $role)
                : $this->users->createMembershipForAccount(
                    $workspaceId,
                    (int) $account['account_id'],
                    $name,
                    $email,
                    $role,
                );
            foreach ($projectIds as $projectId) {
                $this->projects->addMember($workspaceId, $projectId, (int) $member['id']);
            }
            if (!$this->credentialTokens->markUsed($workspaceId, (int) $invite['id'])) {
                throw $this->invalidToken();
            }
            $session = $this->auth->createSessionForMember($workspaceId, (int) $member['id']);
            if ($ownsTransaction) $this->pdo->commit();
            return $session;
        } catch (Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        }
    }

    public function generatePasswordResetLink(AuthenticatedUser $actor, int $memberId, string $remoteAddress): array
    {
        $this->requireAdmin($actor);
        $this->limitAdminCredentialLinks($actor, $remoteAddress);
        $member = $this->users->findById($actor->workspaceId, $memberId);
        if ($member === null || !(bool) $member['is_active']) {
            throw new ApiException(404, 'not_found', 'The workspace member was not found.');
        }

        $plainToken = bin2hex(random_bytes(32));
        $expiresAt = gmdate('Y-m-d H:i:s', time() + self::RESET_LIFETIME_SECONDS);
        $resetUrl = $this->credentialUrl('reset', $plainToken);
        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) $this->pdo->beginTransaction();
        try {
            $tokenId = $this->credentialTokens->createPasswordReset(
                $actor->workspaceId,
                (int) $member['account_id'],
                (string) $member['email'],
                (string) $member['name'],
                hash('sha256', $plainToken),
                $expiresAt,
            );
            if ($ownsTransaction) $this->pdo->commit();
        } catch (Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        }

        if (!$this->sendPasswordResetEmail(
            (string) $member['email'],
            (string) $member['name'],
            $resetUrl,
            $expiresAt,
        )) {
            $this->credentialTokens->revokePasswordReset((int) $member['account_id'], $tokenId);
            throw $this->emailDeliveryFailure();
        }

        return ['expires_at' => $expiresAt];
    }

    public function completePasswordReset(Request $request): void
    {
        $this->limitPublicTokenRequest('password-reset-complete:' . $request->remoteAddress);
        $token = $this->rawToken($request->body['token'] ?? null);
        $password = is_string($request->body['password'] ?? null) ? $request->body['password'] : '';
        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) $this->pdo->beginTransaction();
        try {
            $credential = $this->credentialTokens->findValid(hash('sha256', $token), 'password_reset', true);
            if ($credential === null || $credential['account_id'] === null) throw $this->invalidToken();
            $reason = $this->passwords->validate($password, [
                'name' => (string) ($credential['name'] ?? ''),
                'email' => (string) $credential['email'],
                'workspace' => $this->workspaces->nameById((int) $credential['workspace_id']),
            ]);
            if ($reason !== null) throw new ApiException(422, 'password_rejected', $reason);

            $accountId = (int) $credential['account_id'];
            $this->users->updateAccountPassword($accountId, $password);
            $this->tokens->revokeAllForAccount($accountId);
            if (!$this->credentialTokens->markUsed((int) $credential['workspace_id'], (int) $credential['id'])) {
                throw $this->invalidToken();
            }
            $this->credentialTokens->revokeOtherPasswordResets($accountId, (int) $credential['id']);
            if ($ownsTransaction) $this->pdo->commit();
        } catch (Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        }
    }

    private function validateProjectIds(int $workspaceId, mixed $value, string $role): array
    {
        if (!is_array($value) || !array_is_list($value)) {
            throw new ApiException(422, 'validation_failed', 'Project selections must be a list.');
        }
        $projectIds = [];
        foreach ($value as $projectId) {
            if (!is_int($projectId) || $projectId < 1) {
                throw new ApiException(422, 'validation_failed', 'Each selected project must be valid.');
            }
            $project = $this->projects->find($workspaceId, $projectId);
            if ($project === null || !in_array($project['status'], ['active', 'paused'], true)) {
                throw new ApiException(422, 'validation_failed', 'Choose active or paused projects in this workspace.');
            }
            $projectIds[] = $projectId;
        }
        $projectIds = array_values(array_unique($projectIds));
        if ($role === 'guest' && $projectIds === []) {
            throw new ApiException(422, 'validation_failed', 'Choose at least one project for a guest invite.');
        }
        if ($role === 'developer' && $projectIds !== []) {
            throw new ApiException(422, 'validation_failed', 'Project selections are only available for guest invites.');
        }
        if (!in_array($role, ['developer', 'guest'], true)) {
            throw new ApiException(422, 'validation_failed', 'Role must be developer or guest.');
        }
        return $projectIds;
    }

    private function sendInviteVerificationCode(
        string $email,
        string $name,
        int $workspaceId,
        string $verificationCode,
        string $expiresAt,
    ): bool {
        $workspaceName = $this->workspaces->nameById($workspaceId);
        $body = "Hello {$name},\n\n"
            . "Use this one-time code to verify your email address and accept the Tangent invitation to {$workspaceName}:\n\n"
            . "Verification code: {$verificationCode}\n\n"
            . "The code expires with the invitation at {$expiresAt} UTC. If you did not expect this invitation, you can ignore this message.\n";
        try {
            return $this->mailer->send($email, 'Tangent invitation email verification', $body);
        } catch (Throwable) {
            return false;
        }
    }

    private function sendPasswordResetEmail(string $email, string $name, string $resetUrl, string $expiresAt): bool
    {
        $body = "Hello {$name},\n\n"
            . "Use this one-time link to reset your Tangent password:\n\n"
            . "{$resetUrl}\n\n"
            . "The link expires at {$expiresAt} UTC. It will change the password for your Tangent account and sign out all active sessions. If you did not request recovery, you can ignore this message.\n";
        try {
            return $this->mailer->send($email, 'Tangent password recovery', $body);
        } catch (Throwable) {
            return false;
        }
    }

    private function emailDeliveryFailure(): ApiException
    {
        return new ApiException(
            503,
            'email_delivery_failed',
            'Email delivery failed. Configure server email delivery and try again.',
        );
    }

    private function requireAdmin(AuthenticatedUser $actor): void
    {
        if (!Permissions::can($actor, 'users.create')) {
            throw new ApiException(403, 'forbidden', 'You cannot manage workspace invites.');
        }
    }

    private function limitAdminInvites(AuthenticatedUser $actor, string $remoteAddress): void
    {
        if (!$this->rateLimiter->allow($actor->workspaceId, 'credential-admin:' . $actor->id . ':' . $remoteAddress, 20, 3600)) {
            throw new ApiException(429, 'rate_limited', 'Too many invite requests. Try again later.');
        }
    }

    private function limitAdminCredentialLinks(AuthenticatedUser $actor, string $remoteAddress): void
    {
        if (!$this->rateLimiter->allow($actor->workspaceId, 'credential-admin:' . $actor->id . ':' . $remoteAddress, 20, 3600)) {
            throw new ApiException(429, 'rate_limited', 'Too many credential links. Try again later.');
        }
    }

    private function limitPublicTokenRequest(string $bucket): void
    {
        if (!$this->rateLimiter->allow($this->config->workspaceId, $bucket, self::PUBLIC_TOKEN_LIMIT, self::PUBLIC_TOKEN_WINDOW_SECONDS)) {
            throw new ApiException(429, 'rate_limited', 'Too many requests. Try again later.');
        }
    }

    private function rawToken(mixed $value): string
    {
        if (!is_string($value) || preg_match('/^[a-f0-9]{64}$/', $value) !== 1) {
            throw $this->invalidToken();
        }
        return $value;
    }

    private function invalidToken(): ApiException
    {
        return new ApiException(400, 'invalid_token', 'This link is invalid, expired, or already used.');
    }

    private function credentialUrl(string $type, string $token): string
    {
        if (!in_array($type, ['invite', 'reset'], true)) {
            throw new \InvalidArgumentException('Unsupported credential link type.');
        }
        return rtrim($this->config->publicAppUrl, '/') . '/app.html#' . $type . '=' . $token;
    }
}
