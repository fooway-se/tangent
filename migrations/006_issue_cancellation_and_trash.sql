ALTER TABLE issues
    MODIFY COLUMN status ENUM('backlog', 'todo', 'doing', 'done', 'cancelled') NOT NULL DEFAULT 'backlog',
    ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at,
    ADD KEY ix_issues_project_deleted (workspace_id, project_id, deleted_at, id);
