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
                    u.name AS author_name, m.body, m.is_client_visible, m.created_at
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
                'SELECT m.id, m.channel_id, m.parent_id, m.author_id, u.name AS author_name, m.body, m.is_client_visible, m.created_at
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
            'SELECT m.id, m.channel_id, m.parent_id, m.author_id, u.name AS author_name, m.body, m.is_client_visible, m.created_at
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

    /** @return list<array{id: int, parent_id: ?int, author_id: int, author_name: string, body: string, created_at: string}> */
    public function listClientConversationMessages(int $workspaceId, int $channelId): array
    {
        $statement = $this->pdo->prepare(
            'WITH RECURSIVE client_conversation AS (
                SELECT m.id, m.parent_id, m.author_id, m.body, m.created_at
                FROM messages m
                WHERE m.workspace_id = :workspace_id AND m.channel_id = :channel_id
                  AND m.parent_id IS NULL AND m.is_client_visible = 1
                UNION ALL
                SELECT child.id, child.parent_id, child.author_id, child.body, child.created_at
                FROM messages child
                INNER JOIN client_conversation parent ON child.parent_id = parent.id
                WHERE child.workspace_id = :child_workspace_id AND child.channel_id = :child_channel_id
            ), latest_messages AS (
                SELECT id, parent_id, author_id, body, created_at
                FROM client_conversation
                ORDER BY id DESC
                LIMIT 100
            )
            SELECT messages.id, messages.parent_id, messages.author_id,
                   users.name AS author_name, messages.body, messages.created_at
            FROM latest_messages messages
            INNER JOIN users ON users.workspace_id = :author_workspace_id AND users.id = messages.author_id
            ORDER BY messages.id ASC'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'channel_id' => $channelId,
            'child_workspace_id' => $workspaceId,
            'child_channel_id' => $channelId,
            'author_workspace_id' => $workspaceId,
        ]);

        return array_map(static function (array $message): array {
            $message['id'] = (int) $message['id'];
            $message['parent_id'] = $message['parent_id'] === null ? null : (int) $message['parent_id'];
            $message['author_id'] = (int) $message['author_id'];
            return $message;
        }, $statement->fetchAll(PDO::FETCH_ASSOC));
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

    /** @return array<string, mixed>|null */
    public function getMessage(int $workspaceId, int $channelId, int $messageId): ?array
    {
        return $this->findMessage($workspaceId, $channelId, $messageId);
    }

    /** @return array<string, mixed>|null */
    public function messageContext(int $workspaceId, int $messageId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT m.id, m.channel_id, m.parent_id, m.body, c.project_id, c.channel_type
             FROM messages m
             INNER JOIN channels c ON c.workspace_id = m.workspace_id AND c.id = m.channel_id
             WHERE m.workspace_id = :workspace_id AND m.id = :id
             LIMIT 1'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'id' => $messageId]);
        $message = $statement->fetch(PDO::FETCH_ASSOC);
        if ($message === false) {
            return null;
        }

        $message['id'] = (int) $message['id'];
        $message['channel_id'] = (int) $message['channel_id'];
        $message['parent_id'] = $message['parent_id'] === null ? null : (int) $message['parent_id'];
        $message['project_id'] = $message['project_id'] === null ? null : (int) $message['project_id'];
        return $message;
    }

    public function threadRootId(int $workspaceId, int $channelId, int $messageId): int
    {
        $currentId = $messageId;
        $statement = $this->pdo->prepare(
            'SELECT parent_id FROM messages
             WHERE workspace_id = :workspace_id AND channel_id = :channel_id AND id = :id
             LIMIT 1'
        );

        while (true) {
            $statement->execute([
                'workspace_id' => $workspaceId,
                'channel_id' => $channelId,
                'id' => $currentId,
            ]);
            $parentId = $statement->fetchColumn();
            if ($parentId === false || $parentId === null) {
                return $currentId;
            }
            $currentId = (int) $parentId;
        }
    }

    /** @return list<int> */
    public function threadParticipantIds(int $workspaceId, int $channelId, int $rootMessageId): array
    {
        $statement = $this->pdo->prepare(
            'WITH RECURSIVE thread_messages AS (
                SELECT id, parent_id, author_id FROM messages
                WHERE workspace_id = :workspace_id AND channel_id = :channel_id AND id = :root_id
                UNION ALL
                SELECT child.id, child.parent_id, child.author_id FROM messages child
                INNER JOIN thread_messages parent ON child.parent_id = parent.id
                WHERE child.workspace_id = :child_workspace_id AND child.channel_id = :child_channel_id
             )
             SELECT DISTINCT author_id FROM thread_messages'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'channel_id' => $channelId,
            'root_id' => $rootMessageId,
            'child_workspace_id' => $workspaceId,
            'child_channel_id' => $channelId,
        ]);
        return array_map('intval', $statement->fetchAll(PDO::FETCH_COLUMN));
    }

    /** @return array<string, mixed> */
    public function createMessage(
        int $workspaceId,
        int $channelId,
        int $authorId,
        ?int $parentId,
        string $body,
        bool $clientVisible = false,
    ): array {
        $statement = $this->pdo->prepare(
            'INSERT INTO messages (workspace_id, channel_id, author_id, parent_id, body, is_client_visible)
             VALUES (:workspace_id, :channel_id, :author_id, :parent_id, :body, :is_client_visible)'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'channel_id' => $channelId,
            'author_id' => $authorId,
            'parent_id' => $parentId,
            'body' => $body,
            'is_client_visible' => $clientVisible ? 1 : 0,
        ]);

        $message = $this->findMessage($workspaceId, $channelId, (int) $this->pdo->lastInsertId());
        return $message ?? [];
    }

    /** @return array<string, mixed>|null */
    private function findMessage(int $workspaceId, int $channelId, int $messageId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT m.id, m.channel_id, m.parent_id, m.author_id, u.name AS author_name, m.body, m.is_client_visible, m.created_at
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
        $message['is_client_visible'] = (bool) ($message['is_client_visible'] ?? false);
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
