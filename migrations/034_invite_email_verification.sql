ALTER TABLE credential_tokens
    ADD COLUMN email_verification_hash CHAR(64) NULL AFTER token_hash;

UPDATE credential_tokens AS invite
SET invite.revoked_at = UTC_TIMESTAMP()
WHERE invite.token_type = 'invite'
  AND invite.used_at IS NULL
  AND invite.revoked_at IS NULL
  AND invite.email_verification_hash IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM user_accounts AS account WHERE account.email = invite.email
  );
