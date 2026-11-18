CREATE TABLE IF NOT EXISTS project_notes (
    workspace_id BIGINT UNSIGNED NOT NULL,
    project_id BIGINT UNSIGNED NOT NULL,
    content MEDIUMTEXT NOT NULL,
    updated_by BIGINT UNSIGNED NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (workspace_id, project_id),
    CONSTRAINT fk_project_notes_project FOREIGN KEY (workspace_id, project_id)
        REFERENCES projects (workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_project_notes_updater FOREIGN KEY (workspace_id, updated_by)
        REFERENCES users (workspace_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
