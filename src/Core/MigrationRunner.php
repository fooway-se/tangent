<?php

declare(strict_types=1);

namespace Tangent\Core;

use PDO;
use RuntimeException;

final class MigrationRunner
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly string $directory,
    ) {
    }

    public function migrate(): void
    {
        $lockName = $this->lockName();
        $lock = $this->pdo->prepare('SELECT GET_LOCK(:lock_name, 30)');
        $lock->execute(['lock_name' => $lockName]);
        if ((int) $lock->fetchColumn() !== 1) {
            throw new RuntimeException('Unable to acquire the database migration lock.');
        }

        try {
            $this->pdo->exec(
                'CREATE TABLE IF NOT EXISTS schema_migrations (
                    version VARCHAR(190) NOT NULL PRIMARY KEY,
                    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
            );

            $files = glob(rtrim($this->directory, '/') . '/[0-9][0-9][0-9]_*.sql') ?: [];
            sort($files, SORT_STRING);

            $applied = $this->pdo->query('SELECT version FROM schema_migrations')->fetchAll(PDO::FETCH_COLUMN);
            $appliedVersions = array_fill_keys($applied, true);

            foreach ($files as $file) {
                $version = basename($file);
                if (isset($appliedVersions[$version])) {
                    continue;
                }

                $this->assertMigrationPreconditions($version);

                $sql = file_get_contents($file);
                if ($sql === false) {
                    throw new RuntimeException('Unable to read migration: ' . $version);
                }

                foreach ($this->statements($sql) as $statement) {
                    if ($this->isDdlObjectPresent($statement)) {
                        continue;
                    }
                    $this->pdo->exec($statement);
                }

                $record = $this->pdo->prepare('INSERT INTO schema_migrations (version) VALUES (:version)');
                $record->execute(['version' => $version]);
            }
        } finally {
            $release = $this->pdo->prepare('SELECT RELEASE_LOCK(:lock_name)');
            $release->execute(['lock_name' => $lockName]);
            $release->fetchColumn();
        }
    }

    private function lockName(): string
    {
        $database = (string) $this->pdo->query('SELECT DATABASE()')->fetchColumn();

        return 'tangent:migrate:' . substr(hash('sha256', $database), 0, 48);
    }

    private function isDdlObjectPresent(string $statement): bool
    {
        if (preg_match('/^ALTER\s+TABLE\s+`?([a-zA-Z0-9_]+)`?\s+ADD\s+COLUMN\s+`?([a-zA-Z0-9_]+)`?/i', $statement, $matches)) {
            return $this->schemaObjectExists(
                'COLUMNS',
                'TABLE_NAME = :table_name AND COLUMN_NAME = :object_name',
                $matches[1],
                $matches[2],
            );
        }

        if (preg_match('/^ALTER\s+TABLE\s+`?([a-zA-Z0-9_]+)`?\s+ADD\s+(?:UNIQUE\s+)?(?:KEY|INDEX)\s+`?([a-zA-Z0-9_]+)`?/i', $statement, $matches)) {
            return $this->schemaObjectExists(
                'STATISTICS',
                'TABLE_NAME = :table_name AND INDEX_NAME = :object_name',
                $matches[1],
                $matches[2],
            );
        }

        if (preg_match('/^ALTER\s+TABLE\s+`?([a-zA-Z0-9_]+)`?\s+ADD\s+CONSTRAINT\s+`?([a-zA-Z0-9_]+)`?/i', $statement, $matches)) {
            return $this->schemaObjectExists(
                'TABLE_CONSTRAINTS',
                'TABLE_NAME = :table_name AND CONSTRAINT_NAME = :object_name',
                $matches[1],
                $matches[2],
            );
        }

        return false;
    }

    private function schemaObjectExists(
        string $metadataTable,
        string $condition,
        string $tableName,
        string $objectName,
    ): bool {
        $statement = $this->pdo->prepare(
            'SELECT 1 FROM information_schema.' . $metadataTable
                . ' WHERE TABLE_SCHEMA = DATABASE() AND ' . $condition . ' LIMIT 1',
        );
        $statement->execute(['table_name' => $tableName, 'object_name' => $objectName]);

        return $statement->fetchColumn() !== false;
    }

    private function assertMigrationPreconditions(string $version): void
    {
        if ($version !== '011_auth_lifecycle.sql') {
            return;
        }

        $statement = $this->pdo->query(
            'SELECT LOWER(TRIM(email)) AS normalized_email
             FROM users
             GROUP BY LOWER(TRIM(email))
             HAVING COUNT(DISTINCT account_id) > 1
             LIMIT 1'
        );
        if ($statement->fetchColumn() !== false) {
            throw new RuntimeException(
                'Migration 011 stopped: multiple workspace accounts share an email address. '
                . 'Reconcile the legacy accounts before retrying so credentials are not merged implicitly.'
            );
        }
    }

    private function statements(string $sql): array
    {
        $statements = [];
        foreach (explode(';', $sql) as $statement) {
            $statement = trim($statement);
            if ($statement !== '') {
                $statements[] = $statement;
            }
        }

        return $statements;
    }
}
