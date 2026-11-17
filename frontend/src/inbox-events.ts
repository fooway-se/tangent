export type InboxEventType = 'mention' | 'assigned' | 'reply' | 'status' | 'pr';
export type InboxTab = 'unread' | 'all' | 'mentions' | 'assigned' | 'done';

export interface InboxEvent {
  id: number;
  type: InboxEventType;
  actor_name: string;
  summary: string;
  detail: string | null;
  project_id: number;
  project_name: string;
  issue_id: number | null;
  message_id: number | null;
  read: boolean;
  done: boolean;
  created_at: string;
}

export const INBOX_TABS: ReadonlyArray<{ id: InboxTab; label: string }> = [
  { id: 'unread', label: 'Unread' },
  { id: 'all', label: 'All' },
  { id: 'mentions', label: 'Mentions' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'done', label: 'Done' },
];

const ICONS: Record<InboxEventType, string> = {
  mention: '@',
  assigned: '→',
  reply: '↩',
  status: '●',
  pr: '⑂',
};

export function iconFor(type: InboxEventType): string {
  return ICONS[type];
}

/** "Assigned" is served by the assigned-issues endpoint, not by events. */
export function eventsForTab(events: readonly InboxEvent[], tab: InboxTab): InboxEvent[] {
  switch (tab) {
    case 'unread': return events.filter((event) => !event.done && !event.read);
    case 'all': return events.filter((event) => !event.done);
    case 'mentions': return events.filter((event) => !event.done && event.type === 'mention');
    case 'done': return events.filter((event) => event.done);
    case 'assigned': return [];
  }
}

export function tabCount(events: readonly InboxEvent[], tab: InboxTab): number | null {
  if (tab === 'assigned' || tab === 'done' || tab === 'all') return null;
  return eventsForTab(events, tab).length;
}

export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const minutes = Math.max(0, Math.round((now.getTime() - then.getTime()) / 60000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d`;
  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export interface EventRowHandlers {
  open: (event: InboxEvent) => void;
  toggleRead: (event: InboxEvent) => void;
  toggleDone: (event: InboxEvent) => void;
}

/** Builds one row with textContent only: event text is user-influenced. */
export function createEventRow(event: InboxEvent, handlers: EventRowHandlers): HTMLLIElement {
  const item = document.createElement('li');
  item.className = `issue-card inbox-issue-card inbox-event-card${event.read ? '' : ' is-unread'}`;
  item.dataset.eventId = String(event.id);

  const marker = document.createElement('span');
  marker.className = `inbox-marker${event.read ? '' : ' is-doing'}`;
  marker.setAttribute('aria-hidden', 'true');

  const content = document.createElement('div');
  content.className = 'issue-content';
  const project = document.createElement('span');
  project.className = 'inbox-project-name';
  project.textContent = `${iconFor(event.type)} ${event.project_name}`;
  const mainline = document.createElement('div');
  mainline.className = 'issue-mainline';
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'issue-title issue-title-button';
  open.textContent = `${event.actor_name} ${event.summary}`;
  open.addEventListener('click', () => handlers.open(event));
  mainline.append(open);
  content.append(project, mainline);
  if (event.detail !== null && event.detail !== '') {
    const detail = document.createElement('p');
    detail.className = 'inbox-event-detail';
    detail.textContent = event.detail;
    content.append(detail);
  }

  const side = document.createElement('div');
  side.className = 'inbox-event-side';
  const time = document.createElement('time');
  time.className = 'inbox-updated';
  time.dateTime = event.created_at;
  time.textContent = relativeTime(event.created_at);
  const actions = document.createElement('div');
  actions.className = 'inbox-event-actions';
  const read = document.createElement('button');
  read.type = 'button';
  read.className = 'button button-quiet';
  read.textContent = event.read ? 'Mark unread' : 'Mark read';
  read.addEventListener('click', () => handlers.toggleRead(event));
  const done = document.createElement('button');
  done.type = 'button';
  done.className = 'button button-quiet';
  done.textContent = event.done ? 'Reopen' : 'Done';
  done.addEventListener('click', () => handlers.toggleDone(event));
  actions.append(read, done);
  side.append(time, actions);

  item.append(marker, content, side);
  return item;
}
