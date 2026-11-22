export function diffConditionalIssueCollections(previousActive, nextActive, previousDeleted, nextDeleted) {
    return {
        active: nextActive === null ? null : diffIssueCollections(previousActive, nextActive),
        deleted: nextDeleted === null ? null : diffIssueCollections(previousDeleted, nextDeleted),
    };
}
export function diffIssueCollections(previous, next) {
    const previousById = new Map(previous.map((issue) => [issue.id, issue]));
    const nextById = new Map(next.map((issue) => [issue.id, issue]));
    const added = [];
    const changed = [];
    const removed = [];
    for (const issue of next) {
        const previousIssue = previousById.get(issue.id);
        if (previousIssue === undefined) {
            added.push(issue.id);
        }
        else if (previousIssue !== issue && issueSignature(previousIssue) !== issueSignature(issue)) {
            changed.push(issue.id);
        }
    }
    for (const issue of previous) {
        if (!nextById.has(issue.id))
            removed.push(issue.id);
    }
    return { added, changed, removed };
}
export function nextIssuePollDelay(currentDelay, changed, hidden) {
    if (hidden)
        return Math.min(10_000, Math.max(5_000, Math.round(currentDelay * 1.5)));
    if (changed)
        return 1_000;
    return Math.min(10_000, Math.round(currentDelay * 1.5));
}
export function shouldDeferIssueUpdates(state) {
    return state.issueEditorOpen === true
        || state.quickAddActive === true
        || state.filterFocused === true
        || state.dialogOpen === true;
}
function issueSignature(issue) {
    return JSON.stringify(Object.entries(issue).sort(([left], [right]) => left.localeCompare(right)));
}
