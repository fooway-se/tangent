<?php

declare(strict_types=1);

namespace Tangent\Tests\Unit;

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 2) . '/public/app-root.php';

final class AppRootTest extends TestCase
{
    public function testPublicDirectoryResolvesItsPrivateApplicationSibling(): void
    {
        $directory = sys_get_temp_dir() . '/tangent-layout-' . bin2hex(random_bytes(8));
        $public = $directory . '/public_html';
        $application = $directory . '/tangent-app';
        mkdir($public, 0700, true);
        mkdir($application . '/src', 0700, true);
        mkdir($application . '/migrations', 0700, true);
        file_put_contents($application . '/bootstrap.php', "<?php\n");

        try {
            self::assertSame(realpath($application), tangentResolveAppRoot($public));
        } finally {
            unlink($application . '/bootstrap.php');
            rmdir($application . '/src');
            rmdir($application . '/migrations');
            rmdir($application);
            rmdir($public);
            rmdir($directory);
        }
    }

    public function testPublicDirectoryCanPointToAnArbitrarilyLocatedPrivateApplication(): void
    {
        $directory = sys_get_temp_dir() . '/tangent-custom-layout-' . bin2hex(random_bytes(8));
        $public = $directory . '/fooway/tangent';
        $application = $directory . '/separate/private/tangent-backend';
        mkdir($public, 0700, true);
        mkdir($application . '/src', 0700, true);
        mkdir($application . '/migrations', 0700, true);
        file_put_contents($application . '/bootstrap.php', "<?php\n");
        file_put_contents($public . '/.tangent-app-root', $application . "\n");

        try {
            self::assertSame(realpath($application), tangentResolveAppRoot($public));
        } finally {
            unlink($public . '/.tangent-app-root');
            unlink($application . '/bootstrap.php');
            rmdir($application . '/src');
            rmdir($application . '/migrations');
            rmdir($application);
            rmdir(dirname($application));
            rmdir(dirname(dirname($application)));
            rmdir($public);
            rmdir(dirname($public));
            rmdir($directory);
        }
    }

    public function testRejectsApplicationDirectoryInsideThePublicWebRoot(): void
    {
        $directory = sys_get_temp_dir() . '/tangent-public-app-' . bin2hex(random_bytes(8));
        $public = $directory . '/public';
        $application = $public . '/application';
        mkdir($public, 0700, true);
        mkdir($application . '/src', 0700, true);
        mkdir($application . '/migrations', 0700, true);
        file_put_contents($application . '/bootstrap.php', "<?php\n");
        file_put_contents($public . '/.tangent-app-root', $application . "\n");

        try {
            $this->expectException(\RuntimeException::class);
            tangentResolveAppRoot($public);
        } finally {
            unlink($public . '/.tangent-app-root');
            unlink($application . '/bootstrap.php');
            rmdir($application . '/src');
            rmdir($application . '/migrations');
            rmdir($application);
            rmdir($public);
            rmdir($directory);
        }
    }
}
