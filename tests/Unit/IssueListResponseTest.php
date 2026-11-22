<?php

declare(strict_types=1);

namespace Tangent\Tests\Unit;

use PHPUnit\Framework\TestCase;
use Tangent\Core\Request;
use Tangent\Modules\Issues\IssueListResponse;

final class IssueListResponseTest extends TestCase
{
    public function testMatchingRevisionSkipsCollectionLoading(): void
    {
        $loads = 0;
        $response = IssueListResponse::conditional(
            Request::json('GET', '/api/v1/projects/12/issues', [], ['If-None-Match' => '"revision-a"']),
            '"revision-a"',
            static function () use (&$loads): array {
                $loads++;
                return [['id' => 1]];
            },
        );

        self::assertSame(304, $response->status);
        self::assertSame('"revision-a"', $response->headers['etag']);
        self::assertSame(0, $loads);
    }

    public function testChangedRevisionLoadsCollectionAndReturnsItWithTheRevision(): void
    {
        $loads = 0;
        $response = IssueListResponse::conditional(
            Request::json('GET', '/api/v1/projects/12/issues', [], ['If-None-Match' => '"revision-a"']),
            '"revision-b"',
            static function () use (&$loads): array {
                $loads++;
                return [['id' => 2]];
            },
        );

        self::assertSame(200, $response->status);
        self::assertSame([['id' => 2]], $response->body['issues']);
        self::assertSame('"revision-b"', $response->headers['etag']);
        self::assertSame(1, $loads);
    }
}
