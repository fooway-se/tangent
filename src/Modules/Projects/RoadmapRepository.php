<?php

declare(strict_types=1);

namespace Tangent\Modules\Projects;

use PDO;

final class RoadmapRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function listForWorkspace(int $workspaceId, ?int $membershipUserId): array
    {
        $membershipJoin = $membershipUserId === null
            ? ''
            : ' INNER JOIN project_memberships pm
                  ON pm.workspace_id = p.workspace_id AND pm.project_id = p.id AND pm.user_id = :user_id';
        $statement = $this->pdo->prepare(
            "SELECT m.id, m.project_id, p.name AS project_name, p.status AS project_status,
                    m.name, m.due_date,
                    COUNT(i.id) AS total_tasks,
                    SUM(CASE WHEN i.status = 'done' THEN 1 ELSE 0 END) AS completed_tasks,
                    SUM(CASE WHEN i.id IS NOT NULL AND i.status <> 'done' THEN 1 ELSE 0 END) AS remaining_tasks,
                    COUNT(DISTINCT CASE WHEN i.status <> 'done' AND u.role IN ('admin', 'developer') AND u.is_active = 1 THEN u.id END) AS assigned_team_members,
                    SUM(CASE WHEN i.id IS NOT NULL AND i.status <> 'done'
                         AND (u.id IS NULL OR u.role NOT IN ('admin', 'developer') OR u.is_active <> 1) THEN 1 ELSE 0 END) AS tasks_without_team_assignee
             FROM milestones m
             INNER JOIN projects p ON p.workspace_id = m.workspace_id AND p.id = m.project_id
             {$membershipJoin}
             LEFT JOIN issues i ON i.workspace_id = m.workspace_id AND i.project_id = m.project_id
                  AND i.milestone_id = m.id AND i.deleted_at IS NULL AND i.status <> 'cancelled'
             LEFT JOIN users u ON u.workspace_id = i.workspace_id AND u.id = i.assignee_id
             WHERE m.workspace_id = :workspace_id AND m.archived_at IS NULL AND p.status <> 'archived'
             GROUP BY m.id, m.project_id, p.name, p.status, m.name, m.due_date
             ORDER BY m.due_date IS NULL, m.due_date, p.name, m.name, m.id"
        );
        $parameters = ['workspace_id' => $workspaceId];
        if ($membershipUserId !== null) $parameters['user_id'] = $membershipUserId;
        $statement->execute($parameters);

        return array_map(static function (array $milestone): array {
            foreach (['id', 'project_id', 'total_tasks', 'completed_tasks', 'remaining_tasks', 'assigned_team_members', 'tasks_without_team_assignee'] as $field) {
                $milestone[$field] = (int) $milestone[$field];
            }
            return $milestone;
        }, $statement->fetchAll(PDO::FETCH_ASSOC));
    }
}
