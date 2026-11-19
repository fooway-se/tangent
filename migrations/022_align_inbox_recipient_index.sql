ALTER TABLE inbox_events
    DROP INDEX ix_inbox_recipient,
    ADD KEY ix_inbox_recipient_id (workspace_id, recipient_id, id);
