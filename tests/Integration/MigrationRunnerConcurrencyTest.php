<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use PDO;
use PDOException;
use PHPUnit\Framework\TestCase;
use Tangent\Core\Database;
use Tangent\Core\MigrationRunner;

final class MigrationRunnerConcurrencyTest extends TestCase
{
    public function testConcurrentConnectionsApplyOneMigrationOnlyOnce(): void
    {
        $pdo = $this->connect();
        $probe = 'migration_runner_probe_' . bin2hex(random_bytes(5));
        $version = '001_' . $probe . '.sql';
        $directory = sys_get_temp_dir() . '/' . $probe;
        $barrier = $probe . '_barrier';
        mkdir($directory, 0700, true);
        $pdo->exec('CREATE TABLE `' . $probe . '` (token CHAR(16) NOT NULL) ENGINE=InnoDB');
        file_put_contents(
            $directory . '/' . $version,
            "DO GET_LOCK('{$barrier}', 30);\nDO RELEASE_LOCK('{$barrier}');\nINSERT INTO `{$probe}` (token) VALUES ('0123456789abcdef');\n",
        );
        self::assertSame(1, (int) $pdo->query("SELECT GET_LOCK('{$barrier}', 0)")->fetchColumn());

        $children = [];
        $pipesByChild = [];
        $connectionFiles = [];
        $childCode = <<<'PHP'
require getcwd() . '/vendor/autoload.php';
$database = Tangent\Core\Database::connect(
    getenv('TANGENT_TEST_DB_HOST') ?: '127.0.0.1',
    (int) (getenv('TANGENT_TEST_DB_PORT') ?: 3306),
    getenv('TANGENT_TEST_DB_NAME') ?: 'tangent_test_suite',
    getenv('TANGENT_TEST_DB_USER') ?: 'tangent',
    getenv('TANGENT_TEST_DB_PASSWORD') ?: 'tangent_dev_password',
);
file_put_contents($argv[2], (string) $database->pdo()->query('SELECT CONNECTION_ID()')->fetchColumn());
(new Tangent\Core\MigrationRunner($database->pdo(), $argv[1]))->migrate();
PHP;

        try {
            for ($index = 0; $index < 2; $index++) {
                $connectionFile = $directory . '/connection-' . $index;
                $connectionFiles[] = $connectionFile;
                $pipes = [];
                $child = proc_open(
                    [PHP_BINARY, '-r', $childCode, $directory, $connectionFile],
                    [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
                    $pipes,
                    dirname(__DIR__, 2),
                );
                self::assertIsResource($child, 'Could not start a migration connection.');
                fclose($pipes[0]);
                $children[] = $child;
                $pipesByChild[] = [$pipes[1], $pipes[2]];
            }

            $this->waitForBothConnectionsAtNamedLock($pdo, $connectionFiles);
            $pdo->query("SELECT RELEASE_LOCK('{$barrier}')")->fetchColumn();

            foreach ($children as $index => $child) {
                [$stdout, $stderr] = $pipesByChild[$index];
                $output = stream_get_contents($stdout);
                $error = stream_get_contents($stderr);
                fclose($stdout);
                fclose($stderr);
                self::assertSame(0, proc_close($child), trim($output . "\n" . $error));
                $children[$index] = null;
            }

            $count = $pdo->query("SELECT COUNT(*) FROM `{$probe}`")->fetchColumn();
            self::assertSame(1, (int) $count);
        } finally {
            $pdo->query("SELECT RELEASE_LOCK('{$barrier}')")->fetchColumn();
            foreach ($children as $index => $child) {
                if (is_resource($child)) {
                    proc_terminate($child);
                    [$stdout, $stderr] = $pipesByChild[$index];
                    fclose($stdout);
                    fclose($stderr);
                    proc_close($child);
                }
            }
            $this->cleanup($pdo, $probe, $version, $directory);
        }
    }

    private function waitForBothConnectionsAtNamedLock(PDO $pdo, array $connectionFiles): void
    {
        $deadline = microtime(true) + 10;
        $lastProcessState = [];
        do {
            $ids = [];
            foreach ($connectionFiles as $file) {
                if (is_file($file)) {
                    $ids[] = (int) file_get_contents($file);
                }
            }
            if (count($ids) === 2) {
                $placeholders = implode(',', array_fill(0, count($ids), '?'));
                $statement = $pdo->prepare(
                    "SELECT COUNT(*) FROM information_schema.PROCESSLIST
                     WHERE ID IN ({$placeholders}) AND STATE = 'User lock'",
                );
                $statement->execute($ids);
                if ((int) $statement->fetchColumn() === 2) {
                    return;
                }
                $details = $pdo->prepare(
                    "SELECT ID, COMMAND, STATE, INFO FROM information_schema.PROCESSLIST WHERE ID IN ({$placeholders})",
                );
                $details->execute($ids);
                $lastProcessState = $details->fetchAll(PDO::FETCH_ASSOC);
            }
            usleep(10000);
        } while (microtime(true) < $deadline);

        self::fail('Both migration connections did not reach the database lock barrier: ' . json_encode($lastProcessState));
    }

    public function testMigrationLockIsReleasedAfterFailure(): void
    {
        $observer = $this->connect();
        $probe = 'migration_runner_failure_' . bin2hex(random_bytes(5));
        $version = '001_' . $probe . '.sql';
        $directory = sys_get_temp_dir() . '/' . $probe;
        $databaseName = (string) $observer->query('SELECT DATABASE()')->fetchColumn();
        $lockName = 'tangent:migrate:' . substr(hash('sha256', $databaseName), 0, 48);
        mkdir($directory, 0700, true);
        file_put_contents($directory . '/' . $version, 'THIS IS NOT VALID SQL;');

        try {
            $failure = null;
            try {
                (new MigrationRunner($this->connect(), $directory))->migrate();
            } catch (PDOException $error) {
                $failure = $error;
            }
            self::assertInstanceOf(PDOException::class, $failure);

            $lock = $observer->prepare('SELECT GET_LOCK(:lock_name, 0)');
            $lock->execute(['lock_name' => $lockName]);
            self::assertSame(1, (int) $lock->fetchColumn(), 'The failed invocation left the migration lock held.');
            $release = $observer->prepare('SELECT RELEASE_LOCK(:lock_name)');
            $release->execute(['lock_name' => $lockName]);
            $release->fetchColumn();
        } finally {
            $this->cleanup($observer, $probe, $version, $directory);
        }
    }

    private function connect(): PDO
    {
        return Database::connect(
            getenv('TANGENT_TEST_DB_HOST') ?: '127.0.0.1',
            (int) (getenv('TANGENT_TEST_DB_PORT') ?: 3306),
            getenv('TANGENT_TEST_DB_NAME') ?: 'tangent_test_suite',
            getenv('TANGENT_TEST_DB_USER') ?: 'tangent',
            getenv('TANGENT_TEST_DB_PASSWORD') ?: 'tangent_dev_password',
        )->pdo();
    }

    private function cleanup(PDO $pdo, string $table, string $version, string $directory): void
    {
        $statement = $pdo->prepare('DELETE FROM schema_migrations WHERE version = :version');
        $statement->execute(['version' => $version]);
        $pdo->exec('DROP TABLE IF EXISTS `' . $table . '`');
        foreach (glob($directory . '/*') ?: [] as $file) {
            @unlink($file);
        }
        @rmdir($directory);
    }
}
