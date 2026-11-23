ALTER TABLE inbox_events
    MODIFY event_type ENUM('mention', 'assigned', 'reply', 'status', 'pr', 'commit') NOT NULL;

CREATE TABLE IF NOT EXISTS issue_commits (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    workspace_id BIGINT UNSIGNED NOT NULL,
    project_id BIGINT UNSIGNED NOT NULL,
    issue_id BIGINT UNSIGNED NOT NULL,
    github_repository_id BIGINT UNSIGNED NOT NULL,
    repository_full_name VARCHAR(201) NOT NULL,
    sha CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    message VARCHAR(500) NOT NULL,
    html_url VARCHAR(500) NOT NULL,
    author_login VARCHAR(100) NOT NULL DEFAULT '',
    committed_at DATETIME NOT NULL,
    recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_issue_commit_identity (workspace_id, issue_id, github_repository_id, sha),
    KEY ix_issue_commits_history (workspace_id, issue_id, committed_at, id),
    CONSTRAINT fk_issue_commit_project FOREIGN KEY (workspace_id, project_id)
        REFERENCES projects (workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_issue_commit_issue FOREIGN KEY (workspace_id, issue_id)
        REFERENCES issues (workspace_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
