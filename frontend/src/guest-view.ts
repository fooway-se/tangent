export type ClientItemStatus = 'planned' | 'doing' | 'done';
export type MilestoneState = 'planned' | 'in-progress' | 'complete';

export interface ClientMilestone {
  id: number;
  name: string;
  due_date: string | null;
  done: number;
  total: number;
}

export interface ClientItem {
  id: number;
  title: string;
  description: string;
  status: ClientItemStatus;
  milestone_id: number | null;
  milestone_name: string | null;
}

export interface ClientMessage {
  id: number;
  parent_id: number | null;
  author_id: number;
  author_name: string;
  body: string;
  created_at: string;
}

export interface ClientView {
  project: { id: number; name: string; status: 'active' | 'paused' | 'completed' | 'archived' };
  progress: { percent: number; done: number; total: number };
  next_milestone: { name: string; due_date: string | null } | null;
  completed_this_week: number;
  approvals: Array<{ id: number; title: string; description: string }>;
  milestones: ClientMilestone[];
  items: ClientItem[];
  updates: Array<{ id: number; text: string; created_at: string }>;
  messages: ClientMessage[];
}

export function progressRange(done: number, total: number): { max: number; value: number } {
  const max = Math.max(1, total);
  return { max, value: Math.max(0, Math.min(done, max)) };
}

export function featuredMilestone(milestones: readonly ClientMilestone[]): ClientMilestone | null {
  return milestones.find((milestone) => milestone.done < milestone.total) ?? milestones[0] ?? null;
}

export function itemsForMilestone(items: readonly ClientItem[], milestoneId: number): ClientItem[] {
  return items.filter((item) => item.milestone_id === milestoneId);
}

export function daysUntil(dueDate: string | null, today: Date = new Date()): number | null {
  if (dueDate === null) return null;
  const targetDate = new Date(`${dueDate}T00:00:00Z`);
  if (Number.isNaN(targetDate.getTime())) return null;
  const targetDay = Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), targetDate.getUTCDate());
  const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((targetDay - todayDay) / 86_400_000);
}

export function statusLabel(status: ClientItemStatus): string {
  return status === 'done' ? 'Done' : status === 'doing' ? 'In progress' : 'Planned';
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function segmentBar(done: number, total: number, tone: 'accent' | 'success' = 'accent'): HTMLProgressElement {
  const bar = el('progress', `guest-progress${tone === 'success' ? ' is-complete' : ''}`);
  const range = progressRange(done, total);
  bar.max = range.max;
  bar.value = range.value;
  bar.setAttribute('aria-label', `${done} of ${total} done`);
  return bar;
}

function stat(label: string, value: string, detail?: string, visual?: HTMLElement, summary = false): HTMLElement {
  const box = el('div', 'guest-stat');
  const valueClass = summary ? 'guest-stat-value is-summary' : 'guest-stat-value';
  box.append(el('span', 'guest-stat-label', label), el('strong', valueClass, value));
  if (visual !== undefined) box.append(visual);
  if (detail !== undefined) box.append(el('span', 'guest-stat-detail', detail));
  return box;
}

export function formatGuestDate(value: string | null, includeWeekday = false): string {
  if (value === null) return 'No date set';
  const date = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    ...(includeWeekday ? { weekday: 'short' as const } : {}),
  };
  return new Intl.DateTimeFormat('en-GB', options).format(date).replace(',', '');
}

export function updateDateLabel(value: string, today: Date = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  const dateDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const dayDifference = Math.round((todayDay - dateDay) / 86_400_000);
  if (dayDifference === 0) return 'Today';
  if (dayDifference === 1) return 'Yesterday';
  return formatGuestDate(value, true);
}

function dueCountdown(dueDate: string | null): string {
  const days = daysUntil(dueDate);
  if (days === null) return 'No due date';
  if (days === 0) return 'Due today';
  if (days === 1) return '1 day left';
  if (days > 1) return `${days} days left`;
  if (days === -1) return '1 day overdue';
  return `${Math.abs(days)} days overdue`;
}

