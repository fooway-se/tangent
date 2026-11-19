<?php

declare(strict_types=1);

namespace Tangent\Modules\Inbox;

use PDO;

final class InboxEventRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function record(
        int $workspaceId,
        array $recipientIds,
        ?int $actorId,
        string $type,
        int $projectId,
        ?int $issueId,
        ?int $messageId,
        string $summary,
        ?string $detail,
    ): void {
        $recipients = array_values(array_filter(
            array_unique(array_map('intval', $recipientIds)),
            static fn (int $recipientId): bool => $recipientId !== $actorId,
        ));
        if ($recipients === []) return;

        $summary = mb_substr($summary, 0, 200, 'UTF-8');
        $detail = $detail === null ? null : mb_substr($detail, 0, 500, 'UTF-8');
        foreach (array_chunk($recipients, 200) as $chunkIndex => $chunk) {
            $rows = [];
            $parameters = [];
            foreach ($chunk as $index => $recipientId) {
                $rowIndex = $chunkIndex * 200 + $index;
                $rows[] = '(:workspace_id_' . $rowIndex . ', :recipient_id_' . $rowIndex . ', :actor_id_' . $rowIndex
                    . ', :event_type_' . $rowIndex . ', :project_id_' . $rowIndex . ', :issue_id_' . $rowIndex
                    . ', :message_id_' . $rowIndex . ', :summary_' . $rowIndex . ', :detail_' . $rowIndex . ')';
                $parameters['workspace_id_' . $rowIndex] = $workspaceId;
                $parameters['recipient_id_' . $rowIndex] = $recipientId;
                $parameters['actor_id_' . $rowIndex] = $actorId;
                $parameters['event_type_' . $rowIndex] = $type;
                $parameters['project_id_' . $rowIndex] = $projectId;
                $parameters['issue_id_' . $rowIndex] = $issueId;
                $parameters['message_id_' . $rowIndex] = $messageId;
                $parameters['summary_' . $rowIndex] = $summary;
                $parameters['detail_' . $rowIndex] = $detail;
            }

            $statement = $this->pdo->prepare(
                'INSERT INTO inbox_events
                    (workspace_id, recipient_id, actor_id, event_type, project_id, issue_id, message_id, summary, detail)
                 VALUES ' . implode(', ', $rows)
            );
            $statement->execute($parameters);
        }
    }

    public function listForUser(int $workspaceId, int $userId, array $projectIds): array
    {
        if ($projectIds === []) return [];
        [$filter, $parameters] = self::idFilter($projectIds, 'project');
        $statement = $this->pdo->prepare(
            'SELECT e.id, e.event_type AS type, COALESCE(actor.name, \'\') AS actor_name,
                    e.summary, e.detail, e.project_id, p.name AS project_name, e.issue_id, e.message_id,
                    e.read_at IS NOT NULL AS `read`, e.done_at IS NOT NULL AS done, e.created_at
             FROM inbox_events e
             INNER JOIN projects p ON p.workspace_id = e.workspace_id AND p.id = e.project_id
             LEFT JOIN users actor ON actor.workspace_id = e.workspace_id AND actor.id = e.actor_id
             WHERE e.workspace_id = :workspace_id AND e.recipient_id = :recipient_id
               AND e.project_id IN (' . $filter . ')
             ORDER BY e.id DESC LIMIT 200'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'recipient_id' => $userId, ...$parameters]);
        return array_map(self::normalize(...), $statement->fetchAll(PDO::FETCH_ASSOC));
    }

    public function updateForUser(int $workspaceId, int $userId, int $eventId, array $changes, array $projectIds): ?array
    {
        if ($projectIds === []) return null;
        [$filter, $parameters] = self::idFilter($projectIds, 'project');
        $sets = [];
        if (array_key_exists('read', $changes)) $sets[] = 'read_at = IF(:read_value = 1, COALESCE(read_at, CURRENT_TIMESTAMP), NULL)';
        if (array_key_exists('done', $changes)) $sets[] = 'done_at = IF(:done_value = 1, COALESCE(done_at, CURRENT_TIMESTAMP), NULL)';
        $statement = $this->pdo->prepare(
            'UPDATE inbox_events SET ' . implode(', ', $sets) . '
             WHERE workspace_id = :workspace_id AND recipient_id = :recipient_id AND id = :id
               AND project_id IN (' . $filter . ')'
        );
        $values = ['workspace_id' => $workspaceId, 'recipient_id' => $userId, 'id' => $eventId, ...$parameters];
        if (array_key_exists('read', $changes)) $values['read_value'] = $changes['read'] ? 1 : 0;
        if (array_key_exists('done', $changes)) $values['done_value'] = $changes['done'] ? 1 : 0;
        $statement->execute($values);
        return $this->findForUser($workspaceId, $userId, $eventId, $projectIds);
    }

    public function markAllRead(int $workspaceId, int $userId, array $projectIds): void
    {
        if ($projectIds === []) return;
        [$filter, $parameters] = self::idFilter($projectIds, 'project');
        $statement = $this->pdo->prepare(
            'UPDATE inbox_events SET read_at = CURRENT_TIMESTAMP
             WHERE workspace_id = :workspace_id AND recipient_id = :recipient_id AND read_at IS NULL
               AND project_id IN (' . $filter . ')'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'recipient_id' => $userId, ...$parameters]);
    }

    private function findForUser(int $workspaceId, int $userId, int $eventId, array $projectIds): ?array
    {
        [$filter, $parameters] = self::idFilter($projectIds, 'project');
        $statement = $this->pdo->prepare(
            'SELECT e.id, e.event_type AS type, COALESCE(actor.name, \'\') AS actor_name,
                    e.summary, e.detail, e.project_id, p.name AS project_name, e.issue_id, e.message_id,
                    e.read_at IS NOT NULL AS `read`, e.done_at IS NOT NULL AS done, e.created_at
             FROM inbox_events e
             INNER JOIN projects p ON p.workspace_id = e.workspace_id AND p.id = e.project_id
             LEFT JOIN users actor ON actor.workspace_id = e.workspace_id AND actor.id = e.actor_id
             WHERE e.workspace_id = :workspace_id AND e.recipient_id = :recipient_id AND e.id = :id
               AND e.project_id IN (' . $filter . ')
             LIMIT 1'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'recipient_id' => $userId, 'id' => $eventId, ...$parameters]);
        $event = $statement->fetch(PDO::FETCH_ASSOC);
        return $event === false ? null : self::normalize($event);
    }

    private static function idFilter(array $ids, string $prefix): array
    {
        $placeholders = [];
        $parameters = [];
        foreach (array_values(array_unique($ids)) as $index => $id) {
            $name = $prefix . '_' . $index;
            $placeholders[] = ':' . $name;
            $parameters[$name] = $id;
        }
        return [implode(', ', $placeholders), $parameters];
    }

    private static function normalize(array $event): array
    {
        foreach (['id', 'project_id'] as $field) $event[$field] = (int) $event[$field];
        foreach (['issue_id', 'message_id'] as $field) $event[$field] = $event[$field] === null ? null : (int) $event[$field];
        $event['read'] = (bool) $event['read'];
        $event['done'] = (bool) $event['done'];
        return $event;
    }
}
