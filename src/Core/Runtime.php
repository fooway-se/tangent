<?php

declare(strict_types=1);

namespace Tangent\Core;

final class Runtime
{
    private static ?array $fileConfig = null;

    public static function database(): Database
    {
        $database = self::fileConfig()['database'] ?? [];
        $host = self::environment('TANGENT_DB_HOST', $database['host'] ?? '127.0.0.1');
        $port = (int) self::environment('TANGENT_DB_PORT', $database['port'] ?? '3306');
        $name = self::environment('TANGENT_DB_NAME', $database['name'] ?? 'tangent');
        $username = self::environment('TANGENT_DB_USER', $database['user'] ?? 'tangent');
        $password = self::environment('TANGENT_DB_PASSWORD', $database['password'] ?? '');

        return Database::connect($host, $port, $name, $username, $password);
    }

    public static function appConfig(): AppConfig
    {
        return AppConfig::fromEnvironment(self::fileConfig());
    }

    public static function configPath(): string
    {
        return dirname(__DIR__, 2) . '/config.php';
    }

    public static function isConfigured(): bool
    {
        $database = self::fileConfig()['database'] ?? null;
        if (is_array($database)
            && !empty($database['host'])
            && !empty($database['name'])
            && !empty($database['user'])
        ) {
            return true;
        }

        return getenv('TANGENT_DB_NAME') !== false
            && getenv('TANGENT_DB_NAME') !== ''
            && getenv('TANGENT_DB_USER') !== false
            && getenv('TANGENT_DB_USER') !== '';
    }

    private static function environment(string $key, mixed $fallback): string
    {
        $value = getenv($key);
        return $value === false || $value === '' ? (string) $fallback : $value;
    }

    private static function fileConfig(): array
    {
        if (self::$fileConfig !== null) {
            return self::$fileConfig;
        }

        $path = self::configPath();
        if (!is_file($path)) {
            self::$fileConfig = [];
            return self::$fileConfig;
        }

        $config = require $path;
        self::$fileConfig = is_array($config) ? $config : [];
        return self::$fileConfig;
    }
}
