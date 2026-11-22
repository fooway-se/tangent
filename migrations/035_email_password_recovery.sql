UPDATE credential_tokens
SET revoked_at = UTC_TIMESTAMP()
WHERE token_type = 'password_reset'
  AND used_at IS NULL
  AND revoked_at IS NULL;
