ALTER TABLE projects
    MODIFY COLUMN status ENUM('active', 'paused', 'completed', 'archived') NOT NULL DEFAULT 'active',
    ADD COLUMN archived_from_status ENUM('active', 'paused', 'completed') NULL DEFAULT NULL AFTER status;

UPDATE projects
SET archived_from_status = 'active'
WHERE status = 'archived' AND archived_from_status IS NULL;
