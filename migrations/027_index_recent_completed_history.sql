ALTER TABLE issue_status_history
    DROP INDEX ix_issue_status_history_created,
    ADD KEY ix_issue_status_history_done_created (workspace_id, to_status, created_at, issue_id);
