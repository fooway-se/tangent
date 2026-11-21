<?php

declare(strict_types=1);

function tangentResolveAppRoot(string $publicDirectory): string
{
    $resolvedPublicDirectory = realpath($publicDirectory);
    if (!is_string($resolvedPublicDirectory)) {
        throw new RuntimeException('Tangent public directory could not be located.');
    }
    $publicDirectory = $resolvedPublicDirectory;
    $parent = dirname($publicDirectory);
    $configured = getenv('TANGENT_APP_ROOT');
    if ($configured === false || trim($configured) === '') {
        $pathFile = $publicDirectory . '/.tangent-app-root';
        if (is_file($pathFile)) {
            if (filesize($pathFile) > 4096) {
                throw new RuntimeException('The Tangent private application path file is invalid.');
            }
            $configured = file_get_contents($pathFile);
        }
    }

    if (is_string($configured) && trim($configured) !== '') {
        $configured = trim($configured);
        if (!str_starts_with($configured, DIRECTORY_SEPARATOR)) {
            throw new RuntimeException('TANGENT_APP_ROOT must be an absolute server path.');
        }
        return tangentValidateAppRoot($configured, $publicDirectory);
    }

    $candidates = [
        $parent,
        $parent . '/tangent-app',
        $parent . '/tangent-backend',
        dirname($parent) . '/tangent-backend',
    ];

    foreach ($candidates as $candidate) {
        try {
            return tangentValidateAppRoot($candidate, $publicDirectory);
        } catch (RuntimeException) {
            continue;
        }
    }

    throw new RuntimeException('Tangent application files could not be located.');
}

function tangentValidateAppRoot(string $candidate, string $publicDirectory): string
{
    $root = realpath($candidate);
    $resolvedPublicDirectory = realpath($publicDirectory);
    if (!is_string($root)
        || !is_string($resolvedPublicDirectory)
        || $root === $resolvedPublicDirectory
        || str_starts_with($root, rtrim($resolvedPublicDirectory, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR)
        || !is_file($root . '/bootstrap.php')
        || !is_dir($root . '/src')
        || !is_dir($root . '/migrations')
    ) {
        throw new RuntimeException('Tangent application files could not be located.');
    }
    return $root;
}

return tangentResolveAppRoot(__DIR__);
