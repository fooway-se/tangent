<?php

declare(strict_types=1);

namespace Tangent\Modules\Issues;

use PDO;

final class IssueDiscussionRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function listForIssue(int $workspaceId, int $issueId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT messages.id, messages.issue_id, messages.parent_id, messages.author_id,
                    users.name AS author_name, messages.body,
                    parent_users.name AS parent_author_name, parent.body AS parent_body,
                    messages.created_at
             FROM issue_discussion_messages messages
             INNER JOIN users ON users.workspace_id = messages.workspace_id AND users.id = messages.author_id
             LEFT JOIN issue_discussion_messages parent
               ON parent.workspace_id = messages.workspace_id
              AND parent.issue_id = messages.issue_id AND parent.id = messages.parent_id
             LEFT JOIN users parent_users
               ON parent_users.workspace_id = parent.workspace_id AND parent_users.id = parent.author_id
             WHERE messages.workspace_id = :workspace_id AND messages.issue_id = :issue_id
             ORDER BY messages.id ASC'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'issue_id' => $issueId]);
        return array_map(self::normalize(...), $statement->fetchAll(PDO::FETCH_ASSOC));
    }

    public function find(int $workspaceId, int $issueId, int $messageId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT messages.id, messages.issue_id, messages.parent_id, messages.author_id,
                    users.name AS author_name, messages.body,
                    parent_users.name AS parent_author_name, parent.body AS parent_body,
                    messages.created_at
             FROM issue_discussion_messages messages
             INNER JOIN users ON users.workspace_id = messages.workspace_id AND users.id = messages.author_id
             LEFT JOIN issue_discussion_messages parent
               ON parent.workspace_id = messages.workspace_id
              AND parent.issue_id = messages.issue_id AND parent.id = messages.parent_id
             LEFT JOIN users parent_users
               ON parent_users.workspace_id = parent.workspace_id AND parent_users.id = parent.author_id
             WHERE messages.workspace_id = :workspace_id AND messages.issue_id = :issue_id AND messages.id = :id
             LIMIT 1'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'issue_id' => $issueId, 'id' => $messageId]);
        $message = $statement->fetch(PDO::FETCH_ASSOC);
        return $message === false ? null : self::normalize($message);
    }

    public function create(
        int $workspaceId,
        int $issueId,
        int $authorId,
        ?int $parentId,
        string $body,
    ): array {
        $statement = $this->pdo->prepare(
            'INSERT INTO issue_discussion_messages (workspace_id, issue_id, author_id, parent_id, body)
             VALUES (:workspace_id, :issue_id, :author_id, :parent_id, :body)'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'issue_id' => $issueId,
            'author_id' => $authorId,
            'parent_id' => $parentId,
            'body' => $body,
        ]);

        return $this->find($workspaceId, $issueId, (int) $this->pdo->lastInsertId()) ?? [];
    }

    private static function normalize(array $message): array
    {
        foreach (['id', 'issue_id', 'author_id'] as $field) {
            if (array_key_exists($field, $message)) $message[$field] = (int) $message[$field];
        }
        if (array_key_exists('parent_id', $message)) {
            $message['parent_id'] = $message['parent_id'] === null ? null : (int) $message['parent_id'];
        }
        return $message;
    }
}
