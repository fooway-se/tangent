CREATE TABLE IF NOT EXISTS inbox_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    workspace_id BIGINT UNSIGNED NOT NULL,
    recipient_id BIGINT UNSIGNED NOT NULL,
    actor_id BIGINT UNSIGNED NULL,
    event_type ENUM('mention', 'assigned', 'reply', 'status', 'pr') NOT NULL,
    project_id BIGINT UNSIGNED NOT NULL,
    issue_id BIGINT UNSIGNED NULL,
    message_id BIGINT UNSIGNED NULL,
    summary VARCHAR(200) NOT NULL,
    detail VARCHAR(500) NULL,
    read_at TIMESTAMP NULL DEFAULT NULL,
    done_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_inbox_recipient (workspace_id, recipient_id, done_at, id),
    KEY ix_inbox_project (workspace_id, project_id, id),
    CONSTRAINT fk_inbox_recipient FOREIGN KEY (workspace_id, recipient_id)
        REFERENCES users (workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_inbox_project FOREIGN KEY (workspace_id, project_id)
        REFERENCES projects (workspace_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
