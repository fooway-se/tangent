CREATE TABLE IF NOT EXISTS lounge_presence (
    workspace_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    last_seen_at DATETIME NOT NULL,
    PRIMARY KEY (workspace_id, user_id),
    KEY ix_lounge_presence_expiry (workspace_id, last_seen_at),
    CONSTRAINT fk_lounge_presence_user FOREIGN KEY (workspace_id, user_id)
        REFERENCES users (workspace_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
