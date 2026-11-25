import assert from 'node:assert/strict';
import test from 'node:test';
import { createIssueRowUi } from '../../public/assets/issue-row-ui.js';

class FakeElement {
  constructor(tagName, namespace = null) {
    this.tagName = tagName;
    this.namespace = namespace;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.dataset = {};
    this.className = '';
    this.textContent = '';
    this.disabled = false;
    this.title = '';
    this.type = '';
  }

  append(...children) {
    this.children.push(...children);
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }
}

function createHarness() {
  const opened = [];
  const moved = [];
  const ui = createIssueRowUi({
    doc: {
      createElement: (tag) => new FakeElement(tag),
      createElementNS: (namespace, tag) => new FakeElement(tag, namespace),
    },
    issueTypeLabel: (type) => `Type: ${type}`,
    issuePriorityLabel: (priority) => priority.toUpperCase(),
    formatIssueDueDate: (date) => `formatted ${date}`,
    isIssueOverdue: () => true,
    issueAssigneeLabel: (id) => `Member ${id}`,
    isReadOnly: () => false,
    createStatusButton: () => new FakeElement('button'),
    createBulkMoveCheckbox: () => Object.assign(new FakeElement('input'), { className: 'issue-bulk-select-checkbox' }),
    createBulkAssignCheckbox: () => Object.assign(new FakeElement('input'), { className: 'issue-bulk-assign-checkbox' }),
    openIssue: (issue) => opened.push(issue.id),
    moveIssue: (issue, direction) => moved.push([issue.id, direction]),
  });
  return { ui, opened, moved };
}

function findByClass(root, className) {
  if (root.className?.split(' ').includes(className)) return root;
  for (const child of root.children ?? []) {
    const found = findByClass(child, className);
    if (found !== null) return found;
  }
  return null;
}

const issue = {
  id: 42,
  project_id: 7,
  title: 'Ship the refactor',
  description: 'Move the row renderer',
  status: 'doing',
  type: 'feature',
  priority: 'high',
  due_date: '2026-11-20',
  assignee_id: 3,
  source_message_id: 19,
  is_shared: true,
  is_ongoing: true,
  milestone_name: 'Winter release',
  discussion_count: 2,
};

test('issue row renders metadata, accessibility labels, and shared state', () => {
  const { ui } = createHarness();
  const row = ui.create(issue, undefined, true, true);

  assert.equal(row.className, 'issue-card');
  assert.equal(row.dataset.issueId, '42');
  assert.equal(findByClass(row, 'issue-title-button').textContent, issue.title);
  assert.equal(findByClass(row, 'issue-description').textContent, issue.description);
  assert.equal(findByClass(row, 'issue-shared-tag').textContent, 'Shared');
  assert.equal(findByClass(row, 'issue-shared-tag').attributes.get('aria-label'), 'Shared with guests');
  assert.equal(findByClass(row, 'issue-type-tag').textContent, 'Type: feature');
  assert.equal(findByClass(row, 'issue-priority-tag').textContent, 'HIGH priority');
  assert.equal(findByClass(row, 'issue-due-date-tag').textContent, 'Overdue formatted 2026-11-20');
  assert.equal(findByClass(row, 'issue-ongoing-tag').textContent, 'Ongoing');
  assert.equal(findByClass(row, 'issue-milestone-tag').textContent, 'Winter release');
  assert.equal(findByClass(row, 'issue-assignee-label').textContent, 'Member 3');
  assert.equal(findByClass(row, 'issue-source').textContent, 'From chat thread');
  assert.equal(findByClass(row, 'issue-discussion-indicator').attributes.get('aria-label'), '2 discussion messages');
  assert.ok(findByClass(row, 'issue-bulk-select-checkbox'));
  assert.ok(findByClass(row, 'issue-bulk-assign-checkbox'));
});

test('issue row displays the default task type', () => {
  const { ui } = createHarness();
  const row = ui.create({ ...issue, type: 'task' });

  assert.equal(findByClass(row, 'issue-type-tag').textContent, 'Type: task');
});

test('issue row title and reorder controls call their feature handlers', () => {
  const { ui, opened, moved } = createHarness();
  const row = ui.create(issue, { canMoveEarlier: true, canMoveLater: false, showMilestoneTag: false }, false, false);

  findByClass(row, 'issue-title-button').listeners.get('click')();
  const buttons = [];
  const visit = (node) => {
    if (node.dataset?.moveDirection !== undefined) buttons.push(node);
    for (const child of node.children ?? []) visit(child);
  };
  visit(row);
  buttons.find((button) => button.dataset.moveDirection === 'up').listeners.get('click')();

  assert.deepEqual(opened, [42]);
  assert.deepEqual(moved, [[42, 'up']]);
  assert.equal(buttons.find((button) => button.dataset.moveDirection === 'up').disabled, false);
  assert.equal(buttons.find((button) => button.dataset.moveDirection === 'down').disabled, true);
  assert.equal(findByClass(row, 'issue-milestone-tag'), null);
});
