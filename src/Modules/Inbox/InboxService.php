<?php

declare(strict_types=1);

namespace Tangent\Modules\Inbox;

use Tangent\Core\AuthenticatedUser;
use Tangent\Core\ApiException;
use Tangent\Core\Permissions;
use Tangent\Modules\Issues\IssueRepository;
use Tangent\Modules\Projects\ProjectService;

final class InboxService
{
    public function __construct(
        private readonly IssueRepository $issues,
        private readonly ProjectService $projects,
    ) {
    }

    public function list(AuthenticatedUser $user): array
    {
        if (!Permissions::can($user, 'inbox.read')) {
            throw new ApiException(403, 'forbidden', 'You cannot read your issue inbox.');
        }
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