function milestoneState(milestone: ClientMilestone, items: readonly ClientItem[]): MilestoneState {
  if (milestone.total > 0 && milestone.done >= milestone.total) return 'complete';
  const milestoneItems = itemsForMilestone(items, milestone.id);
  if (milestone.done > 0 || milestoneItems.some((item) => item.status === 'doing')) return 'in-progress';
  return 'planned';
}

function milestoneLabel(state: MilestoneState, milestone: ClientMilestone): string {
  const percent = milestone.total === 0 ? 0 : Math.round((milestone.done / milestone.total) * 100);
  const label = state === 'complete' ? 'Done' : state === 'in-progress' ? 'In progress' : 'Planned';
  return `${label} · ${percent}%`;
}

function deliverableList(items: readonly ClientItem[]): HTMLElement {
  const list = el('ul', 'guest-deliverables-list');
  for (const item of items) {
    const row = el('li', 'guest-deliverable-item');
    const key = el('span', 'guest-item-key', `#${item.id}`);
    const marker = el('span', `guest-item-marker is-${item.status}`);
    marker.setAttribute('aria-hidden', 'true');
    const title = el('span', 'guest-item-title', item.title);
    const status = el('span', `guest-item-status is-${item.status}`, statusLabel(item.status));
    row.append(key, marker, title, status);
    list.append(row);
  }
  return list;
}

function milestoneButton(
  milestone: ClientMilestone,
  items: readonly ClientItem[],
  selected: boolean,
  onSelect: () => void,
): HTMLButtonElement {
  const state = milestoneState(milestone, items);
  const button = el('button', `guest-milestone-select is-${state}${selected ? ' is-selected' : ''}`);
  button.type = 'button';
  button.setAttribute('aria-pressed', String(selected));
  button.addEventListener('click', onSelect);

  const marker = el('span', `guest-milestone-marker is-${state}`);
  marker.setAttribute('aria-hidden', 'true');
  const title = el('span', 'guest-milestone-title');
  title.append(
    el('strong', undefined, milestone.name),
    el('span', 'guest-milestone-date', milestone.due_date === null ? 'No due date' : formatGuestDate(milestone.due_date)),
  );
  const progress = segmentBar(milestone.done, milestone.total, state === 'complete' ? 'success' : 'accent');
  const label = el('span', 'guest-milestone-progress', milestoneLabel(state, milestone));
  button.append(marker, title, progress, label);
  return button;
}

export interface GuestHandlers {
  userId: number;
  approve: (approvalId: number) => Promise<void>;
  comment: (body: string) => Promise<void>;
}

export interface GuestViewOptions {
  previewMode?: boolean;
}

export function renderClientEmptyState(container: HTMLElement, message: string): void {
  const screenHeading = el('div', 'guest-screen-heading');
  const breadcrumb = el('div', 'guest-project-breadcrumb');
  breadcrumb.append(
    el('span', 'guest-breadcrumb-muted', 'Projects'),
    el('span', 'guest-breadcrumb-separator', '/'),
    el('strong', undefined, 'Client portal'),
  );
  screenHeading.append(breadcrumb);

  const page = el('div', 'guest-page-content');
  const overview = el('section', 'guest-project-overview');
  overview.append(
    el('span', 'guest-overline', 'Project'),
    el('h2', 'guest-project-title', 'Client portal'),
    el('p', 'guest-project-description', 'Progress, milestones, and shared work from your project team.'),
  );
  page.append(overview, el('p', 'guest-empty guest-no-projects', message));
  container.replaceChildren(screenHeading, page);
}

