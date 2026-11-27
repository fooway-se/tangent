DROP TEMPORARY TABLE IF EXISTS scratchpad_notes_latest;

CREATE TEMPORARY TABLE scratchpad_notes_latest (
    workspace_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    id BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (workspace_id, user_id)
) ENGINE=InnoDB;

INSERT INTO scratchpad_notes_latest (workspace_id, user_id, id)
SELECT newest.workspace_id, newest.user_id, MAX(notes.id)
FROM scratchpad_notes AS notes
JOIN (
    SELECT workspace_id, user_id, MAX(updated_at) AS updated_at
    FROM scratchpad_notes
    GROUP BY workspace_id, user_id
) AS newest
  ON newest.workspace_id = notes.workspace_id
 AND newest.user_id = notes.user_id
 AND newest.updated_at = notes.updated_at
GROUP BY newest.workspace_id, newest.user_id;

DELETE notes
FROM scratchpad_notes AS notes
LEFT JOIN scratchpad_notes_latest AS newest
  ON newest.workspace_id = notes.workspace_id
 AND newest.user_id = notes.user_id
 AND newest.id = notes.id
WHERE newest.id IS NULL;

DROP TEMPORARY TABLE scratchpad_notes_latest;

ALTER TABLE scratchpad_notes
    DROP PRIMARY KEY,
    DROP INDEX ix_scratchpad_notes_owner,
    DROP COLUMN id,
    DROP COLUMN created_at,
    ADD PRIMARY KEY (workspace_id, user_id);
