<?php

declare(strict_types=1);

namespace Tangent\Modules\Scratchpad;

use PDO;

final class ScratchpadRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function readForUser(int $workspaceId, int $userId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT body, updated_at
             FROM scratchpad_notes
             WHERE workspace_id = :workspace_id AND user_id = :user_id
             LIMIT 1'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'user_id' => $userId]);
        $note = $statement->fetch(PDO::FETCH_ASSOC);
        return $note === false ? null : [
            'body' => (string) $note['body'],
            'updated_at' => (string) $note['updated_at'],
        ];
    }

    public function saveForUser(int $workspaceId, int $userId, string $body): array
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO scratchpad_notes (workspace_id, user_id, body)
             VALUES (:workspace_id, :user_id, :insert_body)
             ON DUPLICATE KEY UPDATE body = :update_body, updated_at = CURRENT_TIMESTAMP'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'user_id' => $userId,
            'insert_body' => $body,
            'update_body' => $body,
        ]);
        return $this->readForUser($workspaceId, $userId) ?? ['body' => '', 'updated_at' => null];
    }
}
