<?php

declare(strict_types=1);

namespace Tangent\Modules\Chat;

use Tangent\Core\ApiException;
use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Request;
use Tangent\Core\Response;
use Tangent\Core\Router;
use Tangent\Core\WorkspaceRealtimeFeed;

final class RealtimeRoutes
{
    public function __construct(
        private readonly WorkspaceRealtimeFeed $feed,
        private readonly bool $enabled,
        private readonly int $maxConnections,
    ) {}

    public function register(Router $router): void
    {
        $router->add('GET', '/api/v1/events/stream', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            if ($user->isAgent() || $user->role === 'guest') {
                throw new ApiException(403, 'forbidden', 'Workspace event streaming is only available to internal users.');
            }

            if (!$this->enabled) return new Response(204);

            $leaseId = $this->feed->acquireStreamLease(
                $user->workspaceId,
                $user->id,
                $this->maxConnections,
            );
            if ($leaseId === null) return new Response(204);

            return Response::stream(
                function () use ($user, $request, $leaseId): void {
                    try {
                        $this->feed->stream($user->workspaceId, self::lastEventId($request));
                    } finally {
                        $this->feed->releaseStreamLease($leaseId);
                    }
                },
                [
                    'Cache-Control' => 'no-cache, no-transform',
                    'X-Accel-Buffering' => 'no',
                ],
            );
        });
    }

    private static function lastEventId(Request $request): ?int
    {
        $value = $request->header('Last-Event-ID');
        if ($value === null || !ctype_digit($value)) return null;
        $cursor = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
        return $cursor === false ? null : $cursor;
    }
}
