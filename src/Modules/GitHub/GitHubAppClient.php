<?php

declare(strict_types=1);

namespace Tangent\Modules\GitHub;

use Tangent\Core\ApiException;

final class GitHubAppClient implements GitHubApiClient
{
    public function __construct(
        private readonly string $appId,
        private readonly string $privateKey,
        private readonly string $oauthClientId = '',
        private readonly string $oauthClientSecret = '',
    ) {
    }

    public function isConfigured(): bool
    {
        return $this->appId !== '' && $this->privateKey !== '';
    }

    public function isUserAuthorizationConfigured(): bool
    {
        return $this->oauthClientId !== '' && $this->oauthClientSecret !== '';
    }

    public function userAuthorizationUrl(string $state, string $redirectUri): string
    {
        if (!$this->isUserAuthorizationConfigured()) {
            throw new ApiException(503, 'github_not_configured', 'GitHub user authorization is not configured.');
        }
        return 'https://github.com/login/oauth/authorize?' . http_build_query([
            'client_id' => $this->oauthClientId,
            'redirect_uri' => $redirectUri,
            'state' => $state,
        ]);
    }

    public function canUserAccessInstallation(string $code, int $installationId): bool
    {
        $accessToken = $this->userAccessToken($code);
        for ($page = 1; $page <= 20; $page++) {
            $response = $this->request(
                'GET',
                '/user/installations?per_page=100&page=' . $page,
                $accessToken,
            );
            $installations = $response['installations'] ?? null;
            if (!is_array($installations)) {
                throw new ApiException(502, 'github_invalid_response', 'GitHub returned an invalid installation authorization response.');
            }
            foreach ($installations as $installation) {
                if (is_array($installation) && (int) ($installation['id'] ?? 0) === $installationId) {
                    return true;
                }
            }
            if (count($installations) < 100) break;
        }
        return false;
    }

    public function verifyInstallation(int $installationId): array
    {
        return $this->request('GET', '/app/installations/' . $installationId, $this->appJwt());
    }

    public function repositories(int $installationId): array
    {
        $token = $this->installationToken($installationId);
        $repositories = [];
        for ($page = 1; $page <= 20; $page++) {
            $result = $this->request(
                'GET',
                '/installation/repositories?per_page=100&page=' . $page,
                $token,
            );
            $pageRepositories = $result['repositories'] ?? [];
            if (!is_array($pageRepositories)) break;
            foreach ($pageRepositories as $repository) {
                if (!is_array($repository) || !isset($repository['id'], $repository['name'], $repository['owner']['login'])) continue;
                $repositories[] = [
                    'id' => (int) $repository['id'],
                    'installation_id' => $installationId,
                    'owner' => (string) $repository['owner']['login'],
                    'name' => (string) $repository['name'],
                    'full_name' => (string) ($repository['full_name'] ?? ''),
                    'html_url' => (string) ($repository['html_url'] ?? ''),
                    'private' => (bool) ($repository['private'] ?? true),
                ];
            }
            if (count($pageRepositories) < 100) break;
        }
        return $repositories;
    }

    public function repositoryById(int $installationId, int $repositoryId): array
    {
        $repository = $this->request(
            'GET',
            '/repositories/' . $repositoryId,
            $this->installationToken($installationId, $repositoryId),
        );
        $owner = $repository['owner']['login'] ?? null;
        if (!isset($repository['id'], $repository['name']) || !is_string($owner) || $owner === '') {
            throw new ApiException(502, 'github_invalid_response', 'GitHub returned an invalid repository response.');
        }

        return [
            'id' => (int) $repository['id'],
            'installation_id' => $installationId,
            'owner' => $owner,
            'name' => (string) $repository['name'],
            'full_name' => (string) ($repository['full_name'] ?? $owner . '/' . $repository['name']),
            'html_url' => (string) ($repository['html_url'] ?? ''),
            'private' => (bool) ($repository['private'] ?? true),
        ];
    }

    public function pullRequest(
        int $installationId,
        int $repositoryId,
        string $owner,
        string $repository,
        int $number,
    ): array {
        $token = $this->installationToken($installationId, $repositoryId);
        return $this->request(
            'GET',
            '/repos/' . rawurlencode($owner) . '/' . rawurlencode($repository) . '/pulls/' . $number,
            $token,
        );
    }

