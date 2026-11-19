UPDATE messages target
INNER JOIN (
    WITH RECURSIVE client_conversation (workspace_id, channel_id, id, parent_id) AS (
        SELECT workspace_id, channel_id, id, parent_id
        FROM messages
        WHERE parent_id IS NULL AND is_client_visible = 1
        UNION ALL
        SELECT child.workspace_id, child.channel_id, child.id, child.parent_id
        FROM messages child
        INNER JOIN client_conversation parent
          ON child.workspace_id = parent.workspace_id
         AND child.channel_id = parent.channel_id
         AND child.parent_id = parent.id
    )
    SELECT workspace_id, channel_id, id FROM client_conversation
) visible_messages
  ON visible_messages.workspace_id = target.workspace_id
 AND visible_messages.channel_id = target.channel_id
 AND visible_messages.id = target.id
SET target.is_client_visible = 1
WHERE target.is_client_visible = 0;

ALTER TABLE messages
    ADD KEY ix_messages_client_visibility (workspace_id, channel_id, is_client_visible, id);
