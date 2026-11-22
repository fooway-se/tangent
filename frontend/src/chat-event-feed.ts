export interface ChatFeedEvent {
  id: number;
  feed_cursor: number;
  project_id: number;
}

export interface ProjectChatPollResult {
  status: number;
  notModified: boolean;
  events: ChatFeedEvent[];
  etag: string | null;
  nextDelay: number;
  errorMessage?: string;
}

export async function pollProjectChatEvents(
  fetcher: typeof fetch,
  apiBaseUrl: string,
  projectId: number,
  cursorQuery: string,
  currentEtag: string | null,
  currentDelay: number,
): Promise<ProjectChatPollResult> {
  const headers = new Headers();
  if (currentEtag !== null) headers.set('If-None-Match', currentEtag);
  const response = await fetcher(
    `${apiBaseUrl.replace(/\/$/, '')}/projects/${projectId}/events${cursorQuery}`,
    { headers, credentials: 'same-origin' },
  );

  if (response.status === 304) {
    return {
      status: response.status,
      notModified: true,
      events: [],
      etag: currentEtag,
      nextDelay: Math.min(10_000, currentDelay * 1.5),
    };
  }

  const payload = await response.json() as {
    events?: ChatFeedEvent[];
    error?: { message?: string };
  };
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
