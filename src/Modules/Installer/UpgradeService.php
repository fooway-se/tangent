<?php

declare(strict_types=1);

namespace Tangent\Modules\Installer;

use Closure;
use RuntimeException;

final class UpgradeService
{
    private readonly Closure $migrate;

    public function __construct(
        private readonly string $keyPath,
        callable $migrate,
    ) {
        $this->migrate = Closure::fromCallable($migrate);
    }

    public function run(string $providedKey): void
    {
        if (!InstallerKey::matches($this->keyPath, $providedKey)) {
            throw new RuntimeException('The one-time upgrade key is missing or invalid.');
        }

        $lockPath = dirname($this->keyPath) . '/.upgrade.lock';
        $lock = @fopen($lockPath, 'c');
        if ($lock === false) {
            throw new RuntimeException('Unable to lock the upgrade process.');
        }

        try {
            @chmod($lockPath, 0600);
            if (!flock($lock, LOCK_EX | LOCK_NB)) {
                throw new RuntimeException('Another upgrade is already running.');
            }
            if (!InstallerKey::matches($this->keyPath, $providedKey)) {
                throw new RuntimeException('The one-time upgrade key has already been used.');
            }

            ($this->migrate)();
            if (!InstallerKey::consume($this->keyPath)) {
                throw new RuntimeException('Upgrade completed, but the upgrade key could not be removed. Delete it manually.');
            }
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }
}
