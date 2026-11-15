<?php

declare(strict_types=1);

namespace Tangent\Modules\Chat;

use PDO;

final class ChatRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function createProjectChannel(int $workspaceId, int $projectId): int
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO channels (workspace_id, project_id, channel_type)
             VALUES (:workspace_id, :project_id, :channel_type)'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'project_id' => $projectId,
            'channel_type' => 'project',
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    public function findProjectChannel(int $workspaceId, int $projectId): ?int
    {
        $statement = $this->pdo->prepare(
            'SELECT id FROM channels
             WHERE workspace_id = :workspace_id AND project_id = :project_id AND channel_type = :channel_type
             LIMIT 1'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'project_id' => $projectId,
            'channel_type' => 'project',
        ]);
        $channelId = $statement->fetchColumn();

        return $channelId === false ? null : (int) $channelId;
    }

    public function latestMessageId(int $workspaceId, int $channelId): int
    {
        $statement = $this->pdo->prepare(
            'SELECT COALESCE(MAX(id), 0) FROM messages
             WHERE workspace_id = :workspace_id AND channel_id = :channel_id'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'channel_id' => $channelId]);
        return (int) $statement->fetchColumn();
    }

    /** @param list<int> $projectIds */
    public function latestEventId(int $workspaceId, array $projectIds): int
    {
        if ($projectIds === []) {
            return 0;
        }
        [$projectFilter, $projectParameters] = self::projectFilter($projectIds);
        $statement = $this->pdo->prepare(
            'SELECT COALESCE(MAX(m.id), 0)
             FROM messages m
             INNER JOIN channels c ON c.workspace_id = m.workspace_id AND c.id = m.channel_id
             WHERE m.workspace_id = :workspace_id AND c.channel_type = :channel_type
               AND c.project_id IN (' . $projectFilter . ')'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'channel_type' => 'project',
            ...$projectParameters,
        ]);
        return (int) $statement->fetchColumn();
    }

    /** @param list<int> $projectIds @return list<array<string, mixed>> */
    public function listEvents(int $workspaceId, array $projectIds, int $sinceId): array
    {
        if ($projectIds === []) {
            return [];
        }
        [$projectFilter, $projectParameters] = self::projectFilter($projectIds);
        $statement = $this->pdo->prepare(
            'SELECT m.id, c.project_id, m.channel_id, m.parent_id, m.author_id,
                    u.name AS author_name, m.body, m.created_at
             FROM messages m
             INNER JOIN channels c ON c.workspace_id = m.workspace_id AND c.id = m.channel_id
             INNER JOIN users u ON u.workspace_id = m.workspace_id AND u.id = m.author_id
             WHERE m.workspace_id = :workspace_id AND c.channel_type = :channel_type
               AND c.project_id IN (' . $projectFilter . ') AND m.id > :since_id
             ORDER BY m.id ASC
             LIMIT 100'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'channel_type' => 'project',
            'since_id' => $sinceId,
            ...$projectParameters,
        ]);
        return array_map(static function (array $event): array {
            $event = self::normalize($event);
            $event['project_id'] = (int) $event['project_id'];
            $event['type'] = 'message';
            return $event;
        }, $statement->fetchAll(PDO::FETCH_ASSOC));
    }

    /** @return list<array<string, mixed>> */
    public function listMessages(int $workspaceId, int $channelId, ?int $sinceId): array
    {
        if ($sinceId === null) {
            $statement = $this->pdo->prepare(
                'SELECT m.id, m.channel_id, m.parent_id, m.author_id, u.name AS author_name, m.body, m.created_at
                 FROM messages m
                 INNER JOIN users u ON u.workspace_id = m.workspace_id AND u.id = m.author_id
                 WHERE m.workspace_id = :workspace_id AND m.channel_id = :channel_id
                 ORDER BY m.id DESC
                 LIMIT 100'
            );
            $statement->execute(['workspace_id' => $workspaceId, 'channel_id' => $channelId]);
            return array_map(self::normalize(...), array_reverse($statement->fetchAll(PDO::FETCH_ASSOC)));
        }

        $statement = $this->pdo->prepare(
            'SELECT m.id, m.channel_id, m.parent_id, m.author_id, u.name AS author_name, m.body, m.created_at
             FROM messages m
             INNER JOIN users u ON u.workspace_id = m.workspace_id AND u.id = m.author_id
             WHERE m.workspace_id = :workspace_id AND m.channel_id = :channel_id AND m.id > :since_id
             ORDER BY m.id ASC
             LIMIT 100'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'channel_id' => $channelId,
            'since_id' => $sinceId,
        ]);
        return array_map(self::normalize(...), $statement->fetchAll(PDO::FETCH_ASSOC));
    }

    public function messageExists(int $workspaceId, int $channelId, int $messageId): bool
    {
        $statement = $this->pdo->prepare(
            'SELECT 1 FROM messages
             WHERE workspace_id = :workspace_id AND channel_id = :channel_id AND id = :id
             LIMIT 1'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'channel_id' => $channelId,
            'id' => $messageId,
        ]);
        return $statement->fetchColumn() !== false;
    }

    /** @return array<string, mixed> */
    public function createMessage(
        int $workspaceId,
        int $channelId,
        int $authorId,
        ?int $parentId,
        string $body,
    ): array {
        $statement = $this->pdo->prepare(
            'INSERT INTO messages (workspace_id, channel_id, author_id, parent_id, body)
             VALUES (:workspace_id, :channel_id, :author_id, :parent_id, :body)'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'channel_id' => $channelId,
            'author_id' => $authorId,
            'parent_id' => $parentId,
            'body' => $body,
        ]);

        $message = $this->findMessage($workspaceId, $channelId, (int) $this->pdo->lastInsertId());
        return $message ?? [];
    }

    /** @return array<string, mixed>|null */
    private function findMessage(int $workspaceId, int $channelId, int $messageId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT m.id, m.channel_id, m.parent_id, m.author_id, u.name AS author_name, m.body, m.created_at
             FROM messages m
             INNER JOIN users u ON u.workspace_id = m.workspace_id AND u.id = m.author_id
             WHERE m.workspace_id = :workspace_id AND m.channel_id = :channel_id AND m.id = :id
             LIMIT 1'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'channel_id' => $channelId,
            'id' => $messageId,
        ]);
        $message = $statement->fetch(PDO::FETCH_ASSOC);
        return $message === false ? null : self::normalize($message);
    }

    /** @param array<string, mixed> $message @return array<string, mixed> */
    private static function normalize(array $message): array
    {
        $message['id'] = (int) $message['id'];
        $message['channel_id'] = (int) $message['channel_id'];
        $message['author_id'] = (int) $message['author_id'];
        $message['parent_id'] = $message['parent_id'] === null ? null : (int) $message['parent_id'];
        return $message;
    }

    /** @param list<int> $projectIds @return array{string, array<string, int>} */
    private static function projectFilter(array $projectIds): array
    {
        $placeholders = [];
        $parameters = [];
        foreach (array_values($projectIds) as $index => $projectId) {
            $name = 'project_' . $index;
            $placeholders[] = ':' . $name;
            $parameters[$name] = $projectId;
        }
        return [implode(', ', $placeholders), $parameters];
    }
}
