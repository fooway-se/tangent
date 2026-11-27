DELETE earlier
FROM scratchpad_notes earlier
JOIN scratchpad_notes later
  ON later.workspace_id = earlier.workspace_id
 AND later.user_id = earlier.user_id
 AND (
      later.updated_at > earlier.updated_at
      OR (later.updated_at = earlier.updated_at AND later.id > earlier.id)
 );

ALTER TABLE scratchpad_notes
    DROP PRIMARY KEY,
    DROP INDEX ix_scratchpad_notes_owner,
    DROP COLUMN id,
    DROP COLUMN created_at,
    ADD PRIMARY KEY (workspace_id, user_id);
