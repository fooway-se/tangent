ALTER TABLE inbox_events
    ADD KEY ix_inbox_unread_by_project (workspace_id, recipient_id, read_at, project_id);