export function renderClientView(
  container: HTMLElement,
  view: ClientView,
  handlers: GuestHandlers,
  options: GuestViewOptions = {},
): void {
  const readOnly = view.project.status === 'completed' || view.project.status === 'archived';
  const previewMode = options.previewMode === true;
  const screenHeading = el('div', 'guest-screen-heading');
  const breadcrumb = el('div', 'guest-project-breadcrumb');
  breadcrumb.append(
    el('span', 'guest-breadcrumb-muted', 'Projects'),
    el('span', 'guest-breadcrumb-separator', '/'),
    el('strong', undefined, view.project.name),
  );
  screenHeading.append(breadcrumb);

  const page = el('div', 'guest-page-content');
  const overview = el('section', 'guest-project-overview');
  overview.append(
    el('span', 'guest-overline', 'Project'),
    el('h2', 'guest-project-title', view.project.name),
    el('p', 'guest-project-description', 'Follow progress, milestones, and the work the team has shared with you.'),
  );

  const inProgress = view.items.filter((item) => item.status === 'doing').length;
  const next = view.next_milestone;
  const nextDetail = next === null
    ? 'No upcoming milestone'
    : `${formatGuestDate(next.due_date, true)} · ${dueCountdown(next.due_date)}`;
  const stats = el('div', 'guest-stats');
  stats.append(
    stat('Overall progress', `${view.progress.percent}%`, undefined, segmentBar(view.progress.done, view.progress.total)),
    stat('Next milestone', next?.name ?? 'None planned', nextDetail),
    stat('This week', `${view.completed_this_week} done · ${inProgress} in progress`, `of ${view.progress.total} planned items`, undefined, true),
  );

  page.append(overview);
  if (readOnly) {
    page.append(el(
      'p',
      'guest-project-read-only',
      `This project is read-only while it is ${view.project.status}. You can still review project history.`,
    ));
  }
  page.append(stats);

  if (view.approvals.length > 0) {
    const approvals = el('section', 'guest-approval-banner');
    approvals.setAttribute('aria-label', 'Waiting for your approval');
    approvals.append(el('h2', 'guest-approval-heading', readOnly ? 'Pending approvals' : 'Waiting for your approval'));
    const approvalList = el('div', 'guest-approval-list');
    for (const approval of view.approvals) {
      const card = el('article', 'guest-approval');
      const copy = el('div', 'guest-approval-copy');
      const title = el('div', 'guest-approval-title');
      title.append(el('strong', undefined, approval.title), el('span', 'guest-approval-key', `#${approval.id}`));
      copy.append(title, el('p', 'guest-muted', approval.description));
      if (readOnly) {
        copy.append(el('p', 'guest-muted', 'Approval is unavailable while this project is read-only.'));
      } else {
        const approveButton = el('button', 'button button-primary guest-approve-button', 'Approve');
        approveButton.type = 'button';
        approveButton.disabled = previewMode;
        if (previewMode) {
          approveButton.title = 'Approval is disabled in admin preview.';
          approveButton.setAttribute('aria-label', 'Approve (disabled in admin preview)');
        }
        approveButton.addEventListener('click', () => {
          if (previewMode) return;
          approveButton.disabled = true;
          handlers.approve(approval.id).catch(() => { approveButton.disabled = false; });
        });
        card.append(copy, approveButton);
      }
      approvalList.append(card);
    }
    approvals.append(approvalList);
    page.append(approvals);
  }

  const planning = el('div', 'guest-planning-grid');
  const milestoneSection = el('section', 'guest-section guest-milestones');
  milestoneSection.setAttribute('aria-label', 'Milestones');
  milestoneSection.append(el('h2', 'guest-heading', 'Milestones'));
  const milestoneList = el('div', 'guest-milestone-list');
  const deliverables = el('section', 'guest-section guest-deliverables');
  deliverables.setAttribute('aria-label', 'Shared items');
  const deliverablesHeading = el('h2', 'guest-heading', 'Shared items');
  const deliverablesBody = el('div', 'guest-deliverables-body');
  deliverables.append(deliverablesHeading, deliverablesBody);

  let selectedMilestone = featuredMilestone(view.milestones);
  const milestoneButtons: HTMLButtonElement[] = [];
  const renderSelectedMilestone = (): void => {
    for (const button of milestoneButtons) {
      const selected = Number(button.dataset.milestoneId) === selectedMilestone?.id;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    }
    deliverablesBody.replaceChildren();
    if (selectedMilestone === null) {
      deliverablesHeading.textContent = 'Shared with you';
      deliverablesBody.append(deliverableList(view.items));
      if (view.items.length === 0) deliverablesBody.append(el('p', 'guest-empty', 'Nothing shared yet.'));
      return;
    }

    deliverablesHeading.textContent = `In the ${selectedMilestone.name} milestone`;
    const selectedItems = itemsForMilestone(view.items, selectedMilestone.id);
    deliverablesBody.append(deliverableList(selectedItems));
    if (selectedItems.length === 0) deliverablesBody.append(el('p', 'guest-empty', 'No shared items in this milestone.'));

    const unassigned = view.items.filter((item) => item.milestone_id === null);
    if (unassigned.length > 0) {
      deliverablesBody.append(el('h3', 'guest-subheading', 'Not assigned to a milestone'), deliverableList(unassigned));
    }
    deliverablesBody.append(el('p', 'guest-note', 'Only items shared with you are shown. Internal work is hidden.'));
  };

  for (const milestone of view.milestones) {
    const button = milestoneButton(milestone, view.items, false, () => {
      selectedMilestone = milestone;
      renderSelectedMilestone();
    });
    button.dataset.milestoneId = String(milestone.id);
    milestoneButtons.push(button);
    milestoneList.append(button);
  }
  if (view.milestones.length === 0) milestoneList.append(el('p', 'guest-empty', 'No milestones yet.'));
  milestoneSection.append(milestoneList);
  planning.append(milestoneSection, deliverables);
  renderSelectedMilestone();
  page.append(planning);

  const updates = el('section', 'guest-section guest-updates');
  updates.setAttribute('aria-label', 'Latest updates');
  updates.append(el('h2', 'guest-heading', 'Latest updates'));
  const updateList = el('ul', 'guest-update-list');
  for (const update of view.updates) {
    const row = el('li', 'guest-update-item');
    const time = el('time', 'guest-update-date', updateDateLabel(update.created_at));
    time.dateTime = update.created_at;
    row.append(time, el('p', undefined, update.text));
    updateList.append(row);
  }
  updates.append(updateList);
  if (view.updates.length === 0) updates.append(el('p', 'guest-empty', 'No updates yet.'));
  page.append(updates);

  const conversation = el('section', 'guest-section guest-conversation');
  conversation.setAttribute('aria-label', 'Conversation');
  conversation.append(el('h2', 'guest-heading', 'Conversation'));
  const conversationList = el('ol', 'guest-conversation-list');
  for (const message of view.messages) {
    const isOwnMessage = message.author_id === handlers.userId;
    const row = el(
      'li',
      `guest-conversation-message${isOwnMessage ? ' is-own' : ''}${message.parent_id === null ? '' : ' is-reply'}`,
    );
    const meta = el('div', 'guest-conversation-meta');
    meta.append(
      el('strong', 'guest-conversation-author', isOwnMessage ? 'You' : message.author_name),
    );
    const time = el('time', 'guest-conversation-date', updateDateLabel(message.created_at));
    time.dateTime = message.created_at;
    meta.append(time);
    row.append(meta, el('p', 'guest-conversation-body', message.body));
    conversationList.append(row);
  }
  if (view.messages.length === 0) {
    conversation.append(el('p', 'guest-empty', 'Your messages and replies from the team will appear here.'));
  } else {
    conversation.append(conversationList);
  }
  page.append(conversation);

  if (!readOnly) {
    const write = el('form', 'guest-write');
    write.setAttribute('aria-label', 'Write to the team');
    const textarea = el('textarea');
    textarea.setAttribute('aria-label', 'Write to the team');
    textarea.placeholder = 'Write to the team…';
    textarea.rows = 3;
    textarea.maxLength = 2000;
    textarea.disabled = previewMode;
    const footer = el('div', 'guest-composer-footer');
    footer.append(
      el('span', 'guest-composer-note', previewMode
        ? 'Read-only preview · Message sending is disabled.'
        : 'Goes to the team’s project channel'),
    );
    const send = el('button', 'button button-primary', 'Send');
    send.type = 'submit';
    send.disabled = previewMode;
    footer.append(send);
    write.append(textarea, footer);
    write.addEventListener('submit', (submitEvent) => {
      submitEvent.preventDefault();
      if (previewMode) return;
      const body = textarea.value.trim();
      if (body === '') return;
      send.disabled = true;
      handlers.comment(body).then(() => { textarea.value = ''; }).catch(() => undefined).finally(() => { send.disabled = false; });
    });
    page.append(write);
  }

  container.replaceChildren(screenHeading, page);
}
