<?php

declare(strict_types=1);

namespace Tangent\Modules\Inbox;

use Tangent\Core\AuthenticatedUser;
use Tangent\Modules\Issues\IssueRepository;
use Tangent\Modules\Projects\ProjectService;

final class InboxService
{
    public function __construct(
        private readonly IssueRepository $issues,
        private readonly ProjectService $projects,
    ) {
    }

    /** @return list<array<string, mixed>> */
    public function list(AuthenticatedUser $user): array
    {
        $visibleProjects = $this->projects->list($user);
        $projectById = [];
        foreach ($visibleProjects as $project) {
            $projectById[(int) $project['id']] = [
                'name' => $project['name'],
                'slug' => $project['slug'],
            ];
        }

        $issues = $this->issues->listOpenAssignedToUser(
            $user->workspaceId,
            $user->id,
            array_keys($projectById),
        );

        foreach ($issues as &$issue) {
            $project = $projectById[$issue['project_id']];
            $issue['project_name'] = $project['name'];
            $issue['project_slug'] = $project['slug'];
        }
        unset($issue);

        return $issues;
    }
}
