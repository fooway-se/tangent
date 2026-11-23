CREATE TABLE agent_identities (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    workspace_id BIGINT UNSIGNED NOT NULL,
    owner_user_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(120) NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_agent_identities_workspace_id (workspace_id, id),
    UNIQUE KEY uq_agent_identities_workspace_owner (workspace_id, id, owner_user_id),
    KEY ix_agent_identities_owner (workspace_id, owner_user_id, is_active),
    CONSTRAINT fk_agent_identities_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces (id),
    CONSTRAINT fk_agent_identities_owner FOREIGN KEY (workspace_id, owner_user_id)
        REFERENCES users (workspace_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE agent_identity_projects (
    workspace_id BIGINT UNSIGNED NOT NULL,
    agent_id BIGINT UNSIGNED NOT NULL,
    project_id BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (workspace_id, agent_id, project_id),
    KEY ix_agent_identity_projects_project (workspace_id, project_id, agent_id),
    CONSTRAINT fk_agent_identity_projects_agent FOREIGN KEY (workspace_id, agent_id)
        REFERENCES agent_identities (workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_agent_identity_projects_project FOREIGN KEY (workspace_id, project_id)
        REFERENCES projects (workspace_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE agent_identity_capabilities (
    workspace_id BIGINT UNSIGNED NOT NULL,
    agent_id BIGINT UNSIGNED NOT NULL,
    capability ENUM('issues.read', 'issues.comment', 'issues.status.update') NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (workspace_id, agent_id, capability),
    CONSTRAINT fk_agent_identity_capabilities_agent FOREIGN KEY (workspace_id, agent_id)
        REFERENCES agent_identities (workspace_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE api_tokens
    ADD COLUMN agent_id BIGINT UNSIGNED NULL AFTER user_id;

ALTER TABLE api_tokens
    ADD KEY ix_api_tokens_agent (workspace_id, agent_id, revoked_at);

ALTER TABLE api_tokens
    ADD CONSTRAINT fk_api_tokens_agent_owner FOREIGN KEY (workspace_id, agent_id, user_id)
        REFERENCES agent_identities (workspace_id, id, owner_user_id);

ALTER TABLE issue_discussion_messages
    ADD COLUMN author_agent_id BIGINT UNSIGNED NULL AFTER author_id;

ALTER TABLE issue_discussion_messages
    ADD KEY ix_issue_discussion_agent (workspace_id, author_agent_id);

ALTER TABLE issue_discussion_messages
    ADD CONSTRAINT fk_issue_discussion_agent_owner FOREIGN KEY (workspace_id, author_agent_id, author_id)
        REFERENCES agent_identities (workspace_id, id, owner_user_id);

ALTER TABLE issue_status_history
    ADD COLUMN agent_id BIGINT UNSIGNED NULL AFTER actor_id;

ALTER TABLE issue_status_history
    ADD KEY ix_issue_status_history_agent (workspace_id, agent_id);

ALTER TABLE issue_status_history
    ADD CONSTRAINT fk_issue_status_history_agent_owner FOREIGN KEY (workspace_id, agent_id, actor_id)
        REFERENCES agent_identities (workspace_id, id, owner_user_id);
