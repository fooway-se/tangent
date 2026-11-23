<?php

declare(strict_types=1);

namespace Tangent\Tests\Unit;

use PHPUnit\Framework\TestCase;
use RuntimeException;
use Tangent\Modules\Installer\ConfigWriter;
use Tangent\Modules\Installer\InstallDatabase;
use Tangent\Modules\Installer\InstallService;
use Tangent\Modules\Installer\InstallerInput;
use Tangent\Modules\Installer\InstallRequirements;
use Tangent\Modules\Installer\InstallerKey;
use Tangent\Modules\Installer\UpgradeService;

final class InstallerSupportTest extends TestCase
{
    public function testRequirementsAcceptSupportedPhpBranches(): void
    {
        foreach (['8.4.27', '8.4.99', '8.5.12', '8.6.0'] as $version) {
            self::assertSame([], InstallRequirements::check(
                $version,
                ['pdo_mysql', 'mbstring', 'iconv', 'intl'],
                ['argon2id'],
            ), "PHP {$version} should be accepted.");
        }
    }

    public function testRequirementsRejectUnpatchedPhpBranchesAndPhpNine(): void
    {
        foreach (['8.4.26', '8.5.0', '8.5.11', '9.0.0'] as $version) {
            $problems = InstallRequirements::check(
                $version,
                ['pdo_mysql', 'mbstring', 'iconv', 'intl'],
                ['argon2id'],
            );

            self::assertCount(1, $problems, "PHP {$version} should be rejected.");
            self::assertStringContainsString('PHP 8.4.27', $problems[0]);
        }
    }

    public function testRequirementsReportMissingRuntimeFeatures(): void
    {
        $problems = InstallRequirements::check('8.5.11', ['pdo_mysql'], ['bcrypt']);

        self::assertCount(5, $problems);
        self::assertStringContainsString('PHP 8.4.27', $problems[0]);
        self::assertStringContainsString('mbstring', $problems[1]);
        self::assertStringContainsString('iconv', $problems[2]);
        self::assertStringContainsString('intl', $problems[3]);
        self::assertStringContainsString('Argon2id', $problems[4]);
    }

    public function testInstallerKeyMatchesOnlyThePrivateFileValue(): void
    {
        $directory = $this->temporaryDirectory();
        $path = $directory . '/.install-key';
        $key = str_repeat('a', 64);
        file_put_contents($path, $key . "\n");

        self::assertTrue(InstallerKey::matches($path, $key));
        self::assertFalse(InstallerKey::matches($path, str_repeat('b', 64)));
        self::assertFalse(InstallerKey::matches($directory . '/missing', $key));
    }

    public function testInstallerKeyMustBeHighEntropyHex(): void
    {
        $directory = $this->temporaryDirectory();
        $path = $directory . '/.install-key';
        file_put_contents($path, 'guessable');

        self::assertFalse(InstallerKey::matches($path, 'guessable'));
    }

    public function testConfigWriterCreatesPrivatePhpConfig(): void
    {
        $directory = $this->temporaryDirectory();
        $path = $directory . '/config.php';
        $config = ['database' => ['host' => 'localhost', 'password' => 'test-secret'], 'workspace_id' => 4];

        (new ConfigWriter())->write($path, $config);

        self::assertSame($config, require $path);
        self::assertSame(0600, fileperms($path) & 0777);
    }

    public function testConfigWriterDoesNotOverwriteExistingConfig(): void
    {
        $directory = $this->temporaryDirectory();
        $path = $directory . '/config.php';
        file_put_contents($path, "<?php return ['existing' => true];\n");

        try {
            (new ConfigWriter())->write($path, ['database' => []]);
            self::fail('Expected existing config to be protected.');
        } catch (RuntimeException $exception) {
            self::assertStringContainsString('already exists', $exception->getMessage());
        }

        self::assertSame(['existing' => true], require $path);
    }

    public function testInstallerCreatesConfigAndConsumesTheKeyAfterDatabaseSetup(): void
    {
        $directory = $this->temporaryDirectory();
        $keyPath = $directory . '/.install-key';
        $configPath = $directory . '/config.php';
        $key = str_repeat('c', 64);
        file_put_contents($keyPath, $key);
        $database = new RecordingInstallDatabase(12);
        $input = $this->validInput();

        $workspaceId = (new InstallService($keyPath, $configPath, $database))->install($input, $key);

        self::assertSame(12, $workspaceId);
        self::assertSame(1, $database->calls);
        self::assertFileDoesNotExist($keyPath);
        self::assertSame([
            'database' => [
                'host' => 'db.example.test',
                'port' => 3306,
                'name' => 'tangent',
                'user' => 'tangent_user',
                'password' => 'private-db-password',
            ],
            'workspace_id' => 12,
            'cookie_secure' => true,
            'app_url' => 'https://tangent.example.test',
            'mail_from' => 'no-reply@tangent.example.test',
            'hibp_enabled' => false,
            'realtime_stream_enabled' => false,
            'realtime_max_connections' => 1,
        ], require $configPath);
    }

    public function testInstallerRejectsAnInvalidKeyBeforeConnectingToDatabase(): void
    {
        $directory = $this->temporaryDirectory();
        $keyPath = $directory . '/.install-key';
        file_put_contents($keyPath, str_repeat('d', 64));
        $database = new RecordingInstallDatabase(12);

        try {
            (new InstallService($keyPath, $directory . '/config.php', $database))
                ->install($this->validInput(), str_repeat('e', 64));
            self::fail('Expected an invalid key to be rejected.');
        } catch (RuntimeException $exception) {
            self::assertStringContainsString('installer key', strtolower($exception->getMessage()));
        }

        self::assertSame(0, $database->calls);
    }

