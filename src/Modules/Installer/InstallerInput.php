<?php

declare(strict_types=1);

namespace Tangent\Modules\Installer;

use InvalidArgumentException;
use Tangent\Modules\Auth\PasswordSecurity;
use Tangent\Modules\Auth\UserRepository;

final class InstallerInput
{
    public static function validate(array $input): array
    {
        $host = self::text($input, 'db_host', 'Database host', 255);
        if (!preg_match('/\A[A-Za-z0-9_.:-]+\z/D', $host)) {
            throw new InvalidArgumentException('Enter a valid database host.');
        }

        $portValue = self::text($input, 'db_port', 'Database port', 5);
        if (!ctype_digit($portValue) || (int) $portValue < 1 || (int) $portValue > 65535) {
            throw new InvalidArgumentException('Enter a database port from 1 to 65535.');
        }

        $databaseName = self::text($input, 'db_name', 'Database name', 64);
        if (!preg_match('/\A[A-Za-z0-9_]+\z/D', $databaseName)) {
            throw new InvalidArgumentException('Database names may contain only letters, numbers, and underscores.');
        }

        $databaseUser = self::text($input, 'db_user', 'Database user', 128);
        $databasePassword = self::string($input, 'db_password');
        if (strlen($databasePassword) > 1024) {
            throw new InvalidArgumentException('Database password is too long.');
        }

        $workspaceName = self::text($input, 'workspace_name', 'Workspace name', 120);
        $workspaceSlug = self::text($input, 'workspace_slug', 'Workspace URL name', 100);
        if (!preg_match('/\A[a-z0-9]+(?:-[a-z0-9]+)*\z/D', $workspaceSlug)) {
            throw new InvalidArgumentException('Use lowercase letters, numbers, and single hyphens for the workspace URL name.');
        }

        $adminName = self::text($input, 'admin_name', 'Admin name', 120);
        if (mb_strlen($adminName, 'UTF-8') < 2) {
            throw new InvalidArgumentException('Admin name must be at least 2 characters.');
        }

        $adminEmail = UserRepository::normalizeEmail(self::text($input, 'admin_email', 'Admin email', 254));
        if (!filter_var($adminEmail, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('Enter a valid admin email address.');
        }

        $adminPassword = self::string($input, 'admin_password');
        if (!hash_equals($adminPassword, self::string($input, 'admin_password_confirm'))) {
            throw new InvalidArgumentException('The admin password entries do not match.');
        }
        $passwords = new PasswordSecurity();
        $passwordProblem = $passwords->validate($adminPassword, [
            'name' => $adminName,
            'email' => $adminEmail,
            'workspace' => $workspaceName,
        ]);
        if ($passwordProblem !== null) {
            throw new InvalidArgumentException($passwordProblem);
        }

        $appUrl = rtrim(self::text($input, 'app_url', 'Site URL', 500), '/');
        $parts = parse_url($appUrl);
        if (!is_array($parts)
            || !filter_var($appUrl, FILTER_VALIDATE_URL)
            || !in_array(strtolower((string) ($parts['scheme'] ?? '')), ['http', 'https'], true)
            || empty($parts['host'])
            || isset($parts['user'])
            || isset($parts['pass'])
            || isset($parts['query'])
            || isset($parts['fragment'])
        ) {
            throw new InvalidArgumentException('Enter the public site URL without credentials, query, or fragment.');
        }

        $scheme = strtolower((string) $parts['scheme']);
        $hostname = strtolower(trim((string) $parts['host'], '[]'));
        $isLocalhost = in_array($hostname, ['localhost', '127.0.0.1', '::1'], true);
        if ($scheme !== 'https' && !$isLocalhost) {
            throw new InvalidArgumentException('Use HTTPS for the public site URL.');
        }

        return [
            'database' => [
                'host' => $host,
                'port' => (int) $portValue,
                'name' => $databaseName,
                'user' => $databaseUser,
                'password' => $databasePassword,
            ],
            'workspace_name' => $workspaceName,
            'workspace_slug' => $workspaceSlug,
            'admin_name' => $adminName,
            'admin_email' => $adminEmail,
            'admin_password' => $adminPassword,
            'app_url' => $appUrl,
            'cookie_secure' => $scheme === 'https',
        ];
    }

    private static function text(array $input, string $key, string $label, int $maximum): string
    {
        $value = trim(self::string($input, $key));
        $length = mb_strlen($value, 'UTF-8');
        if ($length < 1 || $length > $maximum) {
            throw new InvalidArgumentException("{$label} is required and must be no longer than {$maximum} characters.");
        }
        return $value;
    }

    private static function string(array $input, string $key): string
    {
        $value = $input[$key] ?? null;
        if (!is_string($value) || str_contains($value, "\0")) {
            throw new InvalidArgumentException('The submitted installer form is invalid.');
        }
        return $value;
    }
}
