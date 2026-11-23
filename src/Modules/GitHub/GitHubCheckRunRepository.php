<?php

declare(strict_types=1);

namespace Tangent\Modules\GitHub;

use PDO;

final class GitHubCheckRunRepository
{
    private const MAX_STORED_RUNS_PER_PULL_REQUEST = 50;
    private const MAX_RETURNED_RUNS_PER_PULL_REQUEST = 20;

    public function __construct(private readonly PDO $pdo)
    {
    }

    public function record(int $pullRequestId, array $checkRun): bool
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO issue_pull_request_checks
                (pull_request_id, github_check_run_id, name, html_url, status, conclusion,
                 started_at, completed_at, github_updated_at)
             VALUES
                (:pull_request_id, :github_check_run_id, :name, :html_url, :status, :conclusion,
                 :started_at, :completed_at, :github_updated_at)
             ON DUPLICATE KEY UPDATE
                name = IF(github_updated_at < VALUES(github_updated_at), VALUES(name), name),
                html_url = IF(github_updated_at < VALUES(github_updated_at), VALUES(html_url), html_url),
                status = IF(github_updated_at < VALUES(github_updated_at), VALUES(status), status),
                conclusion = IF(github_updated_at < VALUES(github_updated_at), VALUES(conclusion), conclusion),
                started_at = IF(github_updated_at < VALUES(github_updated_at), VALUES(started_at), started_at),
                completed_at = IF(github_updated_at < VALUES(github_updated_at), VALUES(completed_at), completed_at),
                github_updated_at = GREATEST(github_updated_at, VALUES(github_updated_at))'
        );
        $statement->execute([
            'pull_request_id' => $pullRequestId,
            'github_check_run_id' => $checkRun['id'],
            'name' => $checkRun['name'],
            'html_url' => $checkRun['html_url'],
            'status' => $checkRun['status'],
            'conclusion' => $checkRun['conclusion'],
            'started_at' => $checkRun['started_at'],
            'completed_at' => $checkRun['completed_at'],
            'github_updated_at' => $checkRun['updated_at'],
        ]);
        $changed = $statement->rowCount() > 0;
        if ($changed) $this->prune($pullRequestId);
        return $changed;
    }

    public function listForPullRequests(array $pullRequests): array
    {
        $runsByPullRequest = [];
        $pullRequestIds = [];
        foreach ($pullRequests as $pullRequest) {
            $id = (int) $pullRequest['id'];
            $runsByPullRequest[$id] = [];
            $pullRequestIds[] = $id;
        }
        if ($pullRequestIds === []) return $runsByPullRequest;

        $placeholders = [];
        $parameters = [];
        foreach ($pullRequestIds as $index => $id) {
            $placeholder = 'pull_request_' . $index;
            $placeholders[] = ':' . $placeholder;
            $parameters[$placeholder] = $id;
        }
        $statement = $this->pdo->prepare(
            'SELECT pull_request_id, github_check_run_id, name, html_url, status, conclusion,
                    started_at, completed_at, github_updated_at
             FROM issue_pull_request_checks
             WHERE pull_request_id IN (' . implode(', ', $placeholders) . ')
             ORDER BY pull_request_id, github_updated_at DESC, github_check_run_id DESC'
        );
        $statement->execute($parameters);
        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $pullRequestId = (int) $row['pull_request_id'];
            if (count($runsByPullRequest[$pullRequestId]) >= self::MAX_RETURNED_RUNS_PER_PULL_REQUEST) continue;
            $runsByPullRequest[$pullRequestId][] = [
                'id' => (int) $row['github_check_run_id'],
                'name' => $row['name'],
                'html_url' => $row['html_url'],
                'status' => $row['status'],
                'conclusion' => $row['conclusion'],
                'started_at' => $row['started_at'],
                'completed_at' => $row['completed_at'],
                'github_updated_at' => $row['github_updated_at'],
            ];
        }
        return $runsByPullRequest;
    }

    private function prune(int $pullRequestId): void
    {
        $statement = $this->pdo->prepare(
            'DELETE FROM issue_pull_request_checks
             WHERE pull_request_id = :pull_request_id
               AND id NOT IN (
                   SELECT id FROM (
                       SELECT id FROM issue_pull_request_checks
                       WHERE pull_request_id = :recent_pull_request_id
                       ORDER BY github_updated_at DESC, github_check_run_id DESC
                       LIMIT ' . self::MAX_STORED_RUNS_PER_PULL_REQUEST . '
                   ) AS recent_runs
               )'
        );
        $statement->execute([
            'pull_request_id' => $pullRequestId,
            'recent_pull_request_id' => $pullRequestId,
        ]);
    }
}
