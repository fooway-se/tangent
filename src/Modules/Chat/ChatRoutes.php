<?php

declare(strict_types=1);

namespace Tangent\Modules\Chat;

use Tangent\Core\ApiException;
use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Request;
use Tangent\Core\Response;
use Tangent\Core\Router;

final class ChatRoutes
{
    public function __construct(private readonly ChatService $service)
    {
    }

    public function register(Router $router): void
    {
        $router->add('GET', '/api/v1/projects/{id}/messages/{messageId}', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(200, ['message' => $this->service->message(
                $user,
                self::positiveId($params['id']),
                self::positiveId($params['messageId']),
            )]);
        });

        $router->add('GET', '/api/v1/events', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            $result = $this->service->events(
                $user,
                self::sinceId($request) ?? 0,
                $request->header('If-None-Match'),
            );
            if ($result['not_modified']) {
                return Response::notModified([
                    'ETag' => $result['etag'],
                    'Cache-Control' => 'no-cache',
                ]);
            }

            return Response::json(200, ['events' => $result['events']], [
                'ETag' => $result['etag'],
                'Cache-Control' => 'no-cache',
            ]);
        });

        $router->add('GET', '/api/v1/projects/{id}/messages', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            $result = $this->service->messages(
                $user,
                self::positiveId($params['id']),
                self::sinceId($request),
                $request->header('If-None-Match'),
            );
            if ($result['not_modified']) {
                return Response::notModified([
                    'ETag' => $result['etag'],
                    'Cache-Control' => 'no-cache',
                ]);
            }

            return Response::json(200, ['messages' => $result['messages']], [
                'ETag' => $result['etag'],
                'Cache-Control' => 'no-cache',
            ]);
        });

        $router->add('POST', '/api/v1/projects/{id}/messages', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(201, [
                'message' => $this->service->sendMessage(
                    $user,
                    self::positiveId($params['id']),
                    $request->body,
                ),
            ]);
        });
    }

    private static function positiveId(string $value): int
    {
        $parsed = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($parsed === false) {
            throw new ApiException(404, 'not_found', 'The requested resource was not found.');
        }
        return $parsed;
    }

    private static function sinceId(Request $request): ?int
    {
        if (!array_key_exists('since', $request->query)) {
            return null;
        }

        $value = $request->query['since'];
        if (!is_int($value) && !is_string($value)) {
            throw new ApiException(422, 'validation_failed', 'The since cursor must be a non-negative integer.');
        }
        $parsed = filter_var((string) $value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
        if ($parsed === false) {
            throw new ApiException(422, 'validation_failed', 'The since cursor must be a non-negative integer.');
        }
        return $parsed;
    }
}
