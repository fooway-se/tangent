ALTER TABLE rate_limits
    ADD KEY ix_rate_limits_workspace_window (workspace_id, window_started_at);
