<?php

declare(strict_types=1);

namespace Tangent\Modules\Issues;

use Tangent\Core\AuthenticatedUser;
use Tangent\Core\PositiveId;
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
            $this->service->approve($user, PositiveId::parse($params['id']));
            return Response::json(200, ['approved' => true]);
        });

        $router->add('POST', '/api/v1/messages/{id}/issue', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(201, [
                'issue' => $this->service->createFromMessage($user, PositiveId::parse($params['id'])),
            ]);
        });

        $router->add('GET', '/api/v1/projects/{id}/issues', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            $projectId = PositiveId::parse($params['id']);
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
            $projectId = PositiveId::parse($params['id']);
            $revision = $this->service->listRevision($user, $projectId, true);
            return IssueListResponse::conditional(
                $request,
                IssueListResponse::etagForRevision($user->workspaceId . ':' . $projectId . ':deleted:' . $revision),
                fn (): array => $this->service->listDeleted($user, $projectId),
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
                    PositiveId::parse($params['id']),
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
                    PositiveId::parse($params['id']),
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
                    PositiveId::parse($params['id']),
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
                'transitions' => $this->service->statusHistory($user, PositiveId::parse($params['id'])),
            ]);
        });

        $router->add('GET', '/api/v1/issues/{id}/discussion', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(200, [
                'messages' => $this->service->discussion($user, PositiveId::parse($params['id'])),
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
                    PositiveId::parse($params['id']),
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
                    PositiveId::parse($params['id']),
                    PositiveId::parse($params['messageId']),
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
                PositiveId::parse($params['id']),
                PositiveId::parse($params['messageId']),
            );
            return Response::json(204);
        });

        $router->add('POST', '/api/v1/projects/{id}/issues', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(201, [
                'issue' => $this->service->create($user, PositiveId::parse($params['id']), $request->body),
            ]);
        });

        $router->add('PATCH', '/api/v1/issues/{id}', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(200, [
                'issue' => $this->service->update($user, PositiveId::parse($params['id']), $request->body),
            ]);
        });

        $router->add('POST', '/api/v1/issues/{id}/move', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(200, [
                'issue' => $this->service->move($user, PositiveId::parse($params['id']), $request->body),
            ]);
        });

        $router->add('DELETE', '/api/v1/issues/{id}', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            $this->service->delete($user, PositiveId::parse($params['id']));
            return Response::json(204);
        });

        $router->add('POST', '/api/v1/issues/{id}/restore', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(200, [
                'issue' => $this->service->restore($user, PositiveId::parse($params['id'])),
            ]);
        });
    }

}
