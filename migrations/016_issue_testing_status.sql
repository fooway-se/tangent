ALTER TABLE issues
    MODIFY COLUMN status ENUM('backlog', 'todo', 'doing', 'testing', 'done', 'cancelled') NOT NULL DEFAULT 'backlog';

ALTER TABLE issue_status_history
    MODIFY COLUMN from_status ENUM('backlog', 'todo', 'doing', 'testing', 'done', 'cancelled') NULL,
    MODIFY COLUMN to_status ENUM('backlog', 'todo', 'doing', 'testing', 'done', 'cancelled') NOT NULL;
