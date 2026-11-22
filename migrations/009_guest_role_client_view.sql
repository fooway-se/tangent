ALTER TABLE users
    MODIFY COLUMN role ENUM('admin', 'developer', 'guest') NOT NULL DEFAULT 'developer';

CREATE TABLE IF NOT EXISTS milestones (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    workspace_id BIGINT UNSIGNED NOT NULL,
    project_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(120) NOT NULL,
    due_date DATE NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_milestones_workspace_id (workspace_id, id),
    KEY ix_milestones_project (workspace_id, project_id, due_date),
    CONSTRAINT fk_milestones_project FOREIGN KEY (workspace_id, project_id)
        REFERENCES projects (workspace_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE issues ADD COLUMN is_shared TINYINT(1) NOT NULL DEFAULT 0 AFTER assignee_id;
ALTER TABLE issues ADD COLUMN milestone_id BIGINT UNSIGNED NULL DEFAULT NULL AFTER is_shared;
ALTER TABLE issues ADD COLUMN approval_requested_at TIMESTAMP NULL DEFAULT NULL AFTER milestone_id;
ALTER TABLE issues ADD COLUMN approved_by BIGINT UNSIGNED NULL DEFAULT NULL AFTER approval_requested_at;
ALTER TABLE issues ADD COLUMN approved_at TIMESTAMP NULL DEFAULT NULL AFTER approved_by;
ALTER TABLE issues ADD KEY ix_issues_shared (workspace_id, project_id, is_shared, deleted_at, status);
ALTER TABLE issues ADD CONSTRAINT fk_issues_milestone FOREIGN KEY (workspace_id, milestone_id)
    REFERENCES milestones (workspace_id, id);
ALTER TABLE issues ADD CONSTRAINT fk_issues_approved_by FOREIGN KEY (workspace_id, approved_by)
    REFERENCES users (workspace_id, id);

ALTER TABLE messages ADD COLUMN is_client_visible TINYINT(1) NOT NULL DEFAULT 0 AFTER body;

CREATE TABLE IF NOT EXISTS issue_status_history (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    workspace_id BIGINT UNSIGNED NOT NULL,
    issue_id BIGINT UNSIGNED NOT NULL,
    actor_id BIGINT UNSIGNED NULL,
    from_status ENUM('backlog', 'todo', 'doing', 'done', 'cancelled') NULL,
    to_status ENUM('backlog', 'todo', 'doing', 'done', 'cancelled') NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY ix_issue_status_history_issue (workspace_id, issue_id, id),
    KEY ix_issue_status_history_created (workspace_id, created_at, issue_id),
    CONSTRAINT fk_issue_status_history_issue FOREIGN KEY (workspace_id, issue_id)
        REFERENCES issues (workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_issue_status_history_actor FOREIGN KEY (workspace_id, actor_id)
        REFERENCES users (workspace_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
