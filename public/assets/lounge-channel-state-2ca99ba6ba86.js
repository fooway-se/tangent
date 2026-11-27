export function latestChatFeedCursor(etag, events) {
    const etagCursor = etag?.match(/^"events-\d+-(\d+)"$/)?.[1];
    return events.reduce((cursor, event) => Math.max(cursor, event.feed_cursor), etagCursor === undefined ? 0 : Number(etagCursor));
}
export function addUnreadChatEvents(state, events, selectedProjectId, currentUserId) {
    const unreadByProject = { ...state.unreadByProject };
    let cursor = state.cursor;
    for (const event of events) {
        cursor = Math.max(cursor, event.feed_cursor);
        if (event.project_id === selectedProjectId || event.author_id === currentUserId)
            continue;
        unreadByProject[event.project_id] = (unreadByProject[event.project_id] ?? 0) + 1;
    }
    return { cursor, unreadByProject };
}
export function markChatChannelRead(state, projectId) {
    const unreadByProject = { ...state.unreadByProject };
    delete unreadByProject[projectId];
    return { cursor: state.cursor, unreadByProject };
}
export function parseLoungeChannelUnreadState(value) {
    if (value === null)
        return null;
    try {
        const parsed = JSON.parse(value);
        if (typeof parsed !== 'object' || parsed === null)
            return null;
        const candidate = parsed;
        if (!Number.isSafeInteger(candidate.cursor) || (candidate.cursor ?? -1) < 0
            || typeof candidate.unreadByProject !== 'object' || candidate.unreadByProject === null
            || Array.isArray(candidate.unreadByProject))
            return null;
        const unreadByProject = {};
        for (const [projectId, count] of Object.entries(candidate.unreadByProject)) {
            const numericProjectId = Number(projectId);
            if (!Number.isSafeInteger(numericProjectId) || numericProjectId < 1
                || !Number.isSafeInteger(count) || (count ?? -1) < 1)
                return null;
            unreadByProject[numericProjectId] = count;
        }
        return { cursor: candidate.cursor, unreadByProject };
    }
    catch {
        return null;
    }
}
