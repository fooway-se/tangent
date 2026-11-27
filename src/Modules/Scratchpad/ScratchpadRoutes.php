<?php

declare(strict_types=1);

namespace Tangent\Modules\Scratchpad;

use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Request;
use Tangent\Core\Response;
use Tangent\Core\Router;

final class ScratchpadRoutes
{
    public function __construct(private readonly ScratchpadService $service)
    {
    }

    public function register(Router $router): void
    {
        $router->add('GET', '/api/v1/scratchpad', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            $note = $this->service->read($user);
            $etag = '"' . hash('sha256', json_encode($note, JSON_THROW_ON_ERROR)) . '"';
            $headers = ['ETag' => $etag, 'Cache-Control' => 'no-cache'];
            if (self::matchesEtag($request->header('If-None-Match'), $etag)) {
                return Response::notModified($headers);
            }
            return Response::json(200, $note, $headers);
        });

        $router->add('PUT', '/api/v1/scratchpad', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(200, $this->service->save($user, $request->body));
        });
    }

    private static function matchesEtag(?string $header, string $etag): bool
    {
        if ($header === null) return false;
        foreach (explode(',', $header) as $candidate) {
            $candidate = trim($candidate);
            if ($candidate === '*' || preg_replace('/^W\//', '', $candidate) === $etag) return true;
        }
        return false;
    }
}
