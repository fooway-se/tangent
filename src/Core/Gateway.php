<?php

declare(strict_types=1);

namespace Tangent\Core;

use Throwable;
use UnexpectedValueException;
use Tangent\Modules\Auth\Authenticator;

final class Gateway
{
    public function __construct(
        private readonly Router $router,
        private readonly Authenticator $authenticator,
        private readonly RequestErrorReporter $errorReporter = new RequestErrorReporter(),
        private readonly ?WorkspaceRealtimeFeed $realtimeFeed = null,
    ) {
    }

    public function handle(Request $request): Response
    {
        try {
            return $this->dispatch($request);
        } catch (ApiException $exception) {
            return $this->error($exception->status, $exception->apiCode, $exception->getMessage());
        } catch (Throwable $exception) {
            $this->errorReporter->report($request->requestId, $exception);
            return Response::json(500, [
                'error' => ['code' => 'internal_error', 'message' => 'The request could not be completed.'],
            ], ['X-Request-ID' => $request->requestId]);
        }
    }

    private function dispatch(Request $request): Response
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
            $user = $this->authenticator->authenticate($request);

            if ($user->authenticationMethod === 'cookie' && !$request->isSafeMethod()
                && !$this->validCsrf($request, $user->csrfHash)) {
                return $this->error(403, 'csrf_failed', 'A valid CSRF token is required.');
            }
        }

        $response = ($matched['handler'])($request, $matched['params'], $user);
        if (!$response instanceof Response) {
            throw new UnexpectedValueException('Route handlers must return a response.');
        }

        if ($user !== null && self::shouldSignalRealtime($request) && $response->status >= 200 && $response->status < 300) {
            $this->realtimeFeed?->notifyWorkspace($user->workspaceId);
        }

        return $response;
    }

    private function validCsrf(Request $request, ?string $expectedHash): bool
    {
        $token = $request->header('X-CSRF-Token');
        return $token !== null && $expectedHash !== null
            && hash_equals($expectedHash, hash('sha256', $token));
    }

    private static function shouldSignalRealtime(Request $request): bool
    {
        if ($request->isSafeMethod()) return false;
        if (preg_match('#/presence/?$#', $request->path) === 1) return false;
        if (str_starts_with($request->path, '/api/v1/inbox/events')) return false;
        return true;
    }

    private function error(int $status, string $code, string $message): Response
    {
        return Response::json($status, ['error' => ['code' => $code, 'message' => $message]]);
    }
}