    private function installationToken(int $installationId, ?int $repositoryId = null): string
    {
        $body = $repositoryId === null ? [] : ['repository_ids' => [$repositoryId]];
        $result = $this->request('POST', '/app/installations/' . $installationId . '/access_tokens', $this->appJwt(), $body);
        $token = $result['token'] ?? null;
        if (!is_string($token) || $token === '') {
            throw new ApiException(502, 'github_unavailable', 'GitHub did not return an installation token.');
        }
        return $token;
    }

    private function userAccessToken(string $code): string
    {
        if (!$this->isUserAuthorizationConfigured()) {
            throw new ApiException(503, 'github_not_configured', 'GitHub user authorization is not configured.');
        }
        $context = stream_context_create(['http' => [
            'method' => 'POST',
            'header' => "Accept: application/json\r\nContent-Type: application/json\r\nUser-Agent: Tangent",
            'content' => json_encode([
                'client_id' => $this->oauthClientId,
                'client_secret' => $this->oauthClientSecret,
                'code' => $code,
            ], JSON_THROW_ON_ERROR),
            'ignore_errors' => true,
            'timeout' => 15,
        ]]);
        $response = @file_get_contents('https://github.com/login/oauth/access_token', false, $context);
        $status = 0;
        foreach ($http_response_header ?? [] as $header) {
            if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $header, $matches)) $status = (int) $matches[1];
        }
        if (!is_string($response) || $status >= 500 || $status === 0) {
            throw new ApiException(502, 'github_unavailable', 'GitHub could not complete user authorization.');
        }
        try {
            $decoded = json_decode($response, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new ApiException(502, 'github_invalid_response', 'GitHub returned an invalid authorization response.');
        }
        $accessToken = is_array($decoded) ? ($decoded['access_token'] ?? null) : null;
        if ($status < 200 || $status >= 300 || !is_string($accessToken) || $accessToken === '') {
            throw new ApiException(403, 'github_user_authorization_failed', 'GitHub user authorization failed. Start the connection again.');
        }
        return $accessToken;
    }

    private function appJwt(): string
    {
        if (!$this->isConfigured()) {
            throw new ApiException(503, 'github_not_configured', 'GitHub App credentials are not configured.');
        }
        $now = time();
        $header = self::base64Url(json_encode(['alg' => 'RS256', 'typ' => 'JWT'], JSON_THROW_ON_ERROR));
        $payload = self::base64Url(json_encode([
            'iat' => $now - 60,
            'exp' => $now + 540,
            'iss' => $this->appId,
        ], JSON_THROW_ON_ERROR));
        $message = $header . '.' . $payload;
        $privateKey = openssl_pkey_get_private($this->privateKey);
        if ($privateKey === false || !openssl_sign($message, $signature, $privateKey, OPENSSL_ALGO_SHA256)) {
            throw new ApiException(503, 'github_not_configured', 'The GitHub App private key is invalid.');
        }
        return $message . '.' . self::base64Url($signature);
    }

    private function request(string $method, string $path, string $token, array $body = []): array
    {
        $headers = [
            'Accept: application/vnd.github+json',
            'Authorization: Bearer ' . $token,
            'X-GitHub-Api-Version: 2022-11-28',
            'User-Agent: Tangent',
        ];
        $options = [
            'method' => $method,
            'header' => implode("\r\n", $headers),
            'ignore_errors' => true,
            'timeout' => 15,
        ];
        if ($body !== []) {
            $options['header'] .= "\r\nContent-Type: application/json";
            $options['content'] = json_encode($body, JSON_THROW_ON_ERROR);
        }
        $context = stream_context_create(['http' => $options]);
        $response = @file_get_contents('https://api.github.com' . $path, false, $context);
        $status = 0;
        foreach ($http_response_header ?? [] as $header) {
            if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $header, $matches)) $status = (int) $matches[1];
        }
        if (!is_string($response) || $status < 200 || $status >= 300) {
            if ($status === 404) throw new ApiException(404, 'github_resource_not_found', 'The GitHub repository or pull request was not found.');
            if ($status === 401 || $status === 403) throw new ApiException(403, 'github_access_denied', 'The GitHub App does not have access to this repository.');
            throw new ApiException(502, 'github_unavailable', 'GitHub could not complete the request.');
        }
        try {
            $decoded = json_decode($response, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new ApiException(502, 'github_invalid_response', 'GitHub returned an invalid response.');
        }
        if (!is_array($decoded)) throw new ApiException(502, 'github_invalid_response', 'GitHub returned an invalid response.');
        return $decoded;
    }

    private static function base64Url(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
