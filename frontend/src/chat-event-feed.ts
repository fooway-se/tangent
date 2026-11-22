export interface ChatFeedEvent {
  id: number;
  feed_cursor: number;
  project_id: number;
}

export class ChatEventFeed {
  private lastCursor = 0;

  get cursor(): number {
    return this.lastCursor;
  }

  requestQuery(): string {
    return `?cursor=${this.lastCursor}`;
  }

  reset(): void {
    this.lastCursor = 0;
  }

  consume<Event extends ChatFeedEvent>(
    events: readonly Event[],
    activeProjectId: number,
    isRendered: (messageId: number) => boolean,
    render: (event: Event) => void,
  ): void {
    for (const event of events) {
      this.lastCursor = Math.max(this.lastCursor, event.feed_cursor);
      if (event.project_id !== activeProjectId || isRendered(event.id)) continue;
      render(event);
    }
  }
}
