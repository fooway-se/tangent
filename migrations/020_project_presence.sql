CREATE TABLE IF NOT EXISTS project_presence (
    workspace_id BIGINT UNSIGNED NOT NULL,
    project_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    last_seen_at DATETIME NOT NULL,
    PRIMARY KEY (workspace_id, project_id, user_id),
    KEY ix_project_presence_expiry (workspace_id, project_id, last_seen_at),
    CONSTRAINT fk_project_presence_project FOREIGN KEY (workspace_id, project_id)
        REFERENCES projects (workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_project_presence_user FOREIGN KEY (workspace_id, user_id)
        REFERENCES users (workspace_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
