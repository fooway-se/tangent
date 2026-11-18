<?php

declare(strict_types=1);

namespace Tangent\Modules\GitHub;

interface GitHubApiClient
{
    public function isConfigured(): bool;

    public function verifyInstallation(int $installationId): array;

    public function repositories(int $installationId): array;

    public function pullRequest(int $installationId, int $repositoryId, string $owner, string $repository, int $number): array;
}
