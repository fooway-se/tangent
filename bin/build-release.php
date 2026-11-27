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
$requiredFiles = [
    'bootstrap.php', 'LICENSE', 'INSTALL.md', 'bin/migrate.php', 'bin/email-notification-summaries.php',
    'public/.htaccess', 'public/index.php', 'public/install.php', 'public/upgrade.php',
    'public/assets/app.js', 'public/assets/app.css',
    'docs/GITHUB.md', 'docs/ISSUES.md', 'docs/USER_MANUAL.md', 'docs/openapi.yaml',
];
$releaseFiles = [
    'bootstrap.php', 'bin/migrate.php', 'bin/email-notification-summaries.php', 'LICENSE', 'INSTALL.md',
    'docs/GITHUB.md', 'docs/ISSUES.md', 'docs/USER_MANUAL.md', 'docs/openapi.yaml',
];
$releaseDirectories = ['migrations/', 'resources/', 'src/', 'public/'];
$fail = static function (string $message): never {
    fwrite(STDERR, $message . "\n");
    exit(1);
};

$git = proc_open(
    ['git', '-C', $root, 'ls-files', '-z'],
    [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
    $gitPipes,
);
if (!is_resource($git)) {
    $fail('Unable to read the tracked release file manifest. Run this builder from a Git checkout.');
}
fclose($gitPipes[0]);
$trackedOutput = stream_get_contents($gitPipes[1]);
$gitError = stream_get_contents($gitPipes[2]);
fclose($gitPipes[1]);
fclose($gitPipes[2]);
if (proc_close($git) !== 0) {
    $fail('Unable to read the tracked release file manifest: ' . trim($gitError));
}
$tracked = array_values(array_filter(explode("\0", (string) $trackedOutput), static fn (string $path): bool => $path !== ''));
$trackedSet = array_fill_keys($tracked, true);

foreach (glob($root . '/migrations/[0-9][0-9][0-9]_*.sql') ?: [] as $migrationPath) {
    $relative = 'migrations/' . basename($migrationPath);
    if (!isset($trackedSet[$relative])) {
        $fail("Untracked migration would be omitted from the release: {$relative}. Add and commit it before building.");
    }
}

foreach ($requiredFiles as $relative) {
    if (!isset($trackedSet[$relative]) || !is_file($root . '/' . $relative) || is_link($root . '/' . $relative)) {
        $fail("Required tracked release file is missing: {$relative}");
    }
}

$appHtml = file_get_contents($root . '/public/app.html');
$assetManifestPath = 'public/assets/asset-manifest.json';
$assetManifestJson = file_get_contents($root . '/' . $assetManifestPath);
$assetManifest = is_string($assetManifestJson) ? json_decode($assetManifestJson, true) : null;
$versionedAssets = is_array($assetManifest) ? ($assetManifest['assets'] ?? null) : null;
$versionedStyles = is_array($assetManifest) ? ($assetManifest['styles'] ?? null) : null;
if (!is_string($appHtml)
    || !isset($trackedSet[$assetManifestPath])
    || !is_array($versionedAssets)
    || !is_array($versionedStyles)
    || preg_match('/<script src="\.\/assets\/([^\"]+)"><\/script>/', $appHtml, $themeEntrypointMatch) !== 1
    || preg_match('/<script type="module" src="\.\/assets\/([^\"]+)"><\/script>/', $appHtml, $appEntrypointMatch) !== 1
    || preg_match('/<link rel="stylesheet" href="\.\/assets\/([^\"]+)"\s*\/?>/', $appHtml, $tokensStylesheetMatch) !== 1
    || preg_match_all('/<link rel="stylesheet" href="\.\/assets\/([^\"]+)"\s*\/?>/', $appHtml, $stylesheetMatches) !== 2
    || !isset($versionedAssets['theme-init.js']['file'], $versionedAssets['app.js']['file'])
    || !isset($versionedStyles['tokens.css']['file'], $versionedStyles['app.css']['file'])
    || $themeEntrypointMatch[1] !== $versionedAssets['theme-init.js']['file']
    || $appEntrypointMatch[1] !== $versionedAssets['app.js']['file']
    || $tokensStylesheetMatch[1] !== $versionedStyles['tokens.css']['file']
    || ($stylesheetMatches[1][1] ?? null) !== $versionedStyles['app.css']['file']
) {
    $fail('The application HTML and content-hashed asset manifest are missing or out of sync. Run npm run build.');
}

$canonicalAssets = [];
foreach (glob($root . '/public/assets/*.{js,mjs}', GLOB_BRACE) ?: [] as $assetPath) {
    $name = basename($assetPath);
    if (preg_match('/-[a-f0-9]{12}\.(?:js|mjs)$/', $name) !== 1) {
        $canonicalAssets[] = $name;
    }
}
sort($canonicalAssets, SORT_STRING);
$manifestSourceNames = array_keys($versionedAssets);
sort($manifestSourceNames, SORT_STRING);
if ($canonicalAssets !== $manifestSourceNames) {
    $fail('The content-hashed asset manifest is stale. Run npm run build.');
}

$rewriteImport = static function (array $matches) use ($versionedAssets, $fail): string {
    $specifier = $matches[2];
    if (!str_starts_with($specifier, './') || str_contains(substr($specifier, 2), '/')) {
        $fail("Unsupported frontend import path: {$specifier}");
    }
    $dependencyName = substr($specifier, 2);
    if (!isset($versionedAssets[$dependencyName]['file'])) {
        $fail("The content-hashed asset manifest omits imported module {$dependencyName}.");
    }
    return $matches[1] . './' . $versionedAssets[$dependencyName]['file'] . $matches[3];
};

foreach ($versionedAssets as $sourceName => $asset) {
    if (!is_string($sourceName)
        || basename($sourceName) !== $sourceName
        || !preg_match('/^[A-Za-z0-9._-]+\.m?js$/', $sourceName)
        || !is_array($asset)
        || !is_string($asset['file'] ?? null)
        || !is_string($asset['sha256'] ?? null)
    ) {
        $fail('The content-hashed asset manifest contains an invalid entry. Run npm run build.');
    }

    $sourcePath = 'public/assets/' . $sourceName;
    $versionedName = $asset['file'];
    $versionedPath = 'public/assets/' . $versionedName;
    if (!isset($trackedSet[$sourcePath], $trackedSet[$versionedPath])
        || !is_file($root . '/' . $sourcePath)
        || !is_file($root . '/' . $versionedPath)
        || is_link($root . '/' . $sourcePath)
        || is_link($root . '/' . $versionedPath)
        || basename($versionedName) !== $versionedName
    ) {
        $fail("A content-hashed frontend asset is missing from the tracked release: {$versionedPath}.");
    }

    $sourceContents = file_get_contents($root . '/' . $sourcePath);
    $versionedContents = file_get_contents($root . '/' . $versionedPath);
    if (!is_string($sourceContents) || !is_string($versionedContents)) {
        $fail("Unable to read the versioned frontend asset: {$versionedPath}.");
    }
    $rewrittenContents = preg_replace_callback(
        '~((?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["\'])(\.\.?/[^"\']+\.m?js)(["\'])~',
        $rewriteImport,
        $sourceContents,
    );
    if (!is_string($rewrittenContents)) {
        $fail("Unable to rewrite imports for frontend asset: {$sourcePath}.");
    }

    $digest = hash('sha256', $rewrittenContents);
    $extension = str_ends_with($sourceName, '.mjs') ? '.mjs' : '.js';
    $expectedName = substr($sourceName, 0, -strlen($extension)) . '-' . substr($digest, 0, 12) . $extension;
    if ($versionedName !== $expectedName
        || !hash_equals($digest, $asset['sha256'])
        || !hash_equals(hash('sha256', $versionedContents), $digest)
    ) {
        $fail("The versioned frontend asset is stale: {$versionedPath}. Run npm run build.");
    }
}

$canonicalStyles = [];
foreach (glob($root . '/public/assets/*.css') ?: [] as $stylePath) {
    $name = basename($stylePath);
    if (preg_match('/-[a-f0-9]{12}\.css$/', $name) !== 1) {
        $canonicalStyles[] = $name;
    }
}
sort($canonicalStyles, SORT_STRING);
$manifestStyleNames = array_keys($versionedStyles);
sort($manifestStyleNames, SORT_STRING);
if ($canonicalStyles !== $manifestStyleNames) {
    $fail('The content-hashed stylesheet manifest is stale. Run npm run build.');
}

foreach ($versionedStyles as $sourceName => $style) {
    if (!is_string($sourceName)
        || basename($sourceName) !== $sourceName
        || !preg_match('/^[A-Za-z0-9._-]+\.css$/', $sourceName)
        || !is_array($style)
        || !is_string($style['file'] ?? null)
        || !is_string($style['sha256'] ?? null)
    ) {
        $fail('The content-hashed stylesheet manifest contains an invalid entry. Run npm run build.');
    }

    $sourcePath = 'public/assets/' . $sourceName;
    $versionedName = $style['file'];
    $versionedPath = 'public/assets/' . $versionedName;
    if (!isset($trackedSet[$sourcePath], $trackedSet[$versionedPath])
        || !is_file($root . '/' . $sourcePath)
        || !is_file($root . '/' . $versionedPath)
        || is_link($root . '/' . $sourcePath)
        || is_link($root . '/' . $versionedPath)
        || basename($versionedName) !== $versionedName
    ) {
        $fail("A content-hashed frontend stylesheet is missing from the tracked release: {$versionedPath}.");
    }

    $contents = file_get_contents($root . '/' . $sourcePath);
    $versionedContents = file_get_contents($root . '/' . $versionedPath);
    if (!is_string($contents) || !is_string($versionedContents)) {
        $fail("Unable to read the versioned frontend stylesheet: {$versionedPath}.");
    }

    $digest = hash('sha256', $contents);
    $expectedName = substr($sourceName, 0, -4) . '-' . substr($digest, 0, 12) . '.css';
    if ($versionedName !== $expectedName
        || !hash_equals($digest, $style['sha256'])
        || !hash_equals(hash('sha256', $versionedContents), $digest)
    ) {
        $fail("The versioned frontend stylesheet is stale: {$versionedPath}. Run npm run build.");
    }
}

$manifest = [];
foreach ($tracked as $relative) {
    if (in_array($relative, $releaseFiles, true)) {
        $manifest[] = $relative;
        continue;
    }
    foreach ($releaseDirectories as $directory) {
        if (str_starts_with($relative, $directory) && !str_ends_with($relative, '/.tangent-app-root')) {
            $manifest[] = $relative;
            break;
        }
    }
}

$temporaryBuild = sys_get_temp_dir() . '/tangent-release-tsc-' . bin2hex(random_bytes(6));
if (!mkdir($temporaryBuild, 0700, true) && !is_dir($temporaryBuild)) {
    $fail('Unable to create a temporary browser asset build directory.');
}

$removeTree = static function (string $directory) use (&$removeTree): void {
    if (is_link($directory) || is_file($directory)) {
        @unlink($directory);
        return;
    }
    if (!is_dir($directory)) return;
    foreach (new FilesystemIterator($directory, FilesystemIterator::SKIP_DOTS) as $entry) {
        $removeTree($entry->getPathname());
    }
    @rmdir($directory);
};

try {
    $compiler = $root . '/node_modules/typescript/bin/tsc';
    if (!is_file($compiler)) {
        throw new RuntimeException('TypeScript is unavailable. Install the project npm dependencies before building a release.');
    }
    $build = proc_open(
        ['node', $compiler, '--project', $root . '/tsconfig.json', '--outDir', $temporaryBuild],
        [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
        $buildPipes,
        $root,
    );
    if (!is_resource($build)) {
        throw new RuntimeException('Unable to start the TypeScript compiler.');
    }
    fclose($buildPipes[0]);
    $buildOutput = stream_get_contents($buildPipes[1]);
    $buildError = stream_get_contents($buildPipes[2]);
    fclose($buildPipes[1]);
    fclose($buildPipes[2]);
    if (proc_close($build) !== 0) {
        throw new RuntimeException('TypeScript compilation failed: ' . trim($buildOutput . "\n" . $buildError));
    }

    $typescriptSources = [];
    $sourceIterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($root . '/frontend/src', FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::LEAVES_ONLY,
    );
    foreach ($sourceIterator as $entry) {
        if ($entry->isFile() && str_ends_with($entry->getFilename(), '.ts')) {
            $typescriptSources[] = $entry->getPathname();
        }
    }
    $expectedAssets = [];
    foreach ($typescriptSources as $source) {
        $relative = substr($source, strlen($root . '/frontend/src/'));
        $expectedAssets[] = substr($relative, 0, -3) . '.js';
    }
    sort($expectedAssets, SORT_STRING);
    $builtAssets = [];
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($temporaryBuild, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::LEAVES_ONLY,
    );
    foreach ($iterator as $entry) {
        if ($entry->isFile() && str_ends_with($entry->getFilename(), '.js')) {
            $builtAssets[] = substr($entry->getPathname(), strlen($temporaryBuild) + 1);
        }
    }
    sort($builtAssets, SORT_STRING);
    if ($builtAssets !== $expectedAssets) {
        throw new RuntimeException('The TypeScript build emitted an unexpected browser asset set.');
    }
    foreach ($expectedAssets as $relative) {
        $compiled = file_get_contents($temporaryBuild . '/' . $relative);
        $checkedIn = file_get_contents($root . '/public/assets/' . $relative);
        if ($compiled === false || $checkedIn === false || !hash_equals(hash('sha256', $compiled), hash('sha256', $checkedIn))) {
            throw new RuntimeException('Browser asset is stale; run npm run build before creating a release: public/assets/' . $relative);
        }
    }
} catch (Throwable $exception) {
    $removeTree($temporaryBuild);
    $fail('Release asset verification failed: ' . $exception->getMessage());
}
$removeTree($temporaryBuild);

$dist = $root . '/dist';
if (!is_dir($dist) && !mkdir($dist, 0700, true) && !is_dir($dist)) {
    $fail('Unable to create the dist directory.');
}

$buildId = date('Ymd-His') . '-' . bin2hex(random_bytes(2));
$archivePath = $dist . '/tangent-alpha-' . $buildId . '.zip';
$temporaryArchive = $archivePath . '.tmp';
$zip = new ZipArchive();
$opened = $zip->open($temporaryArchive, ZipArchive::CREATE | ZipArchive::EXCL);
if ($opened !== true) {
    $fail('Unable to create the release archive.');
}

$prefix = 'tangent-release/';
$addFile = static function (string $relative, string $archiveName) use ($root, $zip, $trackedSet): void {
    $path = $root . '/' . $relative;
    if (!isset($trackedSet[$relative]) || !is_file($path) || is_link($path) || !$zip->addFile($path, $archiveName)) {
        throw new RuntimeException('Unable to add a tracked release file: ' . $relative);
    }
    $zip->setCompressionName($archiveName, ZipArchive::CM_DEFLATE, 6);
};

try {
    $zip->addEmptyDir($prefix . 'tangent-app');
    $zip->addEmptyDir($prefix . 'public_html');
    $zip->addEmptyDir($prefix . 'docs');
    foreach ($manifest as $relative) {
        if (str_starts_with($relative, 'public/')) {
            $publicRelative = substr($relative, strlen('public/'));
            $addFile($relative, $prefix . 'tangent-app/' . $relative);
            $addFile($relative, $prefix . 'public_html/' . $publicRelative);
        } elseif (in_array($relative, ['bootstrap.php', 'bin/migrate.php', 'bin/email-notification-summaries.php'], true)) {
            $addFile($relative, $prefix . 'tangent-app/' . $relative);
        } elseif (str_starts_with($relative, 'migrations/') || str_starts_with($relative, 'resources/') || str_starts_with($relative, 'src/')) {
            $addFile($relative, $prefix . 'tangent-app/' . $relative);
        } elseif ($relative === 'LICENSE' || $relative === 'INSTALL.md') {
            $addFile($relative, $prefix . $relative);
        } elseif (str_starts_with($relative, 'docs/')) {
            $addFile($relative, $prefix . $relative);
        }
    }
    if (!$zip->close()) {
        throw new RuntimeException('Unable to finish the release archive.');
    }

    $validation = new ZipArchive();
    if ($validation->open($temporaryArchive, ZipArchive::RDONLY) !== true) {
        throw new RuntimeException('Unable to reopen the release archive for validation.');
    }
    $expectedEntries = [
        $prefix . 'tangent-app/bootstrap.php',
        $prefix . 'tangent-app/bin/migrate.php',
        $prefix . 'tangent-app/bin/email-notification-summaries.php',
        $prefix . 'tangent-app/migrations/001_core.sql',
        $prefix . 'tangent-app/public/.htaccess',
        $prefix . 'public_html/.htaccess',
        $prefix . 'public_html/index.php',
        $prefix . 'public_html/assets/app.js',
        $prefix . 'public_html/assets/app.css',
    ];
    foreach ($expectedEntries as $entry) {
        if ($validation->locateName($entry) === false) {
            throw new RuntimeException('The release archive is missing a required entry: ' . $entry);
        }
    }
    $validation->close();

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
