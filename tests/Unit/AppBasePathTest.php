<?php

declare(strict_types=1);

namespace Tangent\Tests\Unit;

use PHPUnit\Framework\TestCase;
use Tangent\Core\AppBasePath;

final class AppBasePathTest extends TestCase
{
    public function testAppBasePathComesFromPublicUrl(): void
    {
        self::assertSame('/tangent', AppBasePath::fromPublicUrl('https://fooway.se/tangent/'));
        self::assertSame('', AppBasePath::fromPublicUrl('https://example.test/'));
    }

    public function testRequestPathCanBeMadeRelativeToThePublicBasePath(): void
    {
        self::assertSame(
            '/api/v1/projects/4',
            AppBasePath::relativeRequestPath('/fooway/tangent/api/v1/projects/4', '/fooway/tangent'),
        );
        self::assertSame('/', AppBasePath::relativeRequestPath('/fooway/tangent', '/fooway/tangent'));
        self::assertNull(AppBasePath::relativeRequestPath('/api/v1/projects/4', '/fooway/tangent'));
    }

    public function testScriptNameFindsThePublicDirectoryForInstallRedirects(): void
    {
        self::assertSame('/fooway/tangent', AppBasePath::fromScriptName('/fooway/tangent/install.php'));
        self::assertSame('', AppBasePath::fromScriptName('/index.php'));
    }

    public function testFilesystemLayoutFindsTheUrlPrefixBelowTheDocumentRoot(): void
    {
        $directory = sys_get_temp_dir() . '/tangent-webroot-' . bin2hex(random_bytes(8));
        $documentRoot = $directory . '/fooway';
        $public = $documentRoot . '/tangent';
        mkdir($public, 0700, true);

        try {
            self::assertSame('/tangent', AppBasePath::fromFilesystemPaths($public, $documentRoot));
            self::assertSame('', AppBasePath::fromFilesystemPaths($documentRoot, $documentRoot));
        } finally {
            rmdir($public);
            rmdir($documentRoot);
            rmdir($directory);
        }
    }

    public function testCookiePathsStayInsideTheAppSubdirectory(): void
    {
        self::assertSame('/fooway/tangent/api/v1', AppBasePath::apiCookiePath('/fooway/tangent'));
        self::assertSame('/fooway/tangent/', AppBasePath::csrfCookiePath('/fooway/tangent'));
        self::assertSame('/api/v1', AppBasePath::apiCookiePath(''));
        self::assertSame('/', AppBasePath::csrfCookiePath(''));
    }
}
