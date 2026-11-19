ALTER TABLE channels
    ADD UNIQUE KEY uq_channels_workspace_type_name (workspace_id, channel_type, name);
