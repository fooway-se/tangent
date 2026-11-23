CREATE TABLE IF NOT EXISTS workspace_realtime_cursors (
    workspace_id BIGINT UNSIGNED NOT NULL,
    last_cursor BIGINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (workspace_id),
    CONSTRAINT fk_workspace_realtime_cursors_workspace FOREIGN KEY (workspace_id)
        REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
