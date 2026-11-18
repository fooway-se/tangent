CREATE TABLE IF NOT EXISTS issue_discussion_messages (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    workspace_id BIGINT UNSIGNED NOT NULL,
    issue_id BIGINT UNSIGNED NOT NULL,
    author_id BIGINT UNSIGNED NOT NULL,
    parent_id BIGINT UNSIGNED NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_issue_discussion_workspace_issue_id (workspace_id, issue_id, id),
    CONSTRAINT fk_issue_discussion_issue FOREIGN KEY (workspace_id, issue_id)
        REFERENCES issues (workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_issue_discussion_author FOREIGN KEY (workspace_id, author_id)
        REFERENCES users (workspace_id, id),
    CONSTRAINT fk_issue_discussion_parent FOREIGN KEY (workspace_id, issue_id, parent_id)
        REFERENCES issue_discussion_messages (workspace_id, issue_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
