CREATE TABLE IF NOT EXISTS project_issue_revisions (
    workspace_id BIGINT UNSIGNED NOT NULL,
    project_id BIGINT UNSIGNED NOT NULL,
    active_revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
    deleted_revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
    task_revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (workspace_id, project_id),
    CONSTRAINT fk_project_issue_revisions_project FOREIGN KEY (workspace_id, project_id)
        REFERENCES projects (workspace_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO project_issue_revisions (workspace_id, project_id, active_revision, deleted_revision, task_revision)
SELECT workspace_id, id, 1, 1, 1 FROM projects
ON DUPLICATE KEY UPDATE active_revision = active_revision;
