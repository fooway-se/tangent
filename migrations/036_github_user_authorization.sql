DELETE FROM github_installation_states;

ALTER TABLE github_installation_states
    ADD COLUMN session_token_id BIGINT UNSIGNED NOT NULL AFTER user_id,
    ADD COLUMN installation_id BIGINT UNSIGNED NULL AFTER session_token_id,
    ADD CONSTRAINT fk_github_installation_state_session
        FOREIGN KEY (session_token_id) REFERENCES api_tokens (id) ON DELETE CASCADE;
