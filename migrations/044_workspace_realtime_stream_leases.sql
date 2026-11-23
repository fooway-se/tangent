CREATE TABLE IF NOT EXISTS workspace_realtime_stream_mutex (
    id TINYINT UNSIGNED NOT NULL PRIMARY KEY
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO workspace_realtime_stream_mutex (id) VALUES (1);

CREATE TABLE IF NOT EXISTS workspace_realtime_stream_leases (
    lease_id CHAR(32) NOT NULL,
    workspace_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    expires_at DATETIME NOT NULL,
    PRIMARY KEY (lease_id),
    UNIQUE KEY uq_realtime_stream_workspace_user (workspace_id, user_id),
    KEY idx_realtime_stream_lease_expiry (expires_at),
    CONSTRAINT fk_realtime_stream_lease_workspace FOREIGN KEY (workspace_id)
        REFERENCES workspaces (id) ON DELETE CASCADE,
    CONSTRAINT fk_realtime_stream_lease_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
