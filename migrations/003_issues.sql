CREATE TABLE IF NOT EXISTS issues (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    workspace_id BIGINT UNSIGNED NOT NULL,
    project_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    status ENUM('backlog', 'todo', 'doing', 'done') NOT NULL DEFAULT 'backlog',
    created_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_issues_workspace_id (workspace_id, id),
    KEY ix_issues_project_status_id (workspace_id, project_id, status, id),
    CONSTRAINT fk_issues_project FOREIGN KEY (workspace_id, project_id)
        REFERENCES projects (workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_issues_creator FOREIGN KEY (workspace_id, created_by)
        REFERENCES users (workspace_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
