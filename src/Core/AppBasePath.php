<?php

declare(strict_types=1);

namespace Tangent\Core;

final class AppBasePath
{
    public static function fromPublicUrl(string $publicUrl): string
    {
        $path = parse_url($publicUrl, PHP_URL_PATH);
        return self::normalize(is_string($path) ? $path : '');
    }

    public static function fromScriptName(string $scriptName): string
    {
        $path = parse_url($scriptName, PHP_URL_PATH);
        if (!is_string($path) || $path === '') {
            return '';
        }

        $directory = dirname($path);
        return self::normalize($directory === '.' ? '' : $directory);
    }

    public static function fromFilesystemPaths(string $publicDirectory, string $documentRoot): string
    {
        $public = realpath($publicDirectory);
        $document = realpath($documentRoot);
        if (!is_string($public) || !is_string($document)) {
            return '';
        }
        if ($public === $document) {
            return '';
        }

        $prefix = rtrim($document, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR;
        if (!str_starts_with($public, $prefix)) {
            return '';
        }

        return self::normalize(str_replace(DIRECTORY_SEPARATOR, '/', substr($public, strlen($prefix))));
    }

    public static function relativeRequestPath(string $requestPath, string $basePath): ?string
    {
        $basePath = self::normalize($basePath);
        if ($basePath === '') {
            return str_starts_with($requestPath, '/') ? $requestPath : '/' . $requestPath;
        }

        if ($requestPath === $basePath || $requestPath === $basePath . '/') {
            return '/';
        }
        if (!str_starts_with($requestPath, $basePath . '/')) {
            return null;
        }

        return substr($requestPath, strlen($basePath));
    }

    public static function apiCookiePath(string $basePath): string
    {
        return self::normalize($basePath) . '/api/v1';
    }

    public static function csrfCookiePath(string $basePath): string
    {
        $basePath = self::normalize($basePath);
        return $basePath === '' ? '/' : $basePath . '/';
    }

    private static function normalize(string $path): string
    {
        $path = '/' . trim($path, '/');
        return $path === '/' ? '' : $path;
    }
}
