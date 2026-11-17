ALTER TABLE issues
    ADD COLUMN sort_order BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER milestone_id,
    ADD KEY ix_issues_milestone_order (workspace_id, project_id, milestone_id, deleted_at, sort_order, id);

UPDATE issues SET sort_order = id WHERE sort_order = 0;
