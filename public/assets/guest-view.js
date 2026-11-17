export const SEGMENTS = 10;
export function litSegments(done, total, segments = SEGMENTS) {
    if (total <= 0)
        return 0;
    return Math.max(0, Math.min(segments, Math.round((done / total) * segments)));
}
export function statusLabel(status) {
    return status === 'done' ? 'Done' : status === 'doing' ? 'In progress' : 'Planned';
}
function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className !== undefined)
        node.className = className;
    if (text !== undefined)
        node.textContent = text;
    return node;
}
function segmentBar(done, total) {
    const bar = el('div', 'guest-segments');
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', `${done} of ${total} done`);
    const lit = litSegments(done, total);
    for (let index = 0; index < SEGMENTS; index += 1) {
        bar.append(el('span', index < lit ? 'is-lit' : ''));
    }
    return bar;
}
function stat(label, value) {
    const box = el('div', 'guest-stat');
    box.append(el('span', 'guest-stat-label', label), el('strong', 'guest-stat-value', value));
    return box;
}
function formatDate(value) {
    if (value === null)
        return 'No date set';
    return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
/** Renders the client view. Everything is textContent; the API already filters visibility. */
export function renderClientView(container, view, handlers) {
    const stats = el('div', 'guest-stats');
    stats.append(stat('Overall progress', `${view.progress.percent}%`), stat('Next milestone', view.next_milestone === null ? 'None planned' : view.next_milestone.name), stat('Done this week', String(view.completed_this_week)));
    const sections = [stats];
    if (view.approvals.length > 0) {
        const section = el('section', 'guest-section guest-approvals');
        section.setAttribute('aria-label', 'Waiting for your approval');
        section.append(el('h2', 'guest-heading', 'Waiting for your approval'));
        for (const approval of view.approvals) {
            const card = el('div', 'guest-approval');
            const text = el('div');
            text.append(el('strong', undefined, approval.title), el('p', 'guest-muted', approval.description));
            const button = el('button', 'button button-primary', 'Approve');
            button.type = 'button';
            button.addEventListener('click', () => {
                button.disabled = true;
                handlers.approve(approval.id).catch(() => { button.disabled = false; });
            });
            card.append(text, button);
            section.append(card);
        }
        sections.push(section);
    }
    const milestones = el('section', 'guest-section');
    milestones.setAttribute('aria-label', 'Milestones');
    milestones.append(el('h2', 'guest-heading', 'Milestones'));
    for (const milestone of view.milestones) {
        const row = el('div', 'guest-milestone');
        const title = el('div', 'guest-milestone-title');
        title.append(el('strong', undefined, milestone.name), el('span', 'guest-muted', formatDate(milestone.due_date)));
        row.append(title, segmentBar(milestone.done, milestone.total), el('span', 'guest-muted', `${milestone.done}/${milestone.total}`));
        milestones.append(row);
    }
    if (view.milestones.length === 0)
        milestones.append(el('p', 'guest-muted', 'No milestones yet.'));
    sections.push(milestones);
    const items = el('section', 'guest-section');
    items.setAttribute('aria-label', 'Shared items');
    items.append(el('h2', 'guest-heading', 'Shared with you'));
    const list = el('ul', 'guest-list');
    for (const item of view.items) {
        const li = el('li', 'guest-item');
        li.append(el('span', `guest-status is-${item.status}`, statusLabel(item.status)), el('span', undefined, item.title));
        list.append(li);
    }
    items.append(list);
    if (view.items.length === 0)
        items.append(el('p', 'guest-muted', 'Nothing shared yet.'));
    items.append(el('p', 'guest-note', 'Only items shared with you are shown. Internal tasks are hidden.'));
    sections.push(items);
    const updates = el('section', 'guest-section');
    updates.setAttribute('aria-label', 'Latest updates');
    updates.append(el('h2', 'guest-heading', 'Latest updates'));
    const updateList = el('ul', 'guest-list');
    for (const update of view.updates) {
        const li = el('li', 'guest-item');
        li.append(el('span', 'guest-muted', formatDate(update.created_at)), el('span', undefined, update.text));
        updateList.append(li);
    }
    updates.append(updateList);
    if (view.updates.length === 0)
        updates.append(el('p', 'guest-muted', 'No updates yet.'));
    sections.push(updates);
    const write = el('form', 'guest-section guest-write');
    write.setAttribute('aria-label', 'Write to the team');
    write.append(el('h2', 'guest-heading', 'Write to the team'));
    const label = el('label', 'guest-muted', 'Your message goes to the project channel.');
    const textarea = el('textarea');
    textarea.rows = 3;
    textarea.maxLength = 2000;
    label.append(textarea);
    const send = el('button', 'button button-primary', 'Send');
    send.type = 'submit';
    write.append(label, send);
    write.addEventListener('submit', (submitEvent) => {
        submitEvent.preventDefault();
        const body = textarea.value.trim();
        if (body === '')
            return;
        send.disabled = true;
        handlers.comment(body).then(() => { textarea.value = ''; }).catch(() => undefined).finally(() => { send.disabled = false; });
    });
    sections.push(write);
    container.replaceChildren(...sections);
}
