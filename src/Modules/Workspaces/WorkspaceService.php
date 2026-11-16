<?php

declare(strict_types=1);

namespace Tangent\Modules\Workspaces;

use PDO;
use Throwable;
use Tangent\Core\ApiException;
use Tangent\Core\AppConfig;
use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Permissions;
use Tangent\Modules\Auth\TokenRepository;
use Tangent\Modules\Auth\UserRepository;

final class WorkspaceService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly WorkspaceRepository $workspaces,
        private readonly UserRepository $users,
        private readonly TokenRepository $tokens,
        private readonly AppConfig $config,
    ) {
    }

    /** @return list<array{id: int, name: string, slug: string, role: string}> */
    public function list(AuthenticatedUser $user): array
    {
        if (!Permissions::can($user, 'workspaces.list')) {
            throw new ApiException(403, 'forbidden', 'You cannot list workspaces.');
        }
        return $this->workspaces->listForAccount($user->accountId);
    }

    /** @param array<string, mixed> $body @return array{id: int, name: string, slug: string, role: string} */
    public function create(AuthenticatedUser $user, array $body): array
    {
        if (!Permissions::can($user, 'workspaces.create')) {
            throw new ApiException(403, 'forbidden', 'You cannot create workspaces.');
        }
        $name = is_string($body['name'] ?? null) ? trim($body['name']) : '';
        if (mb_strlen($name, 'UTF-8') < 2 || mb_strlen($name, 'UTF-8') > 120) {
            throw new ApiException(422, 'validation_failed', 'Workspace name must be between 2 and 120 characters.');
        }

        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) {
            $this->pdo->beginTransaction();
        }
        try {
            $workspace = $this->workspaces->create($name, self::slug($name) . '-' . bin2hex(random_bytes(3)));
            $this->users->copyAdminMembership(
                $user->workspaceId,
                $user->id,
                $workspace['id'],
                $user->accountId,
            );
            if ($ownsTransaction) {
                $this->pdo->commit();
            }
            return [...$workspace, 'role' => 'admin'];
        } catch (Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $exception;
        }
    }

    /** @return array{user: array<string, mixed>, workspace: array{id: int, name: string, slug: string, role: string}, session_token: string, csrf_token: string, expires_at: string} */
    public function switch(AuthenticatedUser $user, int $workspaceId): array
    {
        if (!Permissions::can($user, 'workspaces.switch')) {
            throw new ApiException(403, 'forbidden', 'You cannot switch workspaces.');
        }
        if ($user->authenticationMethod !== 'cookie') {
            throw new ApiException(403, 'forbidden', 'Workspace switching requires a browser session.');
        }

        $membership = $this->users->findAccountMember($workspaceId, $user->accountId);
        $workspace = $this->workspaces->findForAccount($workspaceId, $user->accountId);
        if ($membership === null || !(bool) $membership['is_active'] || $workspace === null) {
            throw new ApiException(404, 'not_found', 'The workspace was not found.');
        }

        $sessionToken = bin2hex(random_bytes(32));
        $csrfToken = bin2hex(random_bytes(32));
        $expiresAt = gmdate('Y-m-d H:i:s', time() + $this->config->sessionLifetimeSeconds);
        $this->tokens->create(
            $workspaceId,
            (int) $membership['id'],
            hash('sha256', $sessionToken),
            'session',
            'Browser session',
            hash('sha256', $csrfToken),
            $expiresAt,
        );
        $this->tokens->revoke($user->workspaceId, $user->tokenId, $user->id);

        return [
            'user' => [
                'id' => (int) $membership['id'],
                'workspace_id' => $workspaceId,
                'name' => (string) $membership['name'],
                'email' => (string) $membership['email'],
                'role' => (string) $membership['role'],
            ],
            'workspace' => $workspace,
            'session_token' => $sessionToken,
            'csrf_token' => $csrfToken,
            'expires_at' => $expiresAt,
        ];
    }

    private static function slug(string $name): string
    {
        $ascii = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $name);
        $source = is_string($ascii) ? $ascii : $name;
        $slug = strtolower(trim((string) preg_replace('/[^a-zA-Z0-9]+/', '-', $source), '-'));
        return mb_substr($slug === '' ? 'workspace' : $slug, 0, 90, 'UTF-8');
    }
}