    public function testInstallerValidatesHttpsAndAdminPasswordBeforeDatabaseSetup(): void
    {
        $directory = $this->temporaryDirectory();
        $keyPath = $directory . '/.install-key';
        $key = str_repeat('f', 64);
        file_put_contents($keyPath, $key);
        $database = new RecordingInstallDatabase(12);
        $input = $this->validInput();
        $input['app_url'] = 'http://tangent.example.test';

        try {
            (new InstallService($keyPath, $directory . '/config.php', $database))->install($input, $key);
            self::fail('Expected an insecure URL to be rejected.');
        } catch (\InvalidArgumentException $exception) {
            self::assertStringContainsString('HTTPS', $exception->getMessage());
        }

        self::assertSame(0, $database->calls);
    }

    public function testInstallerRequiresAValidSenderEmailBeforeDatabaseSetup(): void
    {
        $directory = $this->temporaryDirectory();
        $keyPath = $directory . '/.install-key';
        $key = str_repeat('f', 64);
        file_put_contents($keyPath, $key);
        $database = new RecordingInstallDatabase(12);
        $input = $this->validInput();
        $input['mail_from'] = 'not-an-email';

        try {
            (new InstallService($keyPath, $directory . '/config.php', $database))->install($input, $key);
            self::fail('Expected an invalid sender address to be rejected.');
        } catch (\InvalidArgumentException $exception) {
            self::assertStringContainsString('sender email address', strtolower($exception->getMessage()));
        }

        self::assertSame(0, $database->calls);
    }

    public function testInstallerRejectsMismatchedAdminPasswordsBeforeDatabaseSetup(): void
    {
        $directory = $this->temporaryDirectory();
        $keyPath = $directory . '/.install-key';
        $key = str_repeat('4', 64);
        file_put_contents($keyPath, $key);
        $database = new RecordingInstallDatabase(12);
        $input = $this->validInput();
        $input['admin_password_confirm'] = 'different password phrase 12345';

        try {
            (new InstallService($keyPath, $directory . '/config.php', $database))->install($input, $key);
            self::fail('Expected mismatched passwords to be rejected.');
        } catch (\InvalidArgumentException $exception) {
            self::assertStringContainsString('do not match', $exception->getMessage());
        }

        self::assertSame(0, $database->calls);
    }

    public function testUpgradeRunsMigrationAndConsumesTheKey(): void
    {
        $directory = $this->temporaryDirectory();
        $keyPath = $directory . '/.upgrade-key';
        $key = str_repeat('9', 64);
        file_put_contents($keyPath, $key);
        $calls = 0;

        (new UpgradeService($keyPath, static function () use (&$calls): void {
            $calls++;
        }))->run($key);

        self::assertSame(1, $calls);
        self::assertFileDoesNotExist($keyPath);
    }

    public function testUpgradeRetainsKeyWhenMigrationFails(): void
    {
        $directory = $this->temporaryDirectory();
        $keyPath = $directory . '/.upgrade-key';
        $key = str_repeat('8', 64);
        file_put_contents($keyPath, $key);

        try {
            (new UpgradeService($keyPath, static function (): void {
                throw new RuntimeException('migration failed');
            }))->run($key);
            self::fail('Expected migration failure to be passed to the caller.');
        } catch (RuntimeException $exception) {
            self::assertSame('migration failed', $exception->getMessage());
        }

        self::assertFileExists($keyPath);
    }

    public function testUpgradeRejectsInvalidKeyWithoutRunningMigration(): void
    {
        $directory = $this->temporaryDirectory();
        $keyPath = $directory . '/.upgrade-key';
        file_put_contents($keyPath, str_repeat('7', 64));
        $calls = 0;

        try {
            (new UpgradeService($keyPath, static function () use (&$calls): void {
                $calls++;
            }))->run(str_repeat('6', 64));
            self::fail('Expected invalid upgrade key to be rejected.');
        } catch (RuntimeException $exception) {
            self::assertStringContainsString('upgrade key', strtolower($exception->getMessage()));
        }

        self::assertSame(0, $calls);
    }

    private function temporaryDirectory(): string
    {
        $path = sys_get_temp_dir() . '/tangent-installer-' . bin2hex(random_bytes(8));
        mkdir($path, 0700);
        $this->directories[] = $path;
        return $path;
    }

    private function validInput(): array
    {
        return [
            'db_host' => 'db.example.test',
            'db_port' => '3306',
            'db_name' => 'tangent',
            'db_user' => 'tangent_user',
            'db_password' => 'private-db-password',
            'workspace_name' => 'Tangent Team',
            'workspace_slug' => 'tangent-team',
            'admin_name' => 'Site Admin',
            'admin_email' => 'admin@example.test',
            'admin_password' => 'unique password for install 4391',
            'admin_password_confirm' => 'unique password for install 4391',
            'app_url' => 'https://tangent.example.test',
            'mail_from' => 'no-reply@tangent.example.test',
        ];
    }

    /** @var list<string> */
    private array $directories = [];

    protected function tearDown(): void
    {
        foreach ($this->directories as $directory) {
            foreach (glob($directory . '/*') ?: [] as $file) {
                unlink($file);
            }
            foreach (glob($directory . '/.*') ?: [] as $file) {
                if (is_file($file)) {
                    unlink($file);
                }
            }
            rmdir($directory);
        }
        parent::tearDown();
    }
}

final class RecordingInstallDatabase implements InstallDatabase
{
    public int $calls = 0;

    public function __construct(private readonly int $workspaceId)
    {
    }

    public function initialize(array $input): int
    {
        $this->calls++;
        return $this->workspaceId;
    }
}
