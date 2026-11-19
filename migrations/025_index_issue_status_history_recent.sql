ALTER TABLE issue_status_history
    ADD KEY ix_issue_status_history_workspace_recent (workspace_id, id);
