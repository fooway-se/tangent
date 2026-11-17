<?php

declare(strict_types=1);

namespace Tangent\Core;

final class Runtime
{
    /** @var array<string, mixed>|null */
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
        $fileConfig = self::fileConfig();
        $workspaceId = (int) self::environment(
            'TANGENT_WORKSPACE_ID',
            $fileConfig['workspace_id'] ?? '1',
        );
        $cookieSecure = self::environment(
            'TANGENT_COOKIE_SECURE',
            $fileConfig['cookie_secure'] ?? 'true',
        );
        $publicAppUrl = self::environment('TANGENT_APP_URL', $fileConfig['app_url'] ?? 'http://localhost:8080');
        $hibpEnabled = self::environment('TANGENT_HIBP_ENABLED', $fileConfig['hibp_enabled'] ?? 'false');

        return new AppConfig(
            max(1, $workspaceId),
            filter_var($cookieSecure, FILTER_VALIDATE_BOOL),
            43200,
            rtrim($publicAppUrl, '/'),
            filter_var($hibpEnabled, FILTER_VALIDATE_BOOL),
        );
    }

    private static function environment(string $key, mixed $fallback): string
    {
        $value = getenv($key);
        return $value === false || $value === '' ? (string) $fallback : $value;
    }

    /** @return array<string, mixed> */
    private static function fileConfig(): array
    {
        if (self::$fileConfig !== null) {
            return self::$fileConfig;
        }

        $path = dirname(__DIR__, 2) . '/config.php';
        if (!is_file($path)) {
            self::$fileConfig = [];
            return self::$fileConfig;
        }

        $config = require $path;
        self::$fileConfig = is_array($config) ? $config : [];
        return self::$fileConfig;
    }
}
