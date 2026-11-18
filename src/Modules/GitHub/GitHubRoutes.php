<?php

declare(strict_types=1);

namespace Tangent\Modules\GitHub;

use Tangent\Core\ApiException;
use Tangent\Core\AppConfig;
use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Request;
use Tangent\Core\Response;
use Tangent\Core\Router;

final class GitHubRoutes
{
    public function __construct(
        private readonly GitHubService $service,
        private readonly AppConfig $config,
    ) {
    }

    public function register(Router $router): void
    {
        $router->add('GET', '/api/v1/github/repositories', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, $this->service->repositories($user));
        });

        $router->add('POST', '/api/v1/github/install', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, $this->service->startInstallation($user));
        });

        $router->add('GET', '/api/v1/github/setup', function (Request $request, array $params, AuthenticatedUser $user): Response {
            $installationId = self::positiveId(is_scalar($request->query['installation_id'] ?? null)
                ? (string) $request->query['installation_id'] : '');
            $state = is_string($request->query['state'] ?? null) ? $request->query['state'] : '';
            $this->service->completeInstallation($user, $installationId, $state);
            return new Response(302, [], ['location' => $this->config->publicAppUrl . '/app.html?github=connected']);
        });

        $router->add('POST', '/api/v1/github/webhook', function (Request $request): Response {
            return Response::json(202, $this->service->handleWebhook($request));
        }, false);

        $router->add('GET', '/api/v1/issues/{id}/pull-requests', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(200, [
                'pull_requests' => $this->service->listPullRequests($user, self::positiveId($params['id'])),
            ]);
        });

        $router->add('POST', '/api/v1/issues/{id}/pull-requests', function (Request $request, array $params, AuthenticatedUser $user): Response {
            return Response::json(201, [
                'pull_request' => $this->service->linkPullRequest($user, self::positiveId($params['id']), $request->body),
            ]);
        });

        $router->add('DELETE', '/api/v1/issues/{id}/pull-requests/{pullRequestId}', function (Request $request, array $params, AuthenticatedUser $user): Response {
            $this->service->unlinkPullRequest(
                $user,
                self::positiveId($params['id']),
                self::positiveId($params['pullRequestId']),
            );
            return new Response(204);
        });
    }

    private static function positiveId(string $value): int
    {
        if (!ctype_digit($value) || (int) $value < 1) {
            throw new ApiException(404, 'not_found', 'The requested resource was not found.');
        }
        return (int) $value;
    }
}
