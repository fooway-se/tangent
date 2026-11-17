ALTER TABLE user_accounts
    ADD COLUMN email VARCHAR(254) NULL AFTER id,
    ADD COLUMN password_hash VARCHAR(255) NULL AFTER email;

DELETE account
FROM user_accounts account
LEFT JOIN users membership ON membership.account_id = account.id
WHERE membership.id IS NULL;

UPDATE user_accounts account
SET email = (
        SELECT LOWER(TRIM(membership.email))
        FROM users membership
        WHERE membership.account_id = account.id
        ORDER BY membership.id
        LIMIT 1
    ),
    password_hash = (
        SELECT membership.password_hash
        FROM users membership
        WHERE membership.account_id = account.id
        ORDER BY membership.id
        LIMIT 1
    );

UPDATE users membership
INNER JOIN user_accounts account ON account.id = membership.account_id
INNER JOIN (
    SELECT email, MIN(id) AS canonical_account_id
    FROM user_accounts
    GROUP BY email
    HAVING COUNT(*) > 1
) duplicate_accounts ON duplicate_accounts.email = account.email
SET membership.account_id = duplicate_accounts.canonical_account_id;

DELETE account
FROM user_accounts account
INNER JOIN (
    SELECT email, MIN(id) AS canonical_account_id
    FROM user_accounts
    GROUP BY email
    HAVING COUNT(*) > 1
) duplicate_accounts ON duplicate_accounts.email = account.email
WHERE account.id <> duplicate_accounts.canonical_account_id;

ALTER TABLE user_accounts
    MODIFY email VARCHAR(254) NOT NULL,
    MODIFY password_hash VARCHAR(255) NOT NULL,
    ADD UNIQUE KEY uq_user_accounts_email (email);

ALTER TABLE users DROP COLUMN password_hash;

CREATE TABLE credential_tokens (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    workspace_id BIGINT UNSIGNED NOT NULL,
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    token_type ENUM('invite', 'password_reset') NOT NULL,
    account_id BIGINT UNSIGNED NULL,
    email VARCHAR(254) NOT NULL,
    name VARCHAR(120) NULL,
    role ENUM('developer', 'guest') NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    revoked_at DATETIME NULL,
    created_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_credential_tokens_hash (token_hash),
    UNIQUE KEY uq_credential_tokens_workspace_id (workspace_id, id),
    KEY ix_credential_tokens_invites (workspace_id, token_type, email, used_at, revoked_at),
    KEY ix_credential_tokens_account (account_id, token_type, used_at, revoked_at),
    CONSTRAINT fk_credential_tokens_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces (id),
    CONSTRAINT fk_credential_tokens_account FOREIGN KEY (account_id) REFERENCES user_accounts (id),
    CONSTRAINT fk_credential_tokens_creator FOREIGN KEY (workspace_id, created_by)
        REFERENCES users (workspace_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE credential_token_projects (
    workspace_id BIGINT UNSIGNED NOT NULL,
    credential_token_id BIGINT UNSIGNED NOT NULL,
    project_id BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (workspace_id, credential_token_id, project_id),
    CONSTRAINT fk_credential_token_projects_token FOREIGN KEY (workspace_id, credential_token_id)
        REFERENCES credential_tokens (workspace_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_credential_token_projects_project FOREIGN KEY (workspace_id, project_id)
        REFERENCES projects (workspace_id, id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
