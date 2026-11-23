<?php

declare(strict_types=1);

namespace Tangent\Core;

use PDO;
use Throwable;

final class WorkspaceRealtimeFeed
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function notifyWorkspace(int $workspaceId): int
    {
        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) $this->pdo->beginTransaction();
        try {
            $ensure = $this->pdo->prepare(
                'INSERT INTO workspace_realtime_cursors (workspace_id, last_cursor)
                 VALUES (:workspace_id, 0)
                 ON DUPLICATE KEY UPDATE last_cursor = workspace_realtime_cursors.last_cursor'
            );
            $ensure->execute(['workspace_id' => $workspaceId]);

            $lock = $this->pdo->prepare(
                'SELECT last_cursor FROM workspace_realtime_cursors WHERE workspace_id = :workspace_id FOR UPDATE'
            );
            $lock->execute(['workspace_id' => $workspaceId]);
            $cursor = (int) $lock->fetchColumn() + 1;

            $update = $this->pdo->prepare(
                'UPDATE workspace_realtime_cursors SET last_cursor = :last_cursor WHERE workspace_id = :workspace_id'
            );
            $update->execute(['last_cursor' => $cursor, 'workspace_id' => $workspaceId]);
            if ($ownsTransaction) $this->pdo->commit();
            return $cursor;
        } catch (Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        }
    }

    public function currentCursor(int $workspaceId): int
    {
        $statement = $this->pdo->prepare(
            'SELECT last_cursor FROM workspace_realtime_cursors WHERE workspace_id = :workspace_id'
        );
        $statement->execute(['workspace_id' => $workspaceId]);
        return (int) ($statement->fetchColumn() ?: 0);
    }

    public function acquireStreamLease(int $workspaceId, int $userId, int $maxConnections): ?string
    {
        if ($maxConnections < 1) return null;

        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) $this->pdo->beginTransaction();
        try {
            $this->pdo->exec('INSERT IGNORE INTO workspace_realtime_stream_mutex (id) VALUES (1)');
            $lock = $this->pdo->query(
                'SELECT id FROM workspace_realtime_stream_mutex WHERE id = 1 FOR UPDATE'
            );
            $lock->fetchColumn();

            $this->pdo->exec(
                'DELETE FROM workspace_realtime_stream_leases WHERE expires_at <= CURRENT_TIMESTAMP'
            );
            $existing = $this->pdo->prepare(
                'SELECT lease_id FROM workspace_realtime_stream_leases
                 WHERE workspace_id = :workspace_id AND user_id = :user_id
                   AND expires_at > CURRENT_TIMESTAMP LIMIT 1'
            );
            $existing->execute(['workspace_id' => $workspaceId, 'user_id' => $userId]);
            $hasUserLease = $existing->fetchColumn() !== false;

            $count = (int) $this->pdo->query(
                'SELECT COUNT(*) FROM workspace_realtime_stream_leases WHERE expires_at > CURRENT_TIMESTAMP'
            )->fetchColumn();
            $leaseId = null;
            if (!$hasUserLease && $count < $maxConnections) {
                $leaseId = bin2hex(random_bytes(16));
                $insert = $this->pdo->prepare(
                    'INSERT INTO workspace_realtime_stream_leases
                        (lease_id, workspace_id, user_id, expires_at)
                     VALUES (:lease_id, :workspace_id, :user_id, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 45 SECOND))'
                );
                $insert->execute([
                    'lease_id' => $leaseId,
                    'workspace_id' => $workspaceId,
                    'user_id' => $userId,
                ]);
            }

            if ($ownsTransaction) $this->pdo->commit();
            return $leaseId;
        } catch (Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        }
    }

    public function releaseStreamLease(string $leaseId): void
    {
        $statement = $this->pdo->prepare(
            'DELETE FROM workspace_realtime_stream_leases WHERE lease_id = :lease_id'
        );
        $statement->execute(['lease_id' => $leaseId]);
    }

    public function stream(int $workspaceId, ?int $lastEventId): void
    {
        if (function_exists('set_time_limit')) @set_time_limit(25);
        if (function_exists('ob_implicit_flush')) ob_implicit_flush(true);
        while (ob_get_level() > 0) ob_end_flush();

        $cursor = $lastEventId ?? $this->currentCursor($workspaceId);
        self::writeFrame("event: ready\nid: {$cursor}\ndata: {}\n\n");
        $deadline = microtime(true) + 20;
        $lastHeartbeat = microtime(true);

        while (microtime(true) < $deadline && !connection_aborted()) {
            $latestCursor = $this->currentCursor($workspaceId);
            if ($latestCursor > $cursor) {
                $cursor = $latestCursor;
                self::writeFrame(
                    'id: ' . $cursor . "\nevent: refresh\ndata: "
                    . json_encode(['cursor' => $cursor], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . "\n\n"
                );
                $lastHeartbeat = microtime(true);
            } elseif (microtime(true) - $lastHeartbeat >= 10) {
                self::writeFrame("event: heartbeat\ndata: {}\n\n");
                $lastHeartbeat = microtime(true);
            }
            usleep(1_000_000);
        }
    }

    private static function writeFrame(string $frame): void
    {
        echo $frame;
        if (function_exists('flush')) flush();
    }
}
