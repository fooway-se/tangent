ALTER TABLE messages
    ADD COLUMN feed_cursor BIGINT UNSIGNED NULL AFTER is_client_visible,
    ADD KEY ix_messages_workspace_feed_cursor (workspace_id, feed_cursor);

CREATE TABLE IF NOT EXISTS chat_event_sequences (
    workspace_id BIGINT UNSIGNED NOT NULL,
    last_cursor BIGINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (workspace_id),
    CONSTRAINT fk_chat_event_sequences_workspace FOREIGN KEY (workspace_id)
        REFERENCES workspaces (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO chat_event_sequences (workspace_id, last_cursor)
SELECT id, 0 FROM workspaces
ON DUPLICATE KEY UPDATE last_cursor = chat_event_sequences.last_cursor;
