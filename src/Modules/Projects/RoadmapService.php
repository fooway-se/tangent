<?php

declare(strict_types=1);

namespace Tangent\Modules\Projects;

use Tangent\Core\ApiException;
use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Permissions;

final class RoadmapService
{
    public function __construct(private readonly RoadmapRepository $roadmap)
    {
    }

    public function list(AuthenticatedUser $user): array
    {
        if (!Permissions::can($user, 'roadmap.read')) {
            throw new ApiException(403, 'forbidden', 'You cannot view the team roadmap.');
        }

        return $this->roadmap->listForWorkspace(
            $user->workspaceId,
            $user->role === 'admin' ? null : $user->id,
        );
    }
}
