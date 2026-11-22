<?php

declare(strict_types=1);

namespace Tangent\Modules\Installer;

use InvalidArgumentException;
use RuntimeException;

final class InstallService
{
    public function __construct(
        private readonly string $keyPath,
        private readonly string $configPath,
        private readonly InstallDatabase $database,
        private readonly ConfigWriter $configWriter = new ConfigWriter(),
    ) {
    }

    public function install(array $rawInput, string $providedKey): int
    {
        if (!InstallerKey::matches($this->keyPath, $providedKey)) {
            throw new RuntimeException('The installer key is missing or invalid.');
        }
        if (file_exists($this->configPath)) {
            throw new RuntimeException('Tangent is already configured.');
        }
        if (!is_dir(dirname($this->configPath)) || !is_writable(dirname($this->configPath))) {
            throw new RuntimeException('The private application directory is not writable.');
        }

        $lockPath = dirname($this->configPath) . '/.install.lock';
        $lock = @fopen($lockPath, 'c');
        if ($lock === false) {
            throw new RuntimeException('Unable to lock the installer.');
        }

        try {
            @chmod($lockPath, 0600);
            if (!flock($lock, LOCK_EX | LOCK_NB)) {
                throw new RuntimeException('Another installation is already running.');
            }
            if (file_exists($this->configPath)) {
                throw new RuntimeException('Tangent is already configured.');
            }

            $input = InstallerInput::validate($rawInput);
            $workspaceId = $this->database->initialize($input);
            $this->configWriter->write($this->configPath, [
                'database' => $input['database'],
                'workspace_id' => $workspaceId,
                'cookie_secure' => $input['cookie_secure'],
                'app_url' => $input['app_url'],
                'mail_from' => $input['mail_from'],
                'hibp_enabled' => false,
            ]);
            if (!InstallerKey::consume($this->keyPath)) {
                error_log('Tangent installed successfully, but .install-key could not be removed.');
            }

            return $workspaceId;
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }
}
