ALTER TABLE messages
    ADD KEY ix_messages_workspace_recent (workspace_id, id);
