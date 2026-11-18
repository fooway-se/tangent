<?php

declare(strict_types=1);

namespace Tangent\Modules\Installer;

use RuntimeException;

final class ConfigWriter
{
    public function write(string $path, array $config): void
    {
        $directory = dirname($path);
        if (!is_dir($directory) || !is_writable($directory)) {
            throw new RuntimeException('The application directory is not writable.');
        }

        $lockPath = $path . '.lock';
        $lock = @fopen($lockPath, 'c');
        if ($lock === false) {
            throw new RuntimeException('Unable to lock the application configuration.');
        }
        @chmod($lockPath, 0600);

        try {
            if (!flock($lock, LOCK_EX)) {
                throw new RuntimeException('Unable to lock the application configuration.');
            }
            if (file_exists($path)) {
                throw new RuntimeException('The application config.php already exists.');
            }

            $temporary = tempnam($directory, '.tangent-config-');
            if ($temporary === false) {
                throw new RuntimeException('Unable to create the application configuration.');
            }

            try {
                $contents = "<?php\n\ndeclare(strict_types=1);\n\nreturn " . var_export($config, true) . ";\n";
                if (file_put_contents($temporary, $contents, LOCK_EX) !== strlen($contents)) {
                    throw new RuntimeException('Unable to write the application configuration.');
                }
                if (!chmod($temporary, 0600) || !rename($temporary, $path)) {
                    throw new RuntimeException('Unable to protect the application configuration.');
                }
            } finally {
                if (is_file($temporary)) {
                    @unlink($temporary);
                }
            }
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }
}
