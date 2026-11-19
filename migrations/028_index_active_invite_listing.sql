ALTER TABLE credential_tokens
    ADD KEY ix_credential_tokens_active_invites (workspace_id, token_type, used_at, revoked_at, created_at, id);
