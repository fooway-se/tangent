SET FOREIGN_KEY_CHECKS = 0;

CREATE TEMPORARY TABLE lounge_channel_canonical (
    workspace_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    channel_id BIGINT UNSIGNED NOT NULL
) ENGINE=InnoDB;

INSERT INTO lounge_channel_canonical (workspace_id, channel_id)
SELECT workspace_id, MIN(id)
FROM channels
WHERE channel_type = 'standalone' AND name = 'Lounge'
GROUP BY workspace_id;

UPDATE issues AS i
INNER JOIN channels AS duplicate
    ON duplicate.workspace_id = i.workspace_id AND duplicate.id = i.source_channel_id
INNER JOIN lounge_channel_canonical AS canonical
    ON canonical.workspace_id = duplicate.workspace_id
SET i.source_channel_id = canonical.channel_id
WHERE duplicate.channel_type = 'standalone'
  AND duplicate.name = 'Lounge'
  AND duplicate.id <> canonical.channel_id;

UPDATE messages AS m
INNER JOIN channels AS duplicate
    ON duplicate.workspace_id = m.workspace_id AND duplicate.id = m.channel_id
INNER JOIN lounge_channel_canonical AS canonical
    ON canonical.workspace_id = duplicate.workspace_id
SET m.channel_id = canonical.channel_id
WHERE duplicate.channel_type = 'standalone'
  AND duplicate.name = 'Lounge'
  AND duplicate.id <> canonical.channel_id;

DELETE duplicate
FROM channels AS duplicate
INNER JOIN lounge_channel_canonical AS canonical
    ON canonical.workspace_id = duplicate.workspace_id
WHERE duplicate.channel_type = 'standalone'
  AND duplicate.name = 'Lounge'
  AND duplicate.id <> canonical.channel_id;

DROP TEMPORARY TABLE lounge_channel_canonical;
SET FOREIGN_KEY_CHECKS = 1;

ALTER TABLE channels
    ADD UNIQUE KEY uq_channels_workspace_type_name (workspace_id, channel_type, name);
