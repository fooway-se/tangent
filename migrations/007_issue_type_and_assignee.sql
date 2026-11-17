ALTER TABLE issues
    ADD COLUMN issue_type ENUM('task', 'bug', 'feature', 'research', 'maintenance') NOT NULL DEFAULT 'task' AFTER description,
    ADD COLUMN assignee_id BIGINT UNSIGNED NULL DEFAULT NULL AFTER created_by,
    ADD KEY ix_issues_assignee (workspace_id, assignee_id, deleted_at, project_id, status),
    ADD CONSTRAINT fk_issues_assignee FOREIGN KEY (workspace_id, assignee_id)
        REFERENCES users (workspace_id, id);
