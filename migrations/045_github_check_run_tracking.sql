CREATE TABLE IF NOT EXISTS issue_pull_request_checks (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    pull_request_id BIGINT UNSIGNED NOT NULL,
    github_check_run_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(500) NOT NULL,
    html_url VARCHAR(500) NOT NULL,
    status ENUM('queued', 'in_progress', 'completed') NOT NULL,
    conclusion VARCHAR(50) NULL,
    started_at DATETIME NULL,
    completed_at DATETIME NULL,
    github_updated_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_issue_pull_request_check_run (pull_request_id, github_check_run_id),
    KEY ix_issue_pull_request_checks_recent (pull_request_id, github_updated_at, github_check_run_id),
    CONSTRAINT fk_issue_pull_request_check_pull_request FOREIGN KEY (pull_request_id)
        REFERENCES issue_pull_requests (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
