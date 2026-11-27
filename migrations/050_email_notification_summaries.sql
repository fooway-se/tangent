ALTER TABLE issues ADD COLUMN is_blocked TINYINT(1) NOT NULL DEFAULT 0 AFTER is_ongoing;
ALTER TABLE issues ADD COLUMN blocked_at DATETIME NULL DEFAULT NULL AFTER is_blocked;
ALTER TABLE issues ADD COLUMN blocking_reason VARCHAR(500) NULL DEFAULT NULL AFTER blocked_at;
ALTER TABLE issues ADD KEY ix_issues_blocked_due (workspace_id, is_blocked, blocked_at, status);

CREATE TABLE email_notification_preferences (
    workspace_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    enabled TINYINT(1) NOT NULL DEFAULT 0,
    frequency ENUM('daily', 'every_other_day', 'weekly') NOT NULL DEFAULT 'daily',
    time_zone VARCHAR(64) NOT NULL DEFAULT 'UTC',
    schedule_anchor_date DATE NOT NULL,
    next_send_at DATETIME NULL DEFAULT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (workspace_id, user_id),
    KEY ix_email_notification_due (workspace_id, enabled, next_send_at),
    CONSTRAINT fk_email_notification_preferences_user FOREIGN KEY (workspace_id, user_id)
        REFERENCES users (workspace_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE email_notification_deliveries (
    workspace_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    scheduled_slot DATETIME NOT NULL,
    sent_at DATETIME NOT NULL,
    PRIMARY KEY (workspace_id, user_id, scheduled_slot),
    CONSTRAINT fk_email_notification_deliveries_user FOREIGN KEY (workspace_id, user_id)
        REFERENCES users (workspace_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
