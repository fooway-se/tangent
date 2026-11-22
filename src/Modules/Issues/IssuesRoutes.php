<?php

declare(strict_types=1);

namespace Tangent\Modules\Issues;

use Tangent\Core\ApiException;
use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Request;
use Tangent\Core\Response;
use Tangent\Core\Router;

final class IssuesRoutes
{
    public function __construct(private readonly IssuesService $service)
    {
    }

    public function register(Router $router): void
    {
        $router->add('POST', '/api/v1/approvals/{id}/approve', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            $this->service->approve($user, self::positiveId($params['id']));
            return Response::json(200, ['approved' => true]);
        });

        $router->add('POST', '/api/v1/messages/{id}/issue', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(201, [
                'issue' => $this->service->createFromMessage($user, self::positiveId($params['id'])),
            ]);
        });

        $router->add('GET', '/api/v1/projects/{id}/issues', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            $projectId = self::positiveId($params['id']);
            $revision = $this->service->listRevision($user, $projectId);
            return IssueListResponse::conditional(
                $request,
                IssueListResponse::etagForRevision($user->workspaceId . ':' . $projectId . ':active:' . $revision),
                fn (): array => $this->service->list($user, $projectId),
            );
        });

        $router->add('GET', '/api/v1/projects/{id}/issues/deleted', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return self::issueListResponse(
                $request,
                $this->service->listDeleted($user, self::positiveId($params['id'])),
            );
        });

        $router->add('POST', '/api/v1/projects/{id}/issues/move-to-milestone', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(200, [
                'moved_count' => $this->service->moveUnassignedToMilestone(
                    $user,
                    self::positiveId($params['id']),
                    $request->body,
                ),
            ]);
        });

        $router->add('POST', '/api/v1/projects/{id}/issues/assign', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(200, [
                'assigned_count' => $this->service->bulkAssign(
                    $user,
                    self::positiveId($params['id']),
                    $request->body,
                ),
            ]);
        });

        $router->add('POST', '/api/v1/projects/{id}/issues/share', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(200, [
                'updated_count' => $this->service->bulkSetShared(
                    $user,
                    self::positiveId($params['id']),
                    $request->body,
                ),
            ]);
        });

        $router->add('GET', '/api/v1/issues/{id}/history', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(200, [
                'transitions' => $this->service->statusHistory($user, self::positiveId($params['id'])),
            ]);
        });

        $router->add('GET', '/api/v1/issues/{id}/discussion', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(200, [
                'messages' => $this->service->discussion($user, self::positiveId($params['id'])),
            ]);
        });

        $router->add('POST', '/api/v1/issues/{id}/discussion', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(201, [
                'message' => $this->service->addDiscussionMessage(
                    $user,
                    self::positiveId($params['id']),
                    $request->body,
                ),
            ]);
        });

        $router->add('PATCH', '/api/v1/issues/{id}/discussion/{messageId}', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(200, [
                'message' => $this->service->editDiscussionMessage(
                    $user,
                    self::positiveId($params['id']),
                    self::positiveId($params['messageId']),
                    $request->body,
                ),
            ]);
        });

        $router->add('DELETE', '/api/v1/issues/{id}/discussion/{messageId}', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            $this->service->deleteDiscussionMessage(
                $user,
                self::positiveId($params['id']),
                self::positiveId($params['messageId']),
            );
            return Response::json(204);
        });

        $router->add('POST', '/api/v1/projects/{id}/issues', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(201, [
                'issue' => $this->service->create($user, self::positiveId($params['id']), $request->body),
            ]);
        });

        $router->add('PATCH', '/api/v1/issues/{id}', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(200, [
                'issue' => $this->service->update($user, self::positiveId($params['id']), $request->body),
            ]);
        });

        $router->add('POST', '/api/v1/issues/{id}/move', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(200, [
                'issue' => $this->service->move($user, self::positiveId($params['id']), $request->body),
            ]);
        });

        $router->add('DELETE', '/api/v1/issues/{id}', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            $this->service->delete($user, self::positiveId($params['id']));
            return Response::json(204);
        });

        $router->add('POST', '/api/v1/issues/{id}/restore', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(200, [
                'issue' => $this->service->restore($user, self::positiveId($params['id'])),
            ]);
        });
    }

    private static function issueListResponse(Request $request, array $issues): Response
    {
        $etag = '"' . hash('sha256', json_encode($issues, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)) . '"';
        $headers = ['ETag' => $etag, 'Cache-Control' => 'no-cache'];
        $ifNoneMatch = $request->header('If-None-Match');
        if ($ifNoneMatch !== null && self::matchesEtag($ifNoneMatch, $etag)) {
            return Response::notModified($headers);
        }

        return Response::json(200, ['issues' => $issues], $headers);
    }

    private static function matchesEtag(string $header, string $etag): bool
    {
        foreach (explode(',', $header) as $candidate) {
            $candidate = trim($candidate);
            if ($candidate === '*' || preg_replace('/^W\//', '', $candidate) === $etag) return true;
        }
        return false;
    }

    private static function positiveId(string $value): int
    {
        $parsed = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($parsed === false) {
            throw new ApiException(404, 'not_found', 'The requested resource was not found.');
        }
        return $parsed;
    }
}
