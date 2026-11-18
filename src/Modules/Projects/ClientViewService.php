<?php

declare(strict_types=1);

namespace Tangent\Modules\Projects;

use Tangent\Core\ApiException;
use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Permissions;
use Tangent\Modules\Chat\ChatService;
use Tangent\Modules\Issues\IssueRepository;

final class ClientViewService
{
    public function __construct(
        private readonly ProjectRepository $projects,
        private readonly MilestoneRepository $milestones,
        private readonly IssueRepository $issues,
        private readonly ChatService $chat,
    ) {
    }

    public function get(AuthenticatedUser $user, int $projectId): array
    {
        $project = $this->projects->find($user->workspaceId, $projectId);
        $isMember = $project !== null && $this->projects->isMember($user->workspaceId, $projectId, $user->id);
        if ($project === null || !Permissions::can($user, 'client_view.read', ['is_member' => $isMember])) {
            throw new ApiException(404, 'not_found', 'The project was not found.');
        }

        $progress = $this->issues->sharedProgress($user->workspaceId, $projectId);
        $percent = $progress['total'] === 0 ? 0 : (int) round($progress['done'] / $progress['total'] * 100);
        $milestoneProgress = $this->issues->sharedMilestoneProgress($user->workspaceId, $projectId);
        $milestones = [];
        $nextMilestone = null;
        $today = gmdate('Y-m-d');
        foreach ($this->milestones->list($user->workspaceId, $projectId) as $milestone) {
            $counts = $milestoneProgress[$milestone['id']] ?? ['done' => 0, 'total' => 0];
            if ($counts['total'] === 0) continue;
            $milestones[] = [
                'id' => $milestone['id'],
                'name' => $milestone['name'],
                'due_date' => $milestone['due_date'],
                'done' => $counts['done'],
                'total' => $counts['total'],
            ];
            if ($nextMilestone === null && $milestone['due_date'] !== null
                && $milestone['due_date'] >= $today && $counts['total'] > $counts['done']) {
                $nextMilestone = ['name' => $milestone['name'], 'due_date' => $milestone['due_date']];
            }
        }

        $items = array_map(static function (array $issue): array {
            return [
                'id' => $issue['id'],
                'title' => $issue['title'],
                'description' => $issue['description'],
                'milestone_id' => $issue['milestone_id'],
                'status' => match ($issue['status']) {
                    'doing', 'testing' => 'doing', 'done' => 'done', default => 'planned',
                },
                'milestone_name' => $issue['milestone_name'],
            ];
        }, $this->issues->sharedItems($user->workspaceId, $projectId));

        return [
            'project' => ['id' => $project['id'], 'name' => $project['name']],
            'progress' => ['percent' => $percent, 'done' => $progress['done'], 'total' => $progress['total']],
            'next_milestone' => $nextMilestone,
            'completed_this_week' => $this->issues->completedSharedThisWeek($user->workspaceId, $projectId),
            'approvals' => $this->issues->pendingSharedApprovals($user->workspaceId, $projectId),
            'milestones' => $milestones,
            'items' => $items,
            'updates' => $this->issues->sharedStatusUpdates($user->workspaceId, $projectId),
            'messages' => $this->chat->clientConversationMessages($user, $projectId),
        ];
    }
}
