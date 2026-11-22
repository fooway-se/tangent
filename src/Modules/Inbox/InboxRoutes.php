<?php

declare(strict_types=1);

namespace Tangent\Modules\Inbox;

use Tangent\Core\AuthenticatedUser;
use Tangent\Core\PositiveId;
use Tangent\Core\Request;
use Tangent\Core\Response;
use Tangent\Core\Router;
use Tangent\Modules\Issues\IssueListResponse;

final class InboxRoutes
{
    public function __construct(private readonly InboxService $service, private readonly InboxEvents $events)
    {
    }

    public function register(Router $router): void
    {
        $router->add('GET', '/api/v1/inbox', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            $etag = IssueListResponse::etagForRevision('task-inbox:' . $this->service->listRevision($user));
            return IssueListResponse::conditional($request, $etag, fn (): array => $this->service->list($user));
        });

        $router->add('GET', '/api/v1/inbox/events', function (Request $request, array $params, AuthenticatedUser $user): Response {
            if (array_key_exists('tab', $request->query) || array_key_exists('before_id', $request->query)) {
                $page = $this->events->page($user, $request->query['tab'] ?? null, $request->query['before_id'] ?? null);
                return self::conditionalResponse($request, $page);
            }
            return self::conditionalListResponse($request, 'events', $this->events->list($user));
        });

        $router->add('PATCH', '/api/v1/inbox/events/{id}', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, ['event' => $this->events->update($user, PositiveId::parse($params['id']), $request->body)]);
        });

        $router->add('POST', '/api/v1/inbox/events/read-all', function (Request $request, array $params, AuthenticatedUser $user): Response {
            $this->events->markAllRead($user);
            return Response::json(204);
        });
    }

    private static function conditionalListResponse(Request $request, string $key, array $items): Response
    {
        return self::conditionalResponse($request, [$key => $items]);
    }

    private static function conditionalResponse(Request $request, array $body): Response
    {
        $etag = '"' . hash('sha256', json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)) . '"';
        $headers = ['ETag' => $etag, 'Cache-Control' => 'no-cache'];
        $ifNoneMatch = $request->header('If-None-Match');
        if ($ifNoneMatch !== null && self::matchesEtag($ifNoneMatch, $etag)) {
            return Response::notModified($headers);
        }

        return Response::json(200, $body, $headers);
    }

    private static function matchesEtag(string $header, string $etag): bool
    {
        foreach (explode(',', $header) as $candidate) {
            $candidate = trim($candidate);
            if ($candidate === '*' || preg_replace('/^W\//', '', $candidate) === $etag) return true;
        }
        return false;
    }

}
