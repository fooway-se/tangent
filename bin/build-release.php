<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This release builder is available only from the command line.\n");
    exit(1);
}
if (!class_exists(ZipArchive::class)) {
    fwrite(STDERR, "The PHP zip extension is required to build a release archive.\n");
    exit(1);
}

$root = dirname(__DIR__);
$requiredFiles = ['bootstrap.php', 'LICENSE', 'public/index.php', 'public/install.php', 'public/upgrade.php'];
foreach ($requiredFiles as $relative) {
    if (!is_file($root . '/' . $relative)) {
        fwrite(STDERR, "Required release file is missing: {$relative}\n");
        exit(1);
    }
}

$dist = $root . '/dist';
if (!is_dir($dist) && !mkdir($dist, 0700, true) && !is_dir($dist)) {
    fwrite(STDERR, "Unable to create the dist directory.\n");
    exit(1);
}

$buildId = date('Ymd-His') . '-' . bin2hex(random_bytes(2));
$archivePath = $dist . '/tangent-alpha-' . $buildId . '.zip';
$temporaryArchive = $archivePath . '.tmp';
$zip = new ZipArchive();
$opened = $zip->open($temporaryArchive, ZipArchive::CREATE | ZipArchive::EXCL);
if ($opened !== true) {
    fwrite(STDERR, "Unable to create the release archive.\n");
    exit(1);
}

$prefix = 'tangent-release/';
$addTree = static function (string $source, string $archivePrefix) use ($zip): void {
    $source = rtrim($source, '/');
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($source, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::LEAVES_ONLY,
    );
    foreach ($iterator as $entry) {
        if (!$entry->isFile() || $entry->isLink()) {
            continue;
        }
        $path = $entry->getPathname();
        $relative = substr($path, strlen($source) + 1);
        if ($relative === false || $relative === '') {
            continue;
        }
        if ($relative === '.tangent-app-root') {
            continue;
        }
        $archiveName = $archivePrefix . str_replace(DIRECTORY_SEPARATOR, '/', $relative);
        if (!$zip->addFile($path, $archiveName)) {
            throw new RuntimeException('Unable to add a file to the release archive.');
        }
        $zip->setCompressionName($archiveName, ZipArchive::CM_DEFLATE, 6);
    }
};

$addFile = static function (string $relative, string $archiveName) use ($root, $zip): void {
    if (!$zip->addFile($root . '/' . $relative, $archiveName)) {
        throw new RuntimeException('Unable to add a file to the release archive.');
    }
    $zip->setCompressionName($archiveName, ZipArchive::CM_DEFLATE, 6);
};

try {
    $zip->addEmptyDir($prefix . 'tangent-app');
    $zip->addEmptyDir($prefix . 'public_html');
    $addFile('bootstrap.php', $prefix . 'tangent-app/bootstrap.php');
    $addFile('bin/migrate.php', $prefix . 'tangent-app/bin/migrate.php');
    foreach (['migrations', 'resources', 'src', 'public'] as $directory) {
        $addTree($root . '/' . $directory, $prefix . 'tangent-app/' . $directory . '/');
    }
    $addTree($root . '/public', $prefix . 'public_html/');
    $addFile('LICENSE', $prefix . 'LICENSE');
    $addFile('INSTALL.md', $prefix . 'INSTALL.md');
    if (!$zip->close()) {
        throw new RuntimeException('Unable to finish the release archive.');
    }
    if (!rename($temporaryArchive, $archivePath)) {
        throw new RuntimeException('Unable to publish the release archive.');
    }
} catch (Throwable $exception) {
    $zip->close();
    @unlink($temporaryArchive);
    @unlink($archivePath);
    fwrite(STDERR, "Release archive creation failed: {$exception->getMessage()}\n");
    exit(1);
}

fwrite(STDOUT, "Created {$archivePath}\n");
