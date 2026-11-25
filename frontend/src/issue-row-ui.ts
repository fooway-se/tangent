import { discussionIndicatorLabel } from './issue-board.js';
import type { Issue } from './types.js';

export interface IssueRowReorderOptions {
  canMoveEarlier?: boolean;
  canMoveLater?: boolean;
  showMilestoneTag?: boolean;
}

export interface IssueRowUiOptions {
  doc: Pick<Document, 'createElement' | 'createElementNS'>;
  issueTypeLabel: (type: Issue['type']) => string;
  issuePriorityLabel: (priority: Issue['priority']) => string;
  formatIssueDueDate: (dueDate: string) => string;
  isIssueOverdue: (issue: Pick<Issue, 'due_date' | 'status'>) => boolean;
  issueAssigneeLabel: (assigneeId: number | null) => string;
  isReadOnly: () => boolean;
  createStatusButton: (issue: Issue) => HTMLButtonElement;
  createBulkMoveCheckbox: (issue: Issue) => HTMLInputElement;
  createBulkAssignCheckbox: (issue: Issue) => HTMLInputElement;
  openIssue: (issue: Issue) => void;
  moveIssue: (issue: Issue, direction: 'up' | 'down', button: HTMLButtonElement) => void | Promise<void>;
}

export function createIssueRowUi(options: IssueRowUiOptions): {
  createDiscussionIndicator: (count: number) => HTMLSpanElement | null;
  create: (
    issue: Issue,
    reorder?: IssueRowReorderOptions,
    allowBulkMoveSelection?: boolean,
    allowBulkAssignSelection?: boolean,
  ) => HTMLLIElement;
} {
  const { doc } = options;

  function createDiscussionIndicator(count: number): HTMLSpanElement | null {
    const label = discussionIndicatorLabel(count);
    if (label === null) return null;
    const indicator = doc.createElement('span');
    indicator.className = 'issue-discussion-indicator';
    indicator.setAttribute('role', 'img');
    indicator.setAttribute('aria-label', label);
    indicator.title = label;

    const icon = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 11 10');
    icon.setAttribute('aria-hidden', 'true');
    const bubble = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    // A pixel-grid speech bubble, drawn on 1px cells so it stays crisp.
    bubble.setAttribute('d', 'M1 0h9v1H1zM0 1h1v6H0zM10 1h1v6h-1zM1 7h9v1H1zM3 8h2v1H3zM3 9h1v1H3z');
    icon.append(bubble);

    const value = doc.createElement('span');
    value.setAttribute('aria-hidden', 'true');
    value.textContent = String(count);
    indicator.append(icon, value);
    return indicator;
  }

  function create(issue: Issue, reorder?: IssueRowReorderOptions, allowBulkMoveSelection = false, allowBulkAssignSelection = false): HTMLLIElement {
    const item = doc.createElement('li');
    item.className = 'issue-card';
    item.dataset.issueId = String(issue.id);

    const content = doc.createElement('div');
    content.className = 'issue-content';
    const mainline = doc.createElement('div');
    mainline.className = 'issue-mainline';
    const indicator = doc.createElement('span');
    indicator.className = `issue-status-indicator is-${issue.status}`;
    indicator.setAttribute('aria-hidden', 'true');
    const key = doc.createElement('span');
    key.className = 'issue-key';
    key.textContent = `#${issue.id}`;

    let sharedIndicator: HTMLSpanElement | null = null;
    if (issue.is_shared) {
      const shared = doc.createElement('span');
      shared.className = 'issue-shared-tag';
      shared.textContent = 'Shared';
      shared.setAttribute('role', 'img');
      shared.setAttribute('aria-label', 'Shared with guests');
      shared.title = 'Shared with guests';

      const shareIcon = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
      shareIcon.setAttribute('viewBox', '0 0 16 16');
      shareIcon.setAttribute('aria-hidden', 'true');
      shareIcon.setAttribute('focusable', 'false');
      const shareLines = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
      shareLines.setAttribute('d', 'M5.8 7 10.2 4.9M5.8 9 10.2 11.1');
      const shareStart = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
      shareStart.setAttribute('cx', '4');
      shareStart.setAttribute('cy', '8');
      shareStart.setAttribute('r', '2');
      const shareTop = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
      shareTop.setAttribute('cx', '12');
      shareTop.setAttribute('cy', '4');
      shareTop.setAttribute('r', '2');
      const shareBottom = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
      shareBottom.setAttribute('cx', '12');
      shareBottom.setAttribute('cy', '12');
      shareBottom.setAttribute('r', '2');
      shareIcon.append(shareLines, shareStart, shareTop, shareBottom);
      shared.append(shareIcon);
      sharedIndicator = shared;
    }

    const statusColumn = doc.createElement('span');
    statusColumn.className = 'issue-status-column';
    statusColumn.append(indicator);
    if (sharedIndicator !== null) statusColumn.append(sharedIndicator);

    const title = doc.createElement('button');
    title.className = 'issue-title issue-title-button';
    title.type = 'button';
    title.textContent = issue.title;
    title.addEventListener('click', () => options.openIssue(issue));
    const copy = doc.createElement('div');
    copy.className = 'issue-copy';
    copy.append(title);
    if (issue.description !== '') {
      const description = doc.createElement('p');
      description.className = 'issue-description';
      description.textContent = issue.description;
      copy.append(description);
    }
    const discussionIndicator = createDiscussionIndicator(issue.discussion_count ?? 0);
    const metadata = doc.createElement('div');
    metadata.className = 'issue-metadata';
    if (issue.type !== 'task') {
      const type = doc.createElement('span');
      type.className = 'issue-type-tag';
      type.textContent = options.issueTypeLabel(issue.type);
      metadata.append(type);
    }
    if (issue.priority !== 'medium') {
      const priority = doc.createElement('span');
      priority.className = `issue-priority-tag is-${issue.priority}`;
      priority.textContent = `${options.issuePriorityLabel(issue.priority)} priority`;
      metadata.append(priority);
    }
    if (issue.due_date !== null) {
      const dueDate = doc.createElement('span');
      const overdue = options.isIssueOverdue(issue);
      dueDate.className = `issue-due-date-tag${overdue ? ' is-overdue' : ''}`;
      dueDate.textContent = `${overdue ? 'Overdue' : 'Due'} ${options.formatIssueDueDate(issue.due_date)}`;
      dueDate.title = `${overdue ? 'Overdue' : 'Due'} ${issue.due_date}`;
      metadata.append(dueDate);
    }
    if (issue.is_ongoing) {
      const ongoing = doc.createElement('span');
      ongoing.className = 'issue-ongoing-tag';
      ongoing.textContent = 'Ongoing';
      ongoing.title = 'Continuous work outside milestone completion.';
      metadata.append(ongoing);
    }
    if (issue.milestone_name !== null && issue.milestone_name !== undefined && reorder?.showMilestoneTag !== false) {
      const milestone = doc.createElement('span');
      milestone.className = 'issue-milestone-tag';
      milestone.textContent = issue.milestone_name;
      milestone.title = `Milestone: ${issue.milestone_name}`;
      metadata.append(milestone);
    }
    if (issue.assignee_id !== null) {
      const assignee = doc.createElement('span');
      assignee.className = 'issue-assignee-label';
      assignee.textContent = options.issueAssigneeLabel(issue.assignee_id);
      assignee.title = 'Assignee';
      metadata.append(assignee);
    }
    if (issue.source_message_id !== null) {
      const source = doc.createElement('span');
      source.className = 'issue-source';
      source.textContent = 'From chat thread';
      metadata.append(source);
    }
    copy.append(metadata);
    mainline.append(statusColumn, key, copy);
    content.append(mainline);

    const hasReorderActions = reorder?.canMoveEarlier !== undefined || reorder?.canMoveLater !== undefined;
    const actions = doc.createElement('div');
    actions.className = 'issue-row-actions';
    if (allowBulkMoveSelection) actions.append(options.createBulkMoveCheckbox(issue));
    if (allowBulkAssignSelection) actions.append(options.createBulkAssignCheckbox(issue));
    if (discussionIndicator !== null) actions.append(discussionIndicator);
    if (hasReorderActions) {
      for (const direction of ['up', 'down'] as const) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'button button-quiet issue-order-button';
        button.dataset.moveDirection = direction;
        button.disabled = (direction === 'up'
          ? reorder?.canMoveEarlier !== true
          : reorder?.canMoveLater !== true)
          || options.isReadOnly();
        button.textContent = direction === 'up' ? '↑' : '↓';
        button.setAttribute('aria-label', `Move ${issue.title} ${direction === 'up' ? 'earlier' : 'later'}`);
        button.addEventListener('click', () => void options.moveIssue(issue, direction, button));
        actions.append(button);
      }
    }
    actions.append(options.createStatusButton(issue));
    item.append(content, actions);
    return item;
  }

  return { create, createDiscussionIndicator };
}
