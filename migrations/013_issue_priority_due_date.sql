ALTER TABLE issues
    ADD COLUMN priority ENUM('low', 'medium', 'high', 'urgent') NOT NULL DEFAULT 'medium' AFTER status,
    ADD COLUMN due_date DATE NULL DEFAULT NULL AFTER priority;
