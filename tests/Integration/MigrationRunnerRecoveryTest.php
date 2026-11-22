<?php

declare(strict_types=1);

namespace Tangent\Tests\Integration;

use PDO;
use Tangent\Core\Database;
use Tangent\Core\MigrationRunner;
use PHPUnit\Framework\TestCase;

final class MigrationRunnerRecoveryTest extends TestCase
{
    public function testRetryReconcilesExistingDdlAndContinuesMissingSteps(): void
    {
        $pdo = $this->connect();
        $probe = 'migration_recovery_' . bin2hex(random_bytes(5));
        $parent = $probe . '_parent';
        $child = $probe . '_child';
        $directory = sys_get_temp_dir() . '/' . $probe;
        $partialVersion = '009_' . $probe . '.sql';
        $appliedVersion = '010_' . $probe . '.sql';
        mkdir($directory, 0700, true);

        $pdo->exec("CREATE TABLE `{$parent}` (id BIGINT UNSIGNED NOT NULL PRIMARY KEY) ENGINE=InnoDB");
        $pdo->exec(
            "CREATE TABLE `{$child}` (
                id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
                parent_id BIGINT UNSIGNED NULL,
                second_parent_id BIGINT UNSIGNED NULL
            ) ENGINE=InnoDB",
        );
        $pdo->exec("ALTER TABLE `{$child}` ADD COLUMN recovered_value INT NULL");
        $pdo->exec("ALTER TABLE `{$child}` ADD KEY ix_{$probe}_recovered (recovered_value)");
        $pdo->exec(
            "ALTER TABLE `{$child}` ADD CONSTRAINT fk_{$probe}_existing
             FOREIGN KEY (parent_id) REFERENCES `{$parent}` (id)",
        );

        file_put_contents(
            $directory . '/' . $partialVersion,
            "ALTER TABLE `{$child}` ADD COLUMN recovered_value INT NULL;\n"
                . "ALTER TABLE `{$child}` ADD KEY ix_{$probe}_recovered (recovered_value);\n"
                . "ALTER TABLE `{$child}` ADD CONSTRAINT fk_{$probe}_existing FOREIGN KEY (parent_id) REFERENCES `{$parent}` (id);\n"
                . "ALTER TABLE `{$child}` ADD COLUMN completed_value INT NULL;\n"
                . "ALTER TABLE `{$child}` ADD KEY ix_{$probe}_completed (completed_value);\n"
                . "ALTER TABLE `{$child}` ADD CONSTRAINT fk_{$probe}_completed FOREIGN KEY (second_parent_id) REFERENCES `{$parent}` (id);\n",
        );
        file_put_contents($directory . '/' . $appliedVersion, 'THIS IS NOT VALID SQL;');
        $recordApplied = $pdo->prepare('INSERT INTO schema_migrations (version) VALUES (:version)');
        $recordApplied->execute(['version' => $appliedVersion]);

        try {
            (new MigrationRunner($pdo, $directory))->migrate();

            self::assertTrue($this->columnExists($pdo, $child, 'recovered_value'));
            self::assertTrue($this->columnExists($pdo, $child, 'completed_value'));
            self::assertTrue($this->indexExists($pdo, $child, 'ix_' . $probe . '_recovered'));
            self::assertTrue($this->indexExists($pdo, $child, 'ix_' . $probe . '_completed'));
            self::assertTrue($this->constraintExists($pdo, $child, 'fk_' . $probe . '_existing'));
            self::assertTrue($this->constraintExists($pdo, $child, 'fk_' . $probe . '_completed'));
            self::assertSame(1, $this->migrationCount($pdo, $partialVersion));
            self::assertSame(1, $this->migrationCount($pdo, $appliedVersion));
        } finally {
            $pdo->exec("DROP TABLE IF EXISTS `{$child}`");
            $pdo->exec("DROP TABLE IF EXISTS `{$parent}`");
            $delete = $pdo->prepare('DELETE FROM schema_migrations WHERE version IN (:partial, :applied)');
            $delete->execute(['partial' => $partialVersion, 'applied' => $appliedVersion]);
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

    private function columnExists(PDO $pdo, string $table, string $column): bool
    {
        $statement = $pdo->prepare(
            'SELECT 1 FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column',
        );
        $statement->execute(['table' => $table, 'column' => $column]);

        return $statement->fetchColumn() !== false;
    }

    private function indexExists(PDO $pdo, string $table, string $index): bool
    {
        $statement = $pdo->prepare(
            'SELECT 1 FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND INDEX_NAME = :index',
        );
        $statement->execute(['table' => $table, 'index' => $index]);

        return $statement->fetchColumn() !== false;
    }

    private function constraintExists(PDO $pdo, string $table, string $constraint): bool
    {
        $statement = $pdo->prepare(
            'SELECT 1 FROM information_schema.TABLE_CONSTRAINTS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND CONSTRAINT_NAME = :constraint',
        );
        $statement->execute(['table' => $table, 'constraint' => $constraint]);

        return $statement->fetchColumn() !== false;
    }

    private function migrationCount(PDO $pdo, string $version): int
    {
        $statement = $pdo->prepare('SELECT COUNT(*) FROM schema_migrations WHERE version = :version');
        $statement->execute(['version' => $version]);

        return (int) $statement->fetchColumn();
    }
}
