<?php

declare(strict_types=1);

namespace Tangent\Modules\GitHub;

interface GitHubApiClient
{
    public function isConfigured(): bool;

    public function isUserAuthorizationConfigured(): bool;

    public function userAuthorizationUrl(string $state, string $redirectUri): string;

    public function canUserAccessInstallation(string $code, int $installationId): bool;

    public function verifyInstallation(int $installationId): array;

    public function repositories(int $installationId): array;

    public function repositoryById(int $installationId, int $repositoryId): array;

    public function pullRequest(int $installationId, int $repositoryId, string $owner, string $repository, int $number): array;
}
