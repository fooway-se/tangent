<?php

declare(strict_types=1);

namespace Tangent\Modules\Installer;

final class InstallRequirements
{
    private const REQUIRED_EXTENSIONS = ['pdo_mysql', 'mbstring', 'iconv', 'intl'];

    /** @return list<string> */
    public static function check(
        ?string $phpVersion = null,
        ?array $extensions = null,
        ?array $passwordAlgorithms = null,
    ): array {
        $phpVersion ??= PHP_VERSION;
        $extensions ??= get_loaded_extensions();
        $passwordAlgorithms ??= password_algos();

        $problems = [];
        $supportedPhpVersion = (
            version_compare($phpVersion, '8.4.27', '>=')
            && version_compare($phpVersion, '8.5.0', '<')
        ) || (
            version_compare($phpVersion, '8.5.12', '>=')
            && version_compare($phpVersion, '9.0.0', '<')
        );
        if (!$supportedPhpVersion) {
            $problems[] = 'PHP 8.4.27 or later within PHP 8 is required; PHP 8.5.0 through 8.5.11 and PHP 9 are unsupported.';
        }

        foreach (self::REQUIRED_EXTENSIONS as $extension) {
            if (!in_array($extension, $extensions, true)) {
                $problems[] = "The PHP {$extension} extension is required.";
            }
        }

        if (!in_array('argon2id', array_map('strtolower', $passwordAlgorithms), true)) {
            $problems[] = 'PHP must support Argon2id password hashing.';
        }

        return $problems;
    }
}
