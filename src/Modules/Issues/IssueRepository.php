<?php

declare(strict_types=1);

namespace Tangent\Modules\Issues;

use DateTimeImmutable;
use DateTimeZone;
use PDO;

final class IssueRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function listForProject(int $workspaceId, int $projectId): array
    {
        $statement = $this->pdo->prepare(
            "SELECT id, workspace_id, project_id, title, description, context, expected_outcome, acceptance_criteria,
                    issue_type AS type, assignee_id, status, priority, due_date, created_by,
                    source_channel_id, source_message_id, is_shared, is_ongoing, milestone_id, sort_order, approval_requested_at, approved_by, approved_at,
                    created_at, updated_at, deleted_at,
                    (SELECT COUNT(*) FROM issue_discussion_messages discussion
                     WHERE discussion.workspace_id = issues.workspace_id AND discussion.issue_id = issues.id) AS discussion_count
             FROM issues
             WHERE workspace_id = :workspace_id AND project_id = :project_id AND deleted_at IS NULL
             ORDER BY FIELD(status, 'backlog', 'todo', 'doing', 'testing', 'done', 'cancelled'), id DESC"
        );
        $statement->execute(['workspace_id' => $workspaceId, 'project_id' => $projectId]);
        return array_map(self::normalize(...), $statement->fetchAll(PDO::FETCH_ASSOC));
    }

    public function listOpenAssignedToUser(int $workspaceId, int $userId, array $projectIds): array
    {
        if ($projectIds === []) {
            return [];
        }

        $projectPlaceholders = [];
        $parameters = ['workspace_id' => $workspaceId, 'assignee_id' => $userId];
        foreach (array_values($projectIds) as $index => $projectId) {
            $placeholder = 'project_' . $index;
            $projectPlaceholders[] = ':' . $placeholder;
            $parameters[$placeholder] = $projectId;
        }

        $statement = $this->pdo->prepare(
            "SELECT issues.id, issues.workspace_id, issues.project_id, title, description, context, expected_outcome, acceptance_criteria,
                    issue_type AS type, assignee_id, status, priority, issues.due_date, created_by,
                    source_channel_id, source_message_id, is_shared, issues.is_ongoing, issues.milestone_id, milestones.name AS milestone_name,
                    milestones.due_date AS milestone_due_date, sort_order, approval_requested_at, approved_by, approved_at,
                    issues.created_at, issues.updated_at, issues.deleted_at,
                    (SELECT COUNT(*) FROM issue_discussion_messages discussion
                     WHERE discussion.workspace_id = issues.workspace_id AND discussion.issue_id = issues.id) AS discussion_count
             FROM issues
             LEFT JOIN milestones ON milestones.workspace_id = issues.workspace_id AND milestones.id = issues.milestone_id
             WHERE issues.workspace_id = :workspace_id AND issues.assignee_id = :assignee_id AND issues.deleted_at IS NULL
               AND issues.status IN ('backlog', 'todo', 'doing', 'testing')
               AND issues.project_id IN (" . implode(', ', $projectPlaceholders) . ")
             ORDER BY issues.updated_at DESC, issues.id DESC"
        );
        $statement->execute($parameters);
        return array_map(self::normalize(...), $statement->fetchAll(PDO::FETCH_ASSOC));
    }

    public function listDeletedForProject(int $workspaceId, int $projectId): array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, workspace_id, project_id, title, description, context, expected_outcome, acceptance_criteria,
                    issue_type AS type, assignee_id, status, priority, due_date, created_by,
                    source_channel_id, source_message_id, is_shared, is_ongoing, milestone_id, sort_order, approval_requested_at, approved_by, approved_at,
                    created_at, updated_at, deleted_at,
                    (SELECT COUNT(*) FROM issue_discussion_messages discussion
                     WHERE discussion.workspace_id = issues.workspace_id AND discussion.issue_id = issues.id) AS discussion_count
             FROM issues
             WHERE workspace_id = :workspace_id AND project_id = :project_id AND deleted_at IS NOT NULL
             ORDER BY deleted_at DESC, id DESC'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'project_id' => $projectId]);
        return array_map(self::normalize(...), $statement->fetchAll(PDO::FETCH_ASSOC));
    }

    public function create(
        int $workspaceId,
        int $projectId,
        string $title,
        string $description,
        int $creatorId,
        ?int $sourceChannelId = null,
        ?int $sourceMessageId = null,
        string $type = 'task',
        ?int $assigneeId = null,
        ?int $milestoneId = null,
        bool $isShared = false,
        bool $isOngoing = false,
        bool $approvalRequested = false,
        string $priority = 'medium',
        ?string $dueDate = null,
        string $context = '',
        string $expectedOutcome = '',
        string $acceptanceCriteria = '',
    ): array {
        $statement = $this->pdo->prepare(
            "INSERT INTO issues (
                workspace_id, project_id, title, description, context, expected_outcome, acceptance_criteria,
                issue_type, status, priority, due_date, created_by, assignee_id,
                source_channel_id, source_message_id, is_shared, is_ongoing, milestone_id, approval_requested_at
             ) VALUES (
                :workspace_id, :project_id, :title, :description, :context, :expected_outcome, :acceptance_criteria,
                :type, 'backlog', :priority, :due_date, :created_by, :assignee_id,
                :source_channel_id, :source_message_id, :is_shared, :is_ongoing, :milestone_id, :approval_requested_at
             )"
        );
        $approvalRequestedAt = $approvalRequested ? gmdate('Y-m-d H:i:s') : null;
        $statement->execute([
            'workspace_id' => $workspaceId,
            'project_id' => $projectId,
            'title' => $title,
            'description' => $description,
            'context' => $context,
            'expected_outcome' => $expectedOutcome,
            'acceptance_criteria' => $acceptanceCriteria,
            'type' => $type,
            'priority' => $priority,
            'due_date' => $dueDate,
            'created_by' => $creatorId,
            'assignee_id' => $assigneeId,
            'source_channel_id' => $sourceChannelId,
            'source_message_id' => $sourceMessageId,
            'is_shared' => $isShared ? 1 : 0,
            'is_ongoing' => $isOngoing ? 1 : 0,
            'milestone_id' => $milestoneId,
            'approval_requested_at' => $approvalRequestedAt,
        ]);

        $issueId = (int) $this->pdo->lastInsertId();
        $sortOrder = $this->maxSortOrder($workspaceId, $projectId, $milestoneId) + 1;
        $rank = $this->pdo->prepare(
            'UPDATE issues SET sort_order = :sort_order WHERE workspace_id = :workspace_id AND id = :id'
        );
        $rank->execute(['workspace_id' => $workspaceId, 'id' => $issueId, 'sort_order' => $sortOrder]);
        return $this->find($workspaceId, $issueId) ?? [];
    }

    public function find(int $workspaceId, int $issueId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, workspace_id, project_id, title, description, context, expected_outcome, acceptance_criteria,
                    issue_type AS type, assignee_id, status, priority, due_date, created_by,
                    source_channel_id, source_message_id, is_shared, is_ongoing, milestone_id, sort_order, approval_requested_at, approved_by, approved_at,
                    created_at, updated_at, deleted_at,
                    (SELECT COUNT(*) FROM issue_discussion_messages discussion
                     WHERE discussion.workspace_id = issues.workspace_id AND discussion.issue_id = issues.id) AS discussion_count
             FROM issues WHERE workspace_id = :workspace_id AND id = :id AND deleted_at IS NULL LIMIT 1'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'id' => $issueId]);
        $issue = $statement->fetch(PDO::FETCH_ASSOC);
        return $issue === false ? null : self::normalize($issue);
    }

    public function findManyForProjectForUpdate(int $workspaceId, int $projectId, array $issueIds): array
    {
        if ($issueIds === []) return [];
        [$idFilter, $idParameters] = self::idFilter($issueIds, 'issue_id');
        $statement = $this->pdo->prepare(
            'SELECT id, title, assignee_id, is_shared, is_ongoing, milestone_id
             FROM issues
             WHERE workspace_id = :workspace_id AND project_id = :project_id AND deleted_at IS NULL
               AND id IN (' . $idFilter . ')
             ORDER BY id FOR UPDATE'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'project_id' => $projectId,
            ...$idParameters,
        ]);
        $byId = [];
        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $issue) {
            $normalized = [
                'id' => (int) $issue['id'],
                'title' => (string) $issue['title'],
                'assignee_id' => $issue['assignee_id'] === null ? null : (int) $issue['assignee_id'],
                'is_shared' => (bool) $issue['is_shared'],
                'is_ongoing' => (bool) $issue['is_ongoing'],
                'milestone_id' => $issue['milestone_id'] === null ? null : (int) $issue['milestone_id'],
            ];
            $byId[$normalized['id']] = $normalized;
        }

        $ordered = [];
        foreach ($issueIds as $issueId) {
            if (isset($byId[$issueId])) $ordered[] = $byId[$issueId];
        }
        return $ordered;
    }

    public function findDeleted(int $workspaceId, int $issueId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT id, workspace_id, project_id, title, description, context, expected_outcome, acceptance_criteria,
                    issue_type AS type, assignee_id, status, priority, due_date, created_by,
                    source_channel_id, source_message_id, is_shared, is_ongoing, milestone_id, sort_order, approval_requested_at, approved_by, approved_at,
                    created_at, updated_at, deleted_at,
                    (SELECT COUNT(*) FROM issue_discussion_messages discussion
                     WHERE discussion.workspace_id = issues.workspace_id AND discussion.issue_id = issues.id) AS discussion_count
             FROM issues WHERE workspace_id = :workspace_id AND id = :id AND deleted_at IS NOT NULL LIMIT 1'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'id' => $issueId]);
        $issue = $statement->fetch(PDO::FETCH_ASSOC);
        return $issue === false ? null : self::normalize($issue);
    }

    public function update(int $workspaceId, int $issueId, array $issue): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE issues
             SET title = :title, description = :description, context = :context, expected_outcome = :expected_outcome,
                 acceptance_criteria = :acceptance_criteria, issue_type = :type, assignee_id = :assignee_id,
                 status = :status, priority = :priority, due_date = :due_date,
                 is_shared = :is_shared, is_ongoing = :is_ongoing, milestone_id = :milestone_id, sort_order = :sort_order,
                 approval_requested_at = :approval_requested_at, approved_by = :approved_by, approved_at = :approved_at
             WHERE workspace_id = :workspace_id AND id = :id AND deleted_at IS NULL'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'id' => $issueId,
            'title' => $issue['title'],
            'description' => $issue['description'],
            'context' => $issue['context'],
            'expected_outcome' => $issue['expected_outcome'],
            'acceptance_criteria' => $issue['acceptance_criteria'],
            'type' => $issue['type'],
            'assignee_id' => $issue['assignee_id'],
            'status' => $issue['status'],
            'priority' => $issue['priority'],
            'due_date' => $issue['due_date'],
            'is_shared' => $issue['is_shared'] ? 1 : 0,
            'is_ongoing' => $issue['is_ongoing'] ? 1 : 0,
            'milestone_id' => $issue['milestone_id'],
            'sort_order' => $issue['sort_order'],
            'approval_requested_at' => $issue['approval_requested_at'],
            'approved_by' => $issue['approved_by'],
            'approved_at' => $issue['approved_at'],
        ]);
    }

    public function bulkSetShared(int $workspaceId, int $projectId, array $issueIds, bool $isShared): int
    {
        if ($issueIds === []) return 0;
        [$idFilter, $idParameters] = self::idFilter($issueIds, 'issue_id');
        $statement = $this->pdo->prepare(
            'UPDATE issues SET is_shared = :is_shared
             WHERE workspace_id = :workspace_id AND project_id = :project_id
               AND deleted_at IS NULL AND is_shared <> :current_is_shared
               AND id IN (' . $idFilter . ')'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'project_id' => $projectId,
            'is_shared' => $isShared ? 1 : 0,
            'current_is_shared' => $isShared ? 1 : 0,
            ...$idParameters,
        ]);
        return $statement->rowCount();
    }

    public function bulkAssignToMember(int $workspaceId, int $projectId, array $issueIds, ?int $assigneeId): int
    {
        if ($issueIds === []) return 0;
        [$idFilter, $idParameters] = self::idFilter($issueIds, 'issue_id');
        $statement = $this->pdo->prepare(
            'UPDATE issues SET assignee_id = :assignee_id
             WHERE workspace_id = :workspace_id AND project_id = :project_id AND deleted_at IS NULL
               AND NOT (assignee_id <=> :current_assignee_id)
               AND id IN (' . $idFilter . ')'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'project_id' => $projectId,
            'assignee_id' => $assigneeId,
            'current_assignee_id' => $assigneeId,
            ...$idParameters,
        ]);
        return $statement->rowCount();
    }

    public function moveUnassignedToMilestoneBatch(
        int $workspaceId,
        int $projectId,
        array $issueIds,
        int $milestoneId,
        int $firstSortOrder,
    ): int {
        if ($issueIds === []) return 0;
        [$idFilter, $idParameters] = self::idFilter($issueIds, 'issue_id');
        $sortOrderCases = [];
        $caseParameters = [];
        foreach (array_values($issueIds) as $index => $issueId) {
            $issueParameter = 'sort_issue_' . $index;
            $sortParameter = 'sort_order_' . $index;
            $sortOrderCases[] = 'WHEN :' . $issueParameter . ' THEN :' . $sortParameter;
            $caseParameters[$issueParameter] = $issueId;
            $caseParameters[$sortParameter] = $firstSortOrder + $index;
        }
        $statement = $this->pdo->prepare(
            'UPDATE issues SET milestone_id = :milestone_id,
                 sort_order = CASE id ' . implode(' ', $sortOrderCases) . ' ELSE sort_order END
             WHERE workspace_id = :workspace_id AND project_id = :project_id
               AND milestone_id IS NULL AND is_ongoing = 0 AND deleted_at IS NULL
               AND id IN (' . $idFilter . ')'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'project_id' => $projectId,
            'milestone_id' => $milestoneId,
            ...$idParameters,
            ...$caseParameters,
        ]);
        return $statement->rowCount();
    }

    public function maxSortOrder(int $workspaceId, int $projectId, ?int $milestoneId): int
    {
        $statement = $this->pdo->prepare(
            'SELECT COALESCE(MAX(sort_order), 0) FROM issues
             WHERE workspace_id = :workspace_id AND project_id = :project_id AND milestone_id <=> :milestone_id'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'project_id' => $projectId,
            'milestone_id' => $milestoneId,
        ]);
        return (int) $statement->fetchColumn();
    }

    public function moveWithinMilestone(
        int $workspaceId,
        int $projectId,
        ?int $milestoneId,
        int $issueId,
        string $direction,
        bool $isOngoing,
    ): void
    {
        $statement = $this->pdo->prepare(
            "SELECT id, sort_order FROM issues
             WHERE workspace_id = :workspace_id AND project_id = :project_id AND milestone_id <=> :milestone_id
               AND is_ongoing = :is_ongoing
               AND status IN ('backlog', 'todo', 'doing', 'testing') AND deleted_at IS NULL
             ORDER BY sort_order, id FOR UPDATE"
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'project_id' => $projectId,
            'milestone_id' => $milestoneId,
            'is_ongoing' => $isOngoing ? 1 : 0,
        ]);
        $rows = $statement->fetchAll(PDO::FETCH_ASSOC);
        $index = array_search($issueId, array_map(static fn (array $row): int => (int) $row['id'], $rows), true);
        if (!is_int($index)) return;
        $neighborIndex = $index + ($direction === 'up' ? -1 : 1);
        if (!isset($rows[$neighborIndex])) return;

        $current = $rows[$index];
        $neighbor = $rows[$neighborIndex];
        $update = $this->pdo->prepare(
            'UPDATE issues SET sort_order = :sort_order WHERE workspace_id = :workspace_id AND id = :id'
        );
        $update->execute([
            'workspace_id' => $workspaceId,
            'id' => (int) $current['id'],
            'sort_order' => (int) $neighbor['sort_order'],
        ]);
        $update->execute([
            'workspace_id' => $workspaceId,
            'id' => (int) $neighbor['id'],
            'sort_order' => (int) $current['sort_order'],
        ]);
    }

    public function recordStatusTransition(int $workspaceId, int $issueId, ?int $actorId, string $from, string $to): void
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO issue_status_history (workspace_id, issue_id, actor_id, from_status, to_status)
             VALUES (:workspace_id, :issue_id, :actor_id, :from_status, :to_status)'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'issue_id' => $issueId,
            'actor_id' => $actorId,
            'from_status' => $from,
            'to_status' => $to,
        ]);
    }

    public function statusHistory(int $workspaceId, int $issueId): array
    {
        $statement = $this->pdo->prepare(
            "SELECT h.id, h.from_status, h.to_status, COALESCE(u.name, 'System') AS actor_name, h.created_at
             FROM issue_status_history h
             LEFT JOIN users u ON u.workspace_id = h.workspace_id AND u.id = h.actor_id
             WHERE h.workspace_id = :workspace_id AND h.issue_id = :issue_id
             ORDER BY h.id DESC LIMIT 20"
        );
        $statement->execute(['workspace_id' => $workspaceId, 'issue_id' => $issueId]);
        return array_map(static fn (array $row): array => [
            'id' => (int) $row['id'],
            'from_status' => $row['from_status'] === null ? null : (string) $row['from_status'],
            'to_status' => (string) $row['to_status'],
            'actor_name' => (string) $row['actor_name'],
            'created_at' => (string) $row['created_at'],
        ], $statement->fetchAll(PDO::FETCH_ASSOC));
    }

    public function unlinkMilestone(int $workspaceId, int $projectId, int $milestoneId): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE issues target
             INNER JOIN (
                SELECT moving.id,
                       baseline.max_sort_order
                           + ROW_NUMBER() OVER (ORDER BY moving.sort_order, moving.id) AS new_sort_order
                FROM issues moving
                CROSS JOIN (
                    SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order FROM issues
                    WHERE workspace_id = :base_workspace_id AND project_id = :base_project_id
                      AND milestone_id IS NULL
                ) baseline
                WHERE moving.workspace_id = :moving_workspace_id
                  AND moving.project_id = :moving_project_id AND moving.milestone_id = :moving_milestone_id
             ) ranked ON ranked.id = target.id
             SET target.milestone_id = NULL, target.sort_order = ranked.new_sort_order
             WHERE target.workspace_id = :target_workspace_id AND target.project_id = :target_project_id
               AND target.milestone_id = :target_milestone_id'
        );
        $statement->execute([
            'base_workspace_id' => $workspaceId,
            'base_project_id' => $projectId,
            'moving_workspace_id' => $workspaceId,
            'moving_project_id' => $projectId,
            'moving_milestone_id' => $milestoneId,
            'target_workspace_id' => $workspaceId,
            'target_project_id' => $projectId,
            'target_milestone_id' => $milestoneId,
        ]);
    }

    public function sharedItems(int $workspaceId, int $projectId): array
    {
        $statement = $this->pdo->prepare(
            "SELECT i.id, i.title, i.description, i.status, i.milestone_id, m.name AS milestone_name
             FROM issues i LEFT JOIN milestones m
               ON m.workspace_id = i.workspace_id AND m.id = i.milestone_id
             WHERE i.workspace_id = :workspace_id AND i.project_id = :project_id AND i.is_shared = 1
               AND i.is_ongoing = 0 AND i.deleted_at IS NULL AND i.status <> 'cancelled'
             ORDER BY FIELD(i.status, 'backlog', 'todo', 'doing', 'testing', 'done'), i.id DESC"
        );
        $statement->execute(['workspace_id' => $workspaceId, 'project_id' => $projectId]);
        $rows = $statement->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as &$row) {
            $row['id'] = (int) $row['id'];
            $row['milestone_id'] = $row['milestone_id'] === null ? null : (int) $row['milestone_id'];
        }
        unset($row);
        return $rows;
    }

    public function sharedProgressSummary(int $workspaceId, int $projectId): array
    {
        $statement = $this->pdo->prepare(
            "SELECT milestone_id, COUNT(*) AS total, SUM(status = 'done') AS done,
                    SUM(COUNT(*)) OVER () AS overall_total,
                    SUM(SUM(status = 'done')) OVER () AS overall_done
             FROM issues
             WHERE workspace_id = :workspace_id AND project_id = :project_id AND is_shared = 1
               AND is_ongoing = 0 AND deleted_at IS NULL AND status <> 'cancelled'
             GROUP BY milestone_id"
        );
        $statement->execute(['workspace_id' => $workspaceId, 'project_id' => $projectId]);
        $overallProgress = null;
        $milestoneProgress = [];
        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $overallProgress = [
                'done' => (int) ($row['overall_done'] ?? 0),
                'total' => (int) ($row['overall_total'] ?? 0),
            ];
            if ($row['milestone_id'] !== null) {
                $milestoneProgress[(int) $row['milestone_id']] = [
                    'done' => (int) ($row['done'] ?? 0),
                    'total' => (int) $row['total'],
                ];
            }
        }
        return [
            'progress' => $overallProgress ?? ['done' => 0, 'total' => 0],
            'milestones' => $milestoneProgress,
        ];
    }

    public function pendingSharedApprovals(int $workspaceId, int $projectId): array
    {
        $statement = $this->pdo->prepare(
            "SELECT id, title, description FROM issues
             WHERE workspace_id = :workspace_id AND project_id = :project_id AND is_shared = 1
               AND is_ongoing = 0 AND deleted_at IS NULL AND status <> 'cancelled'
               AND approval_requested_at IS NOT NULL AND approved_at IS NULL
             ORDER BY approval_requested_at, id"
        );
        $statement->execute(['workspace_id' => $workspaceId, 'project_id' => $projectId]);
        return array_map(static function (array $row): array {
            $row['id'] = (int) $row['id'];
            return $row;
        }, $statement->fetchAll(PDO::FETCH_ASSOC));
    }

    public function completedSharedThisWeek(int $workspaceId, int $projectId): int
    {
        $statement = $this->pdo->prepare(
            "SELECT COUNT(DISTINCT h.issue_id) FROM issue_status_history h FORCE INDEX (ix_issue_status_history_done_created)
             INNER JOIN issues i ON i.workspace_id = h.workspace_id AND i.id = h.issue_id
             WHERE h.workspace_id = :workspace_id AND i.project_id = :project_id AND i.is_shared = 1
               AND i.is_ongoing = 0 AND i.deleted_at IS NULL AND i.status <> 'cancelled' AND h.to_status = 'done'
               AND h.created_at >= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 7 DAY)"
        );
        $statement->execute(['workspace_id' => $workspaceId, 'project_id' => $projectId]);
        return (int) $statement->fetchColumn();
    }

    public function sharedStatusUpdates(int $workspaceId, int $projectId): array
    {
        $statement = $this->pdo->prepare(
            "SELECT h.id, h.from_status, h.to_status, h.created_at, i.title
             FROM issue_status_history h FORCE INDEX (ix_issue_status_history_workspace_recent)
             INNER JOIN issues i ON i.workspace_id = h.workspace_id AND i.id = h.issue_id
             WHERE h.workspace_id = :workspace_id AND i.project_id = :project_id AND i.is_shared = 1
               AND i.is_ongoing = 0 AND i.deleted_at IS NULL AND i.status <> 'cancelled'
             ORDER BY h.id DESC LIMIT 10"
        );
        $statement->execute(['workspace_id' => $workspaceId, 'project_id' => $projectId]);
        return array_map(static function (array $row): array {
            $label = match ($row['to_status']) {
                'backlog' => 'planned', 'todo' => 'to do', 'doing' => 'in progress', 'testing' => 'testing', 'done' => 'done', 'cancelled' => 'cancelled',
                default => 'updated',
            };
            $text = $row['to_status'] === 'done'
                ? 'Completed: ' . $row['title']
                : 'Updated: ' . $row['title'] . ' (' . $label . ')';
            return ['id' => (int) $row['id'], 'text' => $text, 'created_at' => (string) $row['created_at']];
        }, $statement->fetchAll(PDO::FETCH_ASSOC));
    }

    public function sharedStatusUpdatesBetween(int $workspaceId, int $projectId, string $from, string $to): array
    {
        $until = (new DateTimeImmutable($to, new DateTimeZone('UTC')))->modify('+1 day')->format('Y-m-d 00:00:00');
        $statement = $this->pdo->prepare(
            "SELECT h.id, h.to_status, h.created_at, i.title, COUNT(*) OVER() AS total_count
             FROM issue_status_history h FORCE INDEX (ix_issue_status_history_workspace_recent)
             INNER JOIN issues i ON i.workspace_id = h.workspace_id AND i.id = h.issue_id
             WHERE h.workspace_id = :workspace_id AND i.project_id = :project_id AND i.is_shared = 1
               AND i.is_ongoing = 0 AND i.deleted_at IS NULL AND i.status <> 'cancelled'
               AND h.created_at >= :from_at AND h.created_at < :until_at
             ORDER BY h.id DESC LIMIT 5"
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'project_id' => $projectId,
            'from_at' => $from . ' 00:00:00',
            'until_at' => $until,
        ]);
        $rows = $statement->fetchAll(PDO::FETCH_ASSOC);
        $totalCount = $rows === [] ? 0 : (int) $rows[0]['total_count'];
        $updates = array_map(static function (array $row): array {
            $label = match ($row['to_status']) {
                'backlog' => 'planned', 'todo' => 'to do', 'doing' => 'in progress', 'testing' => 'testing', 'done' => 'done', 'cancelled' => 'cancelled',
                default => 'updated',
            };
            $text = $row['to_status'] === 'done'
                ? 'Completed: ' . $row['title']
                : 'Updated: ' . $row['title'] . ' (' . $label . ')';
            return ['id' => (int) $row['id'], 'text' => $text, 'created_at' => (string) $row['created_at']];
        }, $rows);

        return ['total_count' => $totalCount, 'updates' => $updates];
    }

    public function approvalIssue(int $workspaceId, int $issueId): ?array
    {
        $statement = $this->pdo->prepare(
            'SELECT project_id, title, created_by, is_shared, is_ongoing, approval_requested_at, approved_at, status
             FROM issues WHERE workspace_id = :workspace_id AND id = :id
             AND deleted_at IS NULL LIMIT 1'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'id' => $issueId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);
        if ($row === false) return null;
        return [
            'project_id' => (int) $row['project_id'],
            'title' => (string) $row['title'],
            'created_by' => (int) $row['created_by'],
            'is_shared' => (bool) $row['is_shared'],
            'is_ongoing' => (bool) $row['is_ongoing'],
            'approval_requested_at' => $row['approval_requested_at'] === null ? null : (string) $row['approval_requested_at'],
            'approved_at' => $row['approved_at'] === null ? null : (string) $row['approved_at'],
            'status' => (string) $row['status'],
        ];
    }

    public function approve(int $workspaceId, int $issueId, int $approverId): bool
    {
        $statement = $this->pdo->prepare(
            "UPDATE issues SET approved_by = :approver_id, approved_at = CURRENT_TIMESTAMP
             WHERE workspace_id = :workspace_id AND id = :id AND is_shared = 1 AND deleted_at IS NULL
               AND approval_requested_at IS NOT NULL AND approved_at IS NULL AND status <> 'cancelled'"
        );
        $statement->execute(['workspace_id' => $workspaceId, 'id' => $issueId, 'approver_id' => $approverId]);
        return $statement->rowCount() === 1;
    }

    public function softDelete(int $workspaceId, int $issueId): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE issues SET deleted_at = CURRENT_TIMESTAMP
             WHERE workspace_id = :workspace_id AND id = :id AND deleted_at IS NULL'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'id' => $issueId]);
    }

    public function restore(int $workspaceId, int $issueId): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE issues SET deleted_at = NULL
             WHERE workspace_id = :workspace_id AND id = :id AND deleted_at IS NOT NULL'
        );
        $statement->execute(['workspace_id' => $workspaceId, 'id' => $issueId]);
    }

    public function unassignMember(int $workspaceId, int $projectId, int $userId): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE issues SET assignee_id = NULL
             WHERE workspace_id = :workspace_id AND project_id = :project_id AND assignee_id = :user_id'
        );
        $statement->execute([
            'workspace_id' => $workspaceId,
            'project_id' => $projectId,
            'user_id' => $userId,
        ]);
    }

    private static function idFilter(array $ids, string $prefix): array
    {
        $placeholders = [];
        $parameters = [];
        foreach (array_values($ids) as $index => $id) {
            $name = $prefix . '_' . $index;
            $placeholders[] = ':' . $name;
            $parameters[$name] = $id;
        }
        return [implode(', ', $placeholders), $parameters];
    }

    private static function normalize(array $issue): array
    {
        foreach (['id', 'workspace_id', 'project_id', 'created_by', 'sort_order', 'discussion_count'] as $field) {
            if ($field === 'discussion_count' && !array_key_exists($field, $issue)) {
                $issue[$field] = 0;
            }
            $issue[$field] = (int) $issue[$field];
        }
        $issue['assignee_id'] = $issue['assignee_id'] === null ? null : (int) $issue['assignee_id'];
        $issue['is_shared'] = (bool) $issue['is_shared'];
        $issue['is_ongoing'] = (bool) ($issue['is_ongoing'] ?? false);
        $issue['milestone_id'] = $issue['milestone_id'] === null ? null : (int) $issue['milestone_id'];
        $issue['priority'] = (string) $issue['priority'];
        $issue['due_date'] = $issue['due_date'] === null ? null : (string) $issue['due_date'];
        foreach (['context', 'expected_outcome', 'acceptance_criteria'] as $field) {
            $issue[$field] = $issue[$field] === null ? '' : (string) $issue[$field];
        }
        $issue['approved_by'] = $issue['approved_by'] === null ? null : (int) $issue['approved_by'];
        foreach (['source_channel_id', 'source_message_id'] as $field) {
            $issue[$field] = $issue[$field] === null ? null : (int) $issue[$field];
        }
        return $issue;
    }
}
