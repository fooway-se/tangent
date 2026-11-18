CREATE TABLE IF NOT EXISTS github_installations (
    workspace_id BIGINT UNSIGNED NOT NULL,
    installation_id BIGINT UNSIGNED NOT NULL,
    account_login VARCHAR(100) NOT NULL,
    connected_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (workspace_id, installation_id),
    UNIQUE KEY uq_github_installations_installation (installation_id),
    CONSTRAINT fk_github_installations_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
    CONSTRAINT fk_github_installations_user FOREIGN KEY (workspace_id, connected_by) REFERENCES users (workspace_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS github_installation_states (
    state_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    workspace_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (state_hash),
    KEY ix_github_installation_state_expiry (expires_at),
    CONSTRAINT fk_github_installation_state_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE,
    CONSTRAINT fk_github_installation_state_user FOREIGN KEY (workspace_id, user_id) REFERENCES users (workspace_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE projects
    ADD COLUMN github_installation_id BIGINT UNSIGNED NULL AFTER archived_from_status,
    ADD COLUMN github_repository_id BIGINT UNSIGNED NULL AFTER github_installation_id,
    ADD COLUMN github_repository_owner VARCHAR(100) NULL AFTER github_repository_id,
    ADD COLUMN github_repository_name VARCHAR(100) NULL AFTER github_repository_owner,
    ADD COLUMN github_repository_full_name VARCHAR(201) NULL AFTER github_repository_name,
    ADD COLUMN github_repository_url VARCHAR(500) NULL AFTER github_repository_full_name;

CREATE TABLE IF NOT EXISTS issue_pull_requests (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    workspace_id BIGINT UNSIGNED NOT NULL,
    project_id BIGINT UNSIGNED NOT NULL,
    issue_id BIGINT UNSIGNED NOT NULL,
    github_installation_id BIGINT UNSIGNED NOT NULL,
    github_repository_id BIGINT UNSIGNED NOT NULL,
    repository_owner VARCHAR(100) NOT NULL,
    repository_name VARCHAR(100) NOT NULL,
    repository_full_name VARCHAR(201) NOT NULL,
    pull_number INT UNSIGNED NOT NULL,
    title VARCHAR(500) NOT NULL,
    html_url VARCHAR(500) NOT NULL,
    state ENUM('open', 'closed', 'merged') NOT NULL,
    is_draft TINYINT(1) NOT NULL DEFAULT 0,
    author_login VARCHAR(100) NOT NULL DEFAULT '',
    github_updated_at DATETIME NOT NULL,
    linked_by BIGINT UNSIGNED NOT NULL,
    linked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_issue_pull_request_identity (workspace_id, github_repository_id, pull_number),
    KEY ix_issue_pull_requests_issue (workspace_id, issue_id, id),
    CONSTRAINT fk_issue_pull_request_project FOREIGN KEY (workspace_id, project_id)
        REFERENCES projects (workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_issue_pull_request_issue FOREIGN KEY (workspace_id, issue_id)
        REFERENCES issues (workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_issue_pull_request_linked_by FOREIGN KEY (workspace_id, linked_by)
        REFERENCES users (workspace_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS github_webhook_deliveries (
    delivery_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (delivery_id),
    KEY ix_github_webhook_deliveries_received (received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
