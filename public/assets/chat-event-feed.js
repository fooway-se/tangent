export async function pollProjectChatEvents(fetcher, apiBaseUrl, projectId, cursorQuery, currentEtag, currentDelay) {
    const headers = new Headers();
    if (currentEtag !== null)
        headers.set('If-None-Match', currentEtag);
    const response = await fetcher(`${apiBaseUrl.replace(/\/$/, '')}/projects/${projectId}/events${cursorQuery}`, { headers, credentials: 'same-origin' });
    if (response.status === 304) {
        return {
            status: response.status,
            notModified: true,
            events: [],
            etag: currentEtag,
            nextDelay: Math.min(10_000, currentDelay * 1.5),
        };
    }
    const payload = await response.json();
    const events = payload.events ?? [];
    return {
        status: response.status,
        notModified: false,
        events,
        etag: response.headers.get('ETag'),
        nextDelay: response.ok
            ? events.length > 0 ? 1_000 : Math.min(10_000, currentDelay * 1.5)
            : currentDelay,
        errorMessage: payload.error?.message,
    };
}
export class ChatEventFeed {
    lastCursor = 0;
    get cursor() {
        return this.lastCursor;
    }
    requestQuery() {
        return `?cursor=${this.lastCursor}`;
    }
    reset() {
        this.lastCursor = 0;
    }
    consume(events, activeProjectId, isRendered, render) {
        for (const event of events) {
            this.lastCursor = Math.max(this.lastCursor, event.feed_cursor);
            if (event.project_id !== activeProjectId || isRendered(event.id))
                continue;
            render(event);
        }
    }
}
