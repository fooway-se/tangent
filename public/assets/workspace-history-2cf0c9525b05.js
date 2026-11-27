export function sameWorkspaceLocation(left, right) {
    if (left.view !== right.view)
        return false;
    if (left.view === 'project' && right.view === 'project') {
        return left.projectId === right.projectId && left.tab === right.tab;
    }
    if (left.view === 'projects' && right.view === 'projects') {
        return left.focusedProjectId === right.focusedProjectId;
    }
    return true;
}
export function createWorkspaceHistory() {
    const locations = [];
    return {
        get length() { return locations.length; },
        record(previous, next) {
            if (sameWorkspaceLocation(previous, next))
                return false;
            locations.push(previous);
            return true;
        },
        pop: () => locations.pop(),
        clear: () => { locations.length = 0; },
    };
}
