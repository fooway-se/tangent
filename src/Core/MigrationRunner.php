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
                $this->pdo->exec($statement);
            }

            $record = $this->pdo->prepare('INSERT INTO schema_migrations (version) VALUES (:version)');
            $record->execute(['version' => $version]);
        }
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
