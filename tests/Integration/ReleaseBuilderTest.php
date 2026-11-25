<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use PHPUnit\Framework\TestCase;
use ZipArchive;

final class ReleaseBuilderTest extends TestCase
{
    public function testReleaseUsesTrackedFilesAndRejectsStaleCompiledAssets(): void
    {
        $root = dirname(__DIR__, 2);
        if (!class_exists(ZipArchive::class)
            || !is_file($root . '/node_modules/typescript/bin/tsc')
            || !$this->commandAvailable('git')
            || !$this->commandAvailable('node')) {
            self::markTestSkipped('Release smoke test requires PHP ZipArchive, Git, Node.js, and installed npm dependencies.');
        }

        $temporaryRoot = sys_get_temp_dir() . '/tangent-release-test-' . bin2hex(random_bytes(6));
        mkdir($temporaryRoot, 0700, true);
        $paths = [
            'bootstrap.php', 'LICENSE', 'INSTALL.md', 'tsconfig.json',
            'bin/migrate.php', 'bin/build-release.php',
            'migrations', 'resources', 'src', 'public', 'frontend/src',
            'docs/GITHUB.md', 'docs/ISSUES.md', 'docs/USER_MANUAL.md', 'docs/openapi.yaml',
        ];

        try {
            foreach ($paths as $path) {
                $this->copyPath($root . '/' . $path, $temporaryRoot . '/' . $path);
            }
            symlink($root . '/node_modules', $temporaryRoot . '/node_modules');
            $this->runCommand(['git', 'init', '-q'], $temporaryRoot);
            $this->runCommand(['git', 'add', '-A'], $temporaryRoot);
            file_put_contents($temporaryRoot . '/public/local-backup.txt', 'must not ship');
            file_put_contents($temporaryRoot . '/public/assets/app.js', "// stale compiled asset\n");

            $staleBuild = $this->runCommand([PHP_BINARY, 'bin/build-release.php'], $temporaryRoot, false);
            self::assertNotSame(0, $staleBuild['status'], 'The release builder accepted JavaScript that does not match TypeScript.');
            self::assertSame([], glob($temporaryRoot . '/dist/*.zip') ?: []);

            copy($root . '/public/assets/app.js', $temporaryRoot . '/public/assets/app.js');
            file_put_contents($temporaryRoot . '/migrations/999_untracked_migration.sql', "ALTER TABLE projects ADD COLUMN test_column INT NULL;\n");
            $untrackedMigrationBuild = $this->runCommand([PHP_BINARY, 'bin/build-release.php'], $temporaryRoot, false);
            self::assertNotSame(0, $untrackedMigrationBuild['status'], 'The release builder silently omitted an untracked migration.');
            self::assertStringContainsString('untracked migration', strtolower($untrackedMigrationBuild['stderr']));
            self::assertSame([], glob($temporaryRoot . '/dist/*.zip') ?: []);

            unlink($temporaryRoot . '/migrations/999_untracked_migration.sql');
            $build = $this->runCommand([PHP_BINARY, 'bin/build-release.php'], $temporaryRoot);
            self::assertSame(0, $build['status'], trim($build['stdout'] . "\n" . $build['stderr']));
            $archives = glob($temporaryRoot . '/dist/*.zip') ?: [];
            self::assertCount(1, $archives);

            $zip = new ZipArchive();
            self::assertTrue($zip->open($archives[0], ZipArchive::RDONLY));
            $entries = [];
            for ($index = 0; $index < $zip->numFiles; $index++) {
                $entry = $zip->getNameIndex($index);
                if (is_string($entry)) $entries[] = $entry;
            }
            $zip->close();

            self::assertNotContains('tangent-release/public_html/local-backup.txt', $entries);
            self::assertContains('tangent-release/public_html/.htaccess', $entries);
            self::assertContains('tangent-release/public_html/index.php', $entries);
            self::assertContains('tangent-release/public_html/assets/app.js', $entries);
            self::assertContains('tangent-release/tangent-app/bootstrap.php', $entries);
            self::assertContains('tangent-release/tangent-app/migrations/001_core.sql', $entries);
            self::assertContains('tangent-release/tangent-app/migrations/047_project_github_default_branch.sql', $entries);
        } finally {
            $this->removeTree($temporaryRoot);
        }
    }

    private function copyPath(string $source, string $destination): void
    {
        if (is_dir($source)) {
            mkdir($destination, 0700, true);
            foreach (new \DirectoryIterator($source) as $entry) {
                if ($entry->isDot()) continue;
                $this->copyPath($entry->getPathname(), $destination . '/' . $entry->getFilename());
            }
            return;
        }

        if (!is_dir(dirname($destination))) mkdir(dirname($destination), 0700, true);
        copy($source, $destination);
    }

    private function commandAvailable(string $command): bool
    {
        $pipes = [];
        $process = @proc_open([$command, '--version'], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        if (!is_resource($process)) return false;
        fclose($pipes[0]);
        stream_get_contents($pipes[1]);
        stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);

        return proc_close($process) === 0;
    }

    private function runCommand(array $command, string $directory, bool $assertSuccess = true): array
    {
        $pipes = [];
        $process = proc_open($command, [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, $directory);
        self::assertIsResource($process);
        fclose($pipes[0]);
        $stdout = stream_get_contents($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $status = proc_close($process);
        if ($assertSuccess) self::assertSame(0, $status, trim($stdout . "\n" . $stderr));

        return ['status' => $status, 'stdout' => $stdout, 'stderr' => $stderr];
    }

    private function removeTree(string $directory): void
    {
        if (is_link($directory) || is_file($directory)) {
            @unlink($directory);
            return;
        }
        if (!is_dir($directory)) return;
        foreach (new \DirectoryIterator($directory) as $entry) {
            if ($entry->isDot()) continue;
            $this->removeTree($entry->getPathname());
        }
        @rmdir($directory);
    }
}
