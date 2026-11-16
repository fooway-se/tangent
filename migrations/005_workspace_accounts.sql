CREATE TABLE user_accounts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO user_accounts (id)
SELECT id FROM users ORDER BY id;

ALTER TABLE users
    ADD COLUMN account_id BIGINT UNSIGNED NULL AFTER id;

UPDATE users SET account_id = id;

ALTER TABLE users
    MODIFY account_id BIGINT UNSIGNED NOT NULL,
    ADD UNIQUE KEY uq_users_workspace_account (workspace_id, account_id),
    ADD CONSTRAINT fk_users_account FOREIGN KEY (account_id)
        REFERENCES user_accounts (id);
