CREATE TABLE IF NOT EXISTS channels (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    workspace_id BIGINT UNSIGNED NOT NULL,
    project_id BIGINT UNSIGNED NULL,
    channel_type ENUM('project', 'standalone', 'dm') NOT NULL,
    name VARCHAR(120) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_channels_workspace_id (workspace_id, id),
    UNIQUE KEY uq_channels_project (workspace_id, project_id),
    CONSTRAINT fk_channels_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces (id),
    CONSTRAINT fk_channels_project FOREIGN KEY (workspace_id, project_id)
        REFERENCES projects (workspace_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    workspace_id BIGINT UNSIGNED NOT NULL,
    channel_id BIGINT UNSIGNED NOT NULL,
    author_id BIGINT UNSIGNED NOT NULL,
    parent_id BIGINT UNSIGNED NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_messages_workspace_channel_id (workspace_id, channel_id, id),
    KEY ix_messages_poll (workspace_id, channel_id, id),
    CONSTRAINT fk_messages_channel FOREIGN KEY (workspace_id, channel_id)
        REFERENCES channels (workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_messages_author FOREIGN KEY (workspace_id, author_id)
        REFERENCES users (workspace_id, id),
    CONSTRAINT fk_messages_parent FOREIGN KEY (workspace_id, channel_id, parent_id)
        REFERENCES messages (workspace_id, channel_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO channels (workspace_id, project_id, channel_type)
SELECT p.workspace_id, p.id, 'project'
FROM projects p
LEFT JOIN channels c ON c.workspace_id = p.workspace_id AND c.project_id = p.id
WHERE c.id IS NULL;
