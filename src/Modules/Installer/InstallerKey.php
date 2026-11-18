<?php

declare(strict_types=1);

namespace Tangent\Modules\Installer;

final class InstallerKey
{
    public static function matches(string $path, string $provided): bool
    {
        $stored = @file_get_contents($path);
        if (!is_string($stored)) {
            return false;
        }

        $stored = trim($stored);
        $provided = trim($provided);
        if (!preg_match('/\A[a-f0-9]{64}\z/D', $stored) || !preg_match('/\A[a-f0-9]{64}\z/D', $provided)) {
            return false;
        }

        return hash_equals($stored, $provided);
    }

    public static function consume(string $path): bool
    {
        return !is_file($path) || @unlink($path);
    }
}
