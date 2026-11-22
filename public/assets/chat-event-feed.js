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
