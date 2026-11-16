<?php

declare(strict_types=1);

namespace Tangent\Modules\Auth;

use Tangent\Core\ApiException;
use Tangent\Core\AppConfig;
use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Request;

final class Authenticator
{
    public function __construct(
        private readonly TokenRepository $tokens,
        private readonly AppConfig $config,
    ) {
    }

    public function authenticate(Request $request): AuthenticatedUser
    {
        $authorization = $request->header('Authorization');
        if ($authorization !== null) {
            if (!preg_match('/^Bearer\s+([a-fA-F0-9]{64})$/', trim($authorization), $matches)) {
                throw new ApiException(401, 'unauthenticated', 'A valid authentication token is required.');
            }
            $workspaceId = $this->config->workspaceId;
            $selectedWorkspace = $request->header('X-Tangent-Workspace');
            if ($selectedWorkspace !== null) {
                if (!ctype_digit($selectedWorkspace) || (int) $selectedWorkspace < 1) {
                    throw new ApiException(401, 'unauthenticated', 'A valid authentication token is required.');
                }
                $workspaceId = (int) $selectedWorkspace;
            }
            $user = $this->tokens->authenticate($workspaceId, $matches[1], 'api', 'bearer');
        } else {
            $session = $request->cookies['tangent_session'] ?? null;
            if (!is_string($session) || !preg_match('/^[a-fA-F0-9]{64}$/', $session)) {
                throw new ApiException(401, 'unauthenticated', 'A valid authentication token is required.');
            }
            $workspaceId = $this->config->workspaceId;
            $selectedWorkspace = $request->cookies['tangent_workspace'] ?? null;
            if ($selectedWorkspace !== null) {
                if (!is_string($selectedWorkspace) || !ctype_digit($selectedWorkspace) || (int) $selectedWorkspace < 1) {
                    throw new ApiException(401, 'unauthenticated', 'A valid authentication token is required.');
                }
                $workspaceId = (int) $selectedWorkspace;
            }
            $user = $this->tokens->authenticate($workspaceId, $session, 'session', 'cookie');
        }

        if ($user === null) {
            throw new ApiException(401, 'unauthenticated', 'A valid authentication token is required.');
        }

        return $user;
    }
}
