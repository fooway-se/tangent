<?php

declare(strict_types=1);

namespace Tangent\Core;

use Throwable;
use Tangent\Modules\Auth\Authenticator;

final class Gateway
{
    public function __construct(
        private readonly Router $router,
        private readonly Authenticator $authenticator,
    ) {
    }

    public function handle(Request $request): Response
    {
        if ($request->bodyTooLarge) {
            return $this->error(413, 'payload_too_large', 'Request body exceeds the maximum allowed size.');
        }

        if (!$request->validJson) {
            return $this->error(400, 'invalid_json', 'Request body must be a JSON object.');
        }

        $matched = $this->router->match($request);
        if ($matched === null) {
            return $this->error(404, 'not_found', 'The requested endpoint was not found.');
        }

        $user = null;
        if ($matched['authenticated']) {
            try {
                $user = $this->authenticator->authenticate($request);
            } catch (ApiException $exception) {
                return $this->error($exception->status, $exception->apiCode, $exception->getMessage());
            }

            if ($user->authenticationMethod === 'cookie' && !$request->isSafeMethod()
                && !$this->validCsrf($request, $user->csrfHash)) {
                return $this->error(403, 'csrf_failed', 'A valid CSRF token is required.');
            }
        }

        try {
            $response = ($matched['handler'])($request, $matched['params'], $user);
            return $response instanceof Response
                ? $response
                : $this->error(500, 'internal_error', 'The request could not be completed.');
        } catch (ApiException $exception) {
            return $this->error($exception->status, $exception->apiCode, $exception->getMessage());
        } catch (Throwable) {
            return $this->error(500, 'internal_error', 'The request could not be completed.');
        }
    }

    private function validCsrf(Request $request, ?string $expectedHash): bool
    {
        $token = $request->header('X-CSRF-Token');
        return $token !== null && $expectedHash !== null
            && hash_equals($expectedHash, hash('sha256', $token));
    }

    private function error(int $status, string $code, string $message): Response
    {
        return Response::json($status, ['error' => ['code' => $code, 'message' => $message]]);
    }
}
