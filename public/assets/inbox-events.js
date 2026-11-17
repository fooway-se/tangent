export const INBOX_TABS = [
    { id: 'unread', label: 'Unread' },
    { id: 'all', label: 'All' },
    { id: 'mentions', label: 'Mentions' },
    { id: 'assigned', label: 'Assigned' },
    { id: 'done', label: 'Done' },
];
const ICONS = {
    mention: '@',
    assigned: '→',
    reply: '↩',
    status: '●',
    pr: '⑂',
};
export function iconFor(type) {
    return ICONS[type];
}
export function eventsForTab(events, tab) {
    switch (tab) {
        case 'unread': return events.filter((event) => !event.done && !event.read);
        case 'all': return events.filter((event) => !event.done);
        case 'mentions': return events.filter((event) => !event.done && event.type === 'mention');
        case 'done': return events.filter((event) => event.done);
        case 'assigned': return [];
    }
}
export function tabCount(events, tab) {
    if (tab === 'assigned' || tab === 'done' || tab === 'all')
        return null;
    return eventsForTab(events, tab).length;
}
export function relativeTime(iso, now = new Date()) {
    const then = new Date(iso);
    const minutes = Math.max(0, Math.round((now.getTime() - then.getTime()) / 60000));
    if (minutes < 1)
        return 'now';
    if (minutes < 60)
        return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24)
        return `${hours} h`;
    const days = Math.floor(hours / 24);
    if (days < 7)
        return `${days} d`;
    return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
export function createEventRow(event, handlers) {
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
    read.className = 'button button-quiet inbox-event-read';
    read.textContent = event.read ? 'Mark unread' : 'Mark read';
    read.addEventListener('click', () => handlers.toggleRead(event));
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'button button-quiet inbox-event-done';
    done.textContent = event.done ? 'Reopen' : 'Done';
    done.addEventListener('click', () => handlers.toggleDone(event));
    actions.append(read, done);
    side.append(time, actions);
    item.append(marker, content, side);
    return item;
}
