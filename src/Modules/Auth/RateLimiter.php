<?php

declare(strict_types=1);

namespace Tangent\Modules\Auth;

use PDO;

final class RateLimiter
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function allow(int $workspaceId, string $bucket, int $limit, int $windowSeconds): bool
    {
        $bucketHash = hash('sha256', $bucket);
        $cutoff = gmdate('Y-m-d H:i:s', time() - $windowSeconds);
        $retentionSeconds = max(86_400, $windowSeconds);
        $expiredBefore = gmdate('Y-m-d H:i:s', time() - $retentionSeconds);
        $cleanup = $this->pdo->prepare(
            'DELETE FROM rate_limits
             WHERE workspace_id = :workspace_id AND window_started_at < :expired_before'
        );
        $cleanup->execute(['workspace_id' => $workspaceId, 'expired_before' => $expiredBefore]);

        $statement = $this->pdo->prepare(
            'INSERT INTO rate_limits (workspace_id, bucket_key, window_started_at, attempt_count)
             VALUES (:workspace_id, :bucket_key, UTC_TIMESTAMP(), 1)
             ON DUPLICATE KEY UPDATE
                 attempt_count = IF(window_started_at <= :cutoff_for_count, 1, attempt_count + 1),
                 window_started_at = IF(window_started_at <= :cutoff_for_start, UTC_TIMESTAMP(), window_started_at)'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'bucket_key' => $bucketHash,
            'cutoff_for_count' => $cutoff,
            'cutoff_for_start' => $cutoff,
        ]);

        $count = $this->pdo->prepare(
            'SELECT attempt_count FROM rate_limits
             WHERE workspace_id = :workspace_id AND bucket_key = :bucket_key'
        );
        $count->execute(['workspace_id' => $workspaceId, 'bucket_key' => $bucketHash]);
        return (int) $count->fetchColumn() <= $limit;
    }
}
