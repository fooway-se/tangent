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

    public function findOrCreateLoungeChannel(int $workspaceId): int
    {
        $existing = $this->pdo->prepare(
            "SELECT id FROM channels
             WHERE workspace_id = :workspace_id AND channel_type = 'standalone' AND name = 'Lounge'
             ORDER BY id ASC LIMIT 1"
        );
        $existing->execute(['workspace_id' => $workspaceId]);
        $channelId = $existing->fetchColumn();
        if ($channelId !== false) return (int) $channelId;

        $statement = $this->pdo->prepare(
            "INSERT INTO channels (workspace_id, project_id, channel_type, name)
             VALUES (:workspace_id, NULL, 'standalone', 'Lounge')
             ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)"
        );
        $statement->execute(['workspace_id' => $workspaceId]);
        return (int) $this->pdo->lastInsertId();
    }

    public function listLoungeMembers(int $workspaceId): array
    {
        $statement = $this->pdo->prepare(
            "SELECT users.id, users.name, user_accounts.email
             FROM users
             INNER JOIN user_accounts ON user_accounts.id = users.account_id
             WHERE users.workspace_id = :workspace_id AND users.is_active = 1
               AND users.role IN ('admin', 'developer')
             ORDER BY users.name, users.id"
        );
        $statement->execute(['workspace_id' => $workspaceId]);
        return array_map(static function (array $member): array {
            $member['id'] = (int) $member['id'];
            return $member;
        }, $statement->fetchAll(PDO::FETCH_ASSOC));
    }

    public function heartbeatLoungePresence(int $workspaceId, int $userId): array
    {
        $prune = $this->pdo->prepare(
            'DELETE FROM lounge_presence
             WHERE workspace_id = :workspace_id
               AND last_seen_at < UTC_TIMESTAMP() - INTERVAL 1 DAY'
        );
        $prune->execute(['workspace_id' => $workspaceId]);

        $heartbeat = $this->pdo->prepare(
            'INSERT INTO lounge_presence (workspace_id, user_id, last_seen_at)
             VALUES (:workspace_id, :user_id, UTC_TIMESTAMP())
             ON DUPLICATE KEY UPDATE last_seen_at = UTC_TIMESTAMP()'
        );
        $heartbeat->execute([
            'workspace_id' => $workspaceId,
            'user_id' => $userId,
        ]);

        return $this->listActiveLoungePresence($workspaceId);
    }

    public function listActiveLoungePresence(int $workspaceId): array
    {
        $activeMembers = $this->pdo->prepare(
            "SELECT users.id, users.name
             FROM lounge_presence
             INNER JOIN users ON users.workspace_id = lounge_presence.workspace_id
                            AND users.id = lounge_presence.user_id
             WHERE lounge_presence.workspace_id = :workspace_id
               AND lounge_presence.last_seen_at >= UTC_TIMESTAMP() - INTERVAL 45 SECOND
               AND users.is_active = 1
               AND users.role IN ('admin', 'developer')
             ORDER BY users.name, users.id"
        );
        $activeMembers->execute(['workspace_id' => $workspaceId]);
        return array_map(static function (array $member): array {
            $member['id'] = (int) $member['id'];
            return $member;
        }, $activeMembers->fetchAll(PDO::FETCH_ASSOC));
    }

    public function heartbeatProjectPresence(int $workspaceId, int $projectId, int $userId): bool
    {
        $prune = $this->pdo->prepare(
            'DELETE FROM project_presence
             WHERE workspace_id = :workspace_id AND project_id = :project_id
               AND last_seen_at < UTC_TIMESTAMP() - INTERVAL 1 DAY'
        );
        $prune->execute(['workspace_id' => $workspaceId, 'project_id' => $projectId]);

        $heartbeat = $this->pdo->prepare(
            'INSERT INTO project_presence (workspace_id, project_id, user_id, last_seen_at)
             VALUES (:workspace_id, :project_id, :user_id, UTC_TIMESTAMP())
             ON DUPLICATE KEY UPDATE last_seen_at = UTC_TIMESTAMP()'
        );
        $heartbeat->execute([
            'workspace_id' => $workspaceId,
            'project_id' => $projectId,
            'user_id' => $userId,
        ]);

        $otherViewer = $this->pdo->prepare(
            'SELECT EXISTS (
                SELECT 1 FROM project_presence
                WHERE workspace_id = :workspace_id AND project_id = :project_id
                  AND user_id <> :user_id
                  AND last_seen_at >= UTC_TIMESTAMP() - INTERVAL 45 SECOND
             )'
        );
        $otherViewer->execute([
            'workspace_id' => $workspaceId,
            'project_id' => $projectId,
            'user_id' => $userId,
        ]);
        return (bool) $otherViewer->fetchColumn();
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

    public function nextEventCursor(int $workspaceId): int
    {
        if (!$this->pdo->inTransaction()) {
            throw new \LogicException('A chat event cursor must be allocated in the message transaction.');
        }

        $ensureSequence = $this->pdo->prepare(
            'INSERT INTO chat_event_sequences (workspace_id, last_cursor) VALUES (:workspace_id, 0)
             ON DUPLICATE KEY UPDATE last_cursor = chat_event_sequences.last_cursor'
        );
        $ensureSequence->execute(['workspace_id' => $workspaceId]);

        $lock = $this->pdo->prepare(
            'SELECT last_cursor FROM chat_event_sequences WHERE workspace_id = :workspace_id FOR UPDATE'
        );
        $lock->execute(['workspace_id' => $workspaceId]);
        $cursor = (int) $lock->fetchColumn() + 1;

        $update = $this->pdo->prepare(
            'UPDATE chat_event_sequences SET last_cursor = :last_cursor WHERE workspace_id = :workspace_id'
        );
        $update->execute(['last_cursor' => $cursor, 'workspace_id' => $workspaceId]);

        return $cursor;
    }

    public function eventCursorAtMessageId(int $workspaceId, array $projectIds, int $messageId): int
    {
        if ($messageId <= 0 || $projectIds === []) return 0;
        [$projectFilter, $projectParameters] = self::projectFilter($projectIds);
        $statement = $this->pdo->prepare(
            'SELECT COALESCE(MAX(m.feed_cursor), 0)
             FROM messages m
             INNER JOIN channels c ON c.workspace_id = m.workspace_id AND c.id = m.channel_id
             WHERE m.workspace_id = :workspace_id AND c.channel_type = :channel_type
               AND c.project_id IN (' . $projectFilter . ')
               AND m.feed_cursor IS NOT NULL AND m.id <= :message_id'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'channel_type' => 'project',
            'message_id' => $messageId,
            ...$projectParameters,
        ]);
        return (int) $statement->fetchColumn();
    }

    public function latestEventCursor(int $workspaceId, array $projectIds): int
    {
        if ($projectIds === []) {
            return 0;
        }
        [$projectFilter, $projectParameters] = self::projectFilter($projectIds);
        $statement = $this->pdo->prepare(
            'SELECT COALESCE(MAX(m.feed_cursor), 0)
             FROM messages m FORCE INDEX (ix_messages_workspace_feed_cursor)
             INNER JOIN channels c ON c.workspace_id = m.workspace_id AND c.id = m.channel_id
             WHERE m.workspace_id = :workspace_id AND c.channel_type = :channel_type
               AND c.project_id IN (' . $projectFilter . ') AND m.feed_cursor IS NOT NULL'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'channel_type' => 'project',
            ...$projectParameters,
        ]);
        return (int) $statement->fetchColumn();
    }

    public function listEvents(int $workspaceId, array $projectIds, int $sinceCursor): array
    {
        if ($projectIds === []) {
            return [];
        }
        [$projectFilter, $projectParameters] = self::projectFilter($projectIds);
        $statement = $this->pdo->prepare(
            'WITH RECURSIVE event_messages AS (
                SELECT m.id, m.feed_cursor, c.project_id, m.channel_id, m.parent_id, m.author_id, m.body,
                       m.is_client_visible AS message_client_visible, m.created_at
                FROM messages m FORCE INDEX (ix_messages_workspace_feed_cursor)
                STRAIGHT_JOIN channels c ON c.workspace_id = m.workspace_id AND c.id = m.channel_id
                WHERE m.workspace_id = :workspace_id AND c.channel_type = :channel_type
                  AND c.project_id IN (' . $projectFilter . ')
                  AND m.feed_cursor IS NOT NULL AND m.feed_cursor > :since_cursor
                ORDER BY m.feed_cursor ASC
                LIMIT 100
            ), reply_stats AS (
                SELECT replies.channel_id, replies.parent_id, COUNT(*) AS reply_count,
                       MIN(replies.id) AS first_reply_id
                FROM event_messages parents
                INNER JOIN messages replies
                  ON replies.workspace_id = :reply_stats_workspace_id
                 AND replies.channel_id = parents.channel_id AND replies.parent_id = parents.id
                GROUP BY replies.channel_id, replies.parent_id
            ), message_roots AS (
                SELECT messages.id AS event_id, messages.channel_id, messages.parent_id,
                       messages.message_client_visible AS ancestor_client_visible
                FROM event_messages messages
                UNION ALL
                SELECT roots.event_id, roots.channel_id, parent.parent_id, parent.is_client_visible
                FROM message_roots roots
                INNER JOIN messages parent
                  ON parent.workspace_id = :root_workspace_id
                 AND parent.channel_id = roots.channel_id AND parent.id = roots.parent_id
                WHERE roots.parent_id IS NOT NULL
            )
            SELECT messages.id, messages.feed_cursor, messages.project_id, messages.channel_id, messages.parent_id, messages.author_id,
                   users.name AS author_name, users.role AS author_role, messages.body,
                   parent_users.name AS parent_author_name, parent_message.body AS parent_body,
                   COALESCE(reply_stats.reply_count, 0) AS reply_count, reply_stats.first_reply_id,
                   (messages.message_client_visible OR roots.ancestor_client_visible) AS is_client_visible,
                   messages.created_at
            FROM event_messages messages
            INNER JOIN message_roots roots ON roots.event_id = messages.id AND roots.parent_id IS NULL
            LEFT JOIN reply_stats
              ON reply_stats.channel_id = messages.channel_id AND reply_stats.parent_id = messages.id
            INNER JOIN users ON users.workspace_id = :author_workspace_id AND users.id = messages.author_id
            LEFT JOIN messages parent_message
              ON parent_message.workspace_id = :parent_workspace_id
             AND parent_message.channel_id = messages.channel_id AND parent_message.id = messages.parent_id
            LEFT JOIN users parent_users
              ON parent_users.workspace_id = :parent_author_workspace_id AND parent_users.id = parent_message.author_id
            ORDER BY messages.feed_cursor ASC'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'channel_type' => 'project',
            'since_cursor' => $sinceCursor,
            'reply_stats_workspace_id' => $workspaceId,
            'root_workspace_id' => $workspaceId,
            'author_workspace_id' => $workspaceId,
            'parent_workspace_id' => $workspaceId,
            'parent_author_workspace_id' => $workspaceId,
            ...$projectParameters,
        ]);
        return array_map(static function (array $event): array {
            $event = self::normalize($event);
            $event['project_id'] = (int) $event['project_id'];
            $event['type'] = 'message';
            return $event;
        }, $statement->fetchAll(PDO::FETCH_ASSOC));
    }

    public function listMessages(int $workspaceId, int $channelId, ?int $sinceId): array
    {
        $selectedMessages = $sinceId === null
            ? 'SELECT m.id, m.channel_id, m.parent_id, m.author_id, m.body, m.is_client_visible AS message_client_visible, m.created_at
               FROM messages m
               WHERE m.workspace_id = :selected_workspace_id AND m.channel_id = :selected_channel_id
               ORDER BY m.id DESC LIMIT 100'
            : 'SELECT m.id, m.channel_id, m.parent_id, m.author_id, m.body, m.is_client_visible AS message_client_visible, m.created_at
               FROM messages m
               WHERE m.workspace_id = :selected_workspace_id AND m.channel_id = :selected_channel_id
                 AND m.id > :since_id
               ORDER BY m.id ASC LIMIT 100';
        $statement = $this->pdo->prepare(
            'WITH RECURSIVE selected_messages AS (' . $selectedMessages . '
            ), reply_stats AS (
                SELECT replies.channel_id, replies.parent_id, COUNT(*) AS reply_count,
                       MIN(replies.id) AS first_reply_id
                FROM selected_messages parents
                INNER JOIN messages replies
                  ON replies.workspace_id = :reply_stats_workspace_id
                 AND replies.channel_id = parents.channel_id AND replies.parent_id = parents.id
                GROUP BY replies.channel_id, replies.parent_id
            ), message_roots AS (
                SELECT messages.id AS event_id, messages.channel_id, messages.parent_id,
                       messages.message_client_visible AS ancestor_client_visible
                FROM selected_messages messages
                UNION ALL
                SELECT roots.event_id, roots.channel_id, parent.parent_id, parent.is_client_visible
                FROM message_roots roots
                INNER JOIN messages parent
                  ON parent.workspace_id = :root_workspace_id
                 AND parent.channel_id = roots.channel_id AND parent.id = roots.parent_id
                WHERE roots.parent_id IS NOT NULL
            )
            SELECT messages.id, messages.channel_id, messages.parent_id, messages.author_id,
                   users.name AS author_name, users.role AS author_role, messages.body,
                   parent_users.name AS parent_author_name, parent_message.body AS parent_body,
                   COALESCE(reply_stats.reply_count, 0) AS reply_count, reply_stats.first_reply_id,
                   (messages.message_client_visible OR roots.ancestor_client_visible) AS is_client_visible,
                   messages.created_at
            FROM selected_messages messages
            INNER JOIN message_roots roots ON roots.event_id = messages.id AND roots.parent_id IS NULL
            LEFT JOIN reply_stats
              ON reply_stats.channel_id = messages.channel_id AND reply_stats.parent_id = messages.id
            INNER JOIN users ON users.workspace_id = :author_workspace_id AND users.id = messages.author_id
            LEFT JOIN messages parent_message
              ON parent_message.workspace_id = :parent_workspace_id
             AND parent_message.channel_id = messages.channel_id AND parent_message.id = messages.parent_id
            LEFT JOIN users parent_users
              ON parent_users.workspace_id = :parent_author_workspace_id AND parent_users.id = parent_message.author_id
            ORDER BY messages.id ASC'
        );
        $parameters = [
            'selected_workspace_id' => $workspaceId,
            'selected_channel_id' => $channelId,
            'reply_stats_workspace_id' => $workspaceId,
            'root_workspace_id' => $workspaceId,
            'author_workspace_id' => $workspaceId,
            'parent_workspace_id' => $workspaceId,
            'parent_author_workspace_id' => $workspaceId,
        ];
        if ($sinceId !== null) $parameters['since_id'] = $sinceId;
        $statement->execute($parameters);
        return array_map(self::normalize(...), $statement->fetchAll(PDO::FETCH_ASSOC));
    }

    public function listClientConversationMessages(int $workspaceId, int $channelId): array
    {
        $statement = $this->pdo->prepare(
            'WITH latest_messages AS (
                SELECT m.id, m.parent_id, m.author_id, m.body, m.created_at
                FROM messages m
                WHERE m.workspace_id = :workspace_id AND m.channel_id = :channel_id
                  AND m.is_client_visible = 1
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
            'author_workspace_id' => $workspaceId,
        ]);

        return array_map(static function (array $message): array {
            $message['id'] = (int) $message['id'];
            $message['parent_id'] = $message['parent_id'] === null ? null : (int) $message['parent_id'];
            $message['author_id'] = (int) $message['author_id'];
            return $message;
        }, $statement->fetchAll(PDO::FETCH_ASSOC));
    }

    public function getMessage(int $workspaceId, int $channelId, int $messageId): ?array
    {
        return $this->findMessage($workspaceId, $channelId, $messageId);
    }

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

    public function threadRoot(int $workspaceId, int $channelId, int $messageId): ?array
    {
        $statement = $this->pdo->prepare(
            'WITH RECURSIVE thread_ancestors (id, parent_id, is_client_visible) AS (
                SELECT id, parent_id, is_client_visible FROM messages
                WHERE workspace_id = :workspace_id AND channel_id = :channel_id AND id = :message_id
                UNION ALL
                SELECT parent.id, parent.parent_id, parent.is_client_visible FROM messages parent
                INNER JOIN thread_ancestors child ON parent.id = child.parent_id
                WHERE parent.workspace_id = :parent_workspace_id AND parent.channel_id = :parent_channel_id
            )
            SELECT id, is_client_visible FROM thread_ancestors
            WHERE parent_id IS NULL
            LIMIT 1'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'channel_id' => $channelId,
            'message_id' => $messageId,
            'parent_workspace_id' => $workspaceId,
            'parent_channel_id' => $channelId,
        ]);
        $root = $statement->fetch(PDO::FETCH_ASSOC);
        if ($root === false) {
            return null;
        }
        return [
            'id' => (int) $root['id'],
            'is_client_visible' => (bool) $root['is_client_visible'],
        ];
    }

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

    public function createMessage(
        int $workspaceId,
        int $channelId,
        int $authorId,
        ?int $parentId,
        string $body,
        bool $clientVisible = false,
        ?int $feedCursor = null,
    ): array {
        $statement = $this->pdo->prepare(
            'INSERT INTO messages (workspace_id, channel_id, author_id, parent_id, body, is_client_visible, feed_cursor)
             VALUES (:workspace_id, :channel_id, :author_id, :parent_id, :body, :is_client_visible, :feed_cursor)'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'channel_id' => $channelId,
            'author_id' => $authorId,
            'parent_id' => $parentId,
            'body' => $body,
            'is_client_visible' => $clientVisible ? 1 : 0,
            'feed_cursor' => $feedCursor,
        ]);

        $message = $this->findMessage($workspaceId, $channelId, (int) $this->pdo->lastInsertId());
        return $message ?? [];
    }

    private function findMessage(int $workspaceId, int $channelId, int $messageId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT m.id, m.channel_id, m.parent_id, m.author_id, m.feed_cursor, u.name AS author_name, u.role AS author_role,
                    m.body, m.is_client_visible, m.created_at,
                    parent_user.name AS parent_author_name, parent.body AS parent_body,
                    (SELECT COUNT(*) FROM messages replies
                     WHERE replies.workspace_id = m.workspace_id
                       AND replies.channel_id = m.channel_id AND replies.parent_id = m.id) AS reply_count,
                    (SELECT MIN(replies.id) FROM messages replies
                     WHERE replies.workspace_id = m.workspace_id
                       AND replies.channel_id = m.channel_id AND replies.parent_id = m.id) AS first_reply_id
             FROM messages m
             INNER JOIN users u ON u.workspace_id = m.workspace_id AND u.id = m.author_id
             LEFT JOIN messages parent
               ON parent.workspace_id = :parent_workspace_id
              AND parent.channel_id = m.channel_id AND parent.id = m.parent_id
             LEFT JOIN users parent_user
               ON parent_user.workspace_id = :parent_author_workspace_id AND parent_user.id = parent.author_id
             WHERE m.workspace_id = :workspace_id AND m.channel_id = :channel_id AND m.id = :id
             LIMIT 1'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'channel_id' => $channelId,
            'id' => $messageId,
            'parent_workspace_id' => $workspaceId,
            'parent_author_workspace_id' => $workspaceId,
        ]);
        $message = $statement->fetch(PDO::FETCH_ASSOC);
        return $message === false ? null : self::normalize($message);
    }

    private static function normalize(array $message): array
    {
        $message['id'] = (int) $message['id'];
        $message['channel_id'] = (int) $message['channel_id'];
        $message['author_id'] = (int) $message['author_id'];
        $message['is_client_visible'] = (bool) ($message['is_client_visible'] ?? false);
        $message['parent_id'] = $message['parent_id'] === null ? null : (int) $message['parent_id'];
        $message['parent_author_name'] = $message['parent_author_name'] ?? null;
        $message['parent_body'] = $message['parent_body'] ?? null;
        $message['reply_count'] = (int) ($message['reply_count'] ?? 0);
        $message['first_reply_id'] = $message['first_reply_id'] === null ? null : (int) $message['first_reply_id'];
        if (array_key_exists('feed_cursor', $message)) {
            $message['feed_cursor'] = $message['feed_cursor'] === null ? null : (int) $message['feed_cursor'];
        }
        return $message;
    }

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
