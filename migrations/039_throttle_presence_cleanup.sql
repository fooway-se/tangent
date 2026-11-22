CREATE TABLE IF NOT EXISTS presence_cleanup_state (
    workspace_id BIGINT UNSIGNED NOT NULL,
    project_id BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Zero represents workspace-wide Lounge cleanup.',
    last_cleaned_at DATETIME NOT NULL,
    PRIMARY KEY (workspace_id, project_id),
    CONSTRAINT fk_presence_cleanup_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
