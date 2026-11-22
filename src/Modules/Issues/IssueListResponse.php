<?php

declare(strict_types=1);

namespace Tangent\Modules\Issues;

use Tangent\Core\Request;
use Tangent\Core\Response;

final class IssueListResponse
{
    public static function etagForRevision(string $revision): string
    {
        return '"' . hash('sha256', $revision) . '"';
    }

    public static function conditional(Request $request, string $etag, callable $loadIssues): Response
    {
        $headers = ['ETag' => $etag, 'Cache-Control' => 'no-cache'];
        $ifNoneMatch = $request->header('If-None-Match');
        if ($ifNoneMatch !== null && self::matchesEtag($ifNoneMatch, $etag)) {
            return Response::notModified($headers);
        }

        return Response::json(200, ['issues' => $loadIssues()], $headers);
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
