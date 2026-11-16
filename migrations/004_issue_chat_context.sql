ALTER TABLE issues
    ADD COLUMN source_channel_id BIGINT UNSIGNED NULL AFTER created_by,
    ADD COLUMN source_message_id BIGINT UNSIGNED NULL AFTER source_channel_id,
    ADD KEY ix_issues_source_message (workspace_id, source_channel_id, source_message_id),
    ADD CONSTRAINT ck_issues_source_message_pair CHECK (
        (source_channel_id IS NULL AND source_message_id IS NULL)
        OR (source_channel_id IS NOT NULL AND source_message_id IS NOT NULL)
    ),
    ADD CONSTRAINT fk_issues_source_message FOREIGN KEY (workspace_id, source_channel_id, source_message_id)
        REFERENCES messages (workspace_id, channel_id, id) ON DELETE CASCADE;
