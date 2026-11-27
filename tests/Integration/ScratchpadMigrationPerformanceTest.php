<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use PDO;
use PHPUnit\Framework\TestCase;
use Tangent\Core\Database;
use Tangent\Core\MigrationRunner;

final class ScratchpadMigrationPerformanceTest extends TestCase
{
    public function testSingleNoteMigrationHandlesLargeDuplicateGroupsWithinLockTimeout(): void
    {
        $pdo = $this->connect();
        $probe = 'scratchpad_migration_' . bin2hex(random_bytes(5));
        $version = '998_' . $probe . '.sql';
        $directory = sys_get_temp_dir() . '/' . $probe;
        $migrationPath = dirname(__DIR__, 2) . '/migrations/049_scratchpad_single_note.sql';
        $backupTable = 'scratchpad_notes_backup_' . bin2hex(random_bytes(5));
        mkdir($directory, 0700, true);

        $renamed = false;

        try {
            $pdo->exec('RENAME TABLE scratchpad_notes TO `' . $backupTable . '`');
            $renamed = true;
            $pdo->exec(
                'CREATE TABLE scratchpad_notes (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    workspace_id BIGINT UNSIGNED NOT NULL,
                    user_id BIGINT UNSIGNED NOT NULL,
                    body TEXT NOT NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    KEY ix_scratchpad_notes_owner (workspace_id, user_id, updated_at, id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
            );

            $insert = $pdo->prepare(
                'INSERT INTO scratchpad_notes (workspace_id, user_id, body, updated_at)
                 VALUES (1, 1, :body, :updated_at)'
            );
            $pdo->beginTransaction();
            for ($index = 0; $index < 20_000; $index++) {
                $insert->execute([
                    'body' => 'Historical note ' . $index,
                    'updated_at' => gmdate('Y-m-d H:i:s', 946684800 + $index),
                ]);
            }
            $pdo->commit();

            $migration = file_get_contents($migrationPath);
            self::assertNotFalse($migration);
            file_put_contents($directory . '/' . $version, $migration);

            $startedAt = hrtime(true);
            (new MigrationRunner($pdo, $directory))->migrate();
            $durationSeconds = (hrtime(true) - $startedAt) / 1_000_000_000;

            self::assertLessThan(
                10,
                $durationSeconds,
                'Deduplicating notes must finish within the runner\'s 30-second lock wait on a single-owner history.',
            );
            self::assertSame(1, (int) $pdo->query('SELECT COUNT(*) FROM scratchpad_notes')->fetchColumn());
            self::assertSame('Historical note 19999', $pdo->query('SELECT body FROM scratchpad_notes')->fetchColumn());
        } finally {
            $delete = $pdo->prepare('DELETE FROM schema_migrations WHERE version = :version');
            $delete->execute(['version' => $version]);
            if ($renamed) {
                $pdo->exec('DROP TABLE IF EXISTS scratchpad_notes');
                $pdo->exec('RENAME TABLE `' . $backupTable . '` TO scratchpad_notes');
            }
            foreach (glob($directory . '/*') ?: [] as $file) {
                @unlink($file);
            }
            @rmdir($directory);
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
}
