export const PROJECT_STATUS_LABELS = {
    active: 'Active',
    paused: 'Paused',
    completed: 'Completed',
    archived: 'Archived',
};
export const PROJECT_STATUS_HINTS = {
    active: 'Normal work.',
    paused: 'Temporarily on hold; it can be resumed. The project and its history remain available.',
    completed: 'Finished and read-only. An admin can reopen it. Small follow-up work can stay in this project; a distinct engagement can start a new one.',
    archived: 'A housekeeping state that moves the project out of the active list while keeping its history. Existing members and guests can still view it read-only.',
};
export const PROJECT_STATUS_ORDER = {
    active: 0,
    paused: 1,
    completed: 2,
    archived: 3,
};
export const ISSUE_STATUS_OPTIONS = [
    { value: 'backlog', label: 'Backlog' },
    { value: 'todo', label: 'Todo' },
    { value: 'doing', label: 'Doing' },
    { value: 'testing', label: 'Testing' },
    { value: 'done', label: 'Done' },
    { value: 'cancelled', label: 'Cancelled' },
];
export const ISSUE_TYPE_OPTIONS = [
    { value: 'task', label: 'Task' },
    { value: 'bug', label: 'Bug' },
    { value: 'feature', label: 'Feature' },
    { value: 'research', label: 'Research' },
    { value: 'maintenance', label: 'Maintenance' },
];
