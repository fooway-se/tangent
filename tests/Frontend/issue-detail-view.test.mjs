import assert from 'node:assert/strict';
import test from 'node:test';
import { initIssueDetailView } from '../../public/assets/issue-detail-view.js';

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.parentElement = null;
    this.classes = new Set();
    this.classList = {
      toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name),
      contains: (name) => this.classes.has(name),
    };
  }

  append(...children) {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }

  replaceChildren(...children) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this.append(...children);
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  querySelectorAll(selector) {
    if (selector === ':scope > .deleted-issue-item' || selector === '.deleted-issue-item') {
      return this.children.filter((child) => child.className === 'deleted-issue-item');
    }
    return [];
  }

  querySelector(selector) {
    if (selector === '.issue-title-button') return this.children.find((child) => child.className === 'issue-title-button') ?? null;
    if (selector === 'button') return this.children.flatMap((child) => child.children).find((child) => child.tagName === 'BUTTON') ?? null;
    return this.querySelectorAll(selector)[0] ?? null;
  }

  remove() {
    if (this.parentElement === null) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }

  replaceWith(next) {
    if (this.parentElement === null) return;
    const siblings = this.parentElement.children;
    const index = siblings.indexOf(this);
    siblings[index] = next;
    next.parentElement = this.parentElement;
    this.parentElement = null;
  }
}

function createIssue(overrides = {}) {
  return {
    id: 4,
    title: 'Refine navigation',
    type: 'task',
    priority: 'high',
    due_date: '2026-11-20',
    status: 'doing',
    assignee_id: 7,
    milestone_id: 9,
    is_ongoing: true,
    is_shared: true,
    approved_at: null,
    approval_requested_at: '2026-11-18T10:00:00Z',
    description: '',
    context: 'Current navigation is hard to follow.',
    expected_outcome: 'Clear navigation.',
    acceptance_criteria: 'Keyboard users can navigate.',
    source_message_id: 31,
    ...overrides,
  };
}

function createHarness() {
  const created = [];
  const doc = {
    activeElement: null,
    createElement: (tagName) => {
      const element = new FakeElement(tagName);
      created.push(element);
      return element;
    },
  };
  const names = [
    'issueDetailTitle', 'issueDetailType', 'issueDetailPriority', 'issueDetailDueDate',
    'issueDetailAssignee', 'issueDetailMilestone', 'issueDetailOngoingRow', 'issueDetailSharing',
    'issueDetailApproval', 'issueDetailDescription', 'issueDetailContext', 'issueDetailContextSection',
    'issueDetailExpectedOutcome', 'issueDetailExpectedOutcomeSection', 'issueDetailAcceptanceCriteria',
    'issueDetailAcceptanceCriteriaSection', 'issueDetailBrief', 'issueDetailStatusLabel',
    'issueDetailStatus', 'issueSourceLink',
  ];
  const elements = Object.fromEntries(names.map((name) => [name, new FakeElement()]));
  const deletedIssueList = new FakeElement('ul');
  let selectedIssue = null;
  let deletedIssues = [];
  let project = { status: 'active' };
  const calls = { restore: [], pullRequests: 0, replace: 0 };
  const options = {
    doc,
    elements,
    deletedIssueList,
    getSelectedIssue: () => selectedIssue,
    getDeletedIssues: () => deletedIssues,
    getProject: () => project,
    getMilestones: () => [{ id: 9, name: 'Sprint' }],
    issueStatusLabel: (status) => status.toUpperCase(),
    issueTypeLabel: (type) => type.toUpperCase(),
    issuePriorityLabel: (priority) => priority.toUpperCase(),
    isIssueOverdue: () => true,
    formatIssueDueDate: (date) => `formatted ${date}`,
    issueAssigneeLabel: (id) => `Member ${id}`,
    isProjectReadOnly: (status) => status === 'completed' || status === 'archived',
    restoreIssue: (issue, button) => calls.restore.push({ issue, button }),
    renderPullRequests: () => { calls.pullRequests += 1; },
    placeNodeAtPosition: (parent, node, index) => {
      const remaining = parent.children.filter((child) => child !== node);
      remaining.splice(index, 0, node);
      parent.children = remaining;
      node.parentElement = parent;
    },
    replaceRowPreservingFocus: (previous, next) => { calls.replace += 1; previous.replaceWith(next); },
  };
  const ui = initIssueDetailView(options);
  return {
    ui, doc, elements, deletedIssueList, calls,
    setSelectedIssue: (issue) => { selectedIssue = issue; },
    setDeletedIssues: (issues) => { deletedIssues = issues; },
    setProject: (value) => { project = value; },
  };
}

test('detail rendering fills labels and hides optional sections when their content is empty', () => {
  const harness = createHarness();
  const selectedIssue = createIssue();
  harness.setSelectedIssue(selectedIssue);

  harness.ui.renderDetail();

  assert.equal(harness.elements.issueDetailTitle.textContent, 'Refine navigation');
  assert.equal(harness.elements.issueDetailType.textContent, 'TASK');
  assert.equal(harness.elements.issueDetailPriority.textContent, 'HIGH');
  assert.equal(harness.elements.issueDetailDueDate.textContent, 'Overdue · formatted 2026-11-20');
  assert.equal(harness.elements.issueDetailAssignee.textContent, 'Member 7');
  assert.equal(harness.elements.issueDetailMilestone.textContent, 'Sprint');
  assert.equal(harness.elements.issueDetailDescription.textContent, 'No description yet.');
  assert.equal(harness.elements.issueDetailDescription.classList.contains('is-empty'), true);
  assert.equal(harness.elements.issueDetailBrief.hidden, false);
  assert.equal(harness.elements.issueDetailOngoingRow.hidden, false);
  assert.equal(harness.elements.issueSourceLink.hidden, false);
  assert.equal(harness.elements.issueSourceLink.dataset.messageId, '31');
  assert.match(harness.elements.issueDetailStatus.attributes.get('aria-label'), /Current status: DOING/);
  assert.equal(harness.calls.pullRequests, 1);

  harness.setSelectedIssue(createIssue({ context: '', expected_outcome: '', acceptance_criteria: '', source_message_id: null }));
  harness.ui.renderDetail();
  assert.equal(harness.elements.issueDetailBrief.hidden, true);
  assert.equal(harness.elements.issueDetailContextSection.hidden, true);
  assert.equal(harness.elements.issueSourceLink.hidden, true);
  assert.equal('messageId' in harness.elements.issueSourceLink.dataset, false);
});

test('deleted issue rows reuse unchanged markup, replace changed rows, and honor read-only projects', () => {
  const harness = createHarness();
  const deleted = [{ id: 5, title: 'Old title', status: 'done' }, { id: 6, title: 'Another', status: 'backlog' }];
  harness.setDeletedIssues(deleted);
  harness.setProject({ status: 'archived' });

  harness.ui.reconcileDeletedRows();

  const firstRow = harness.deletedIssueList.children[0];
  const restoreButton = firstRow.children[1];
  assert.equal(firstRow.children[1].disabled, true);
  restoreButton.listeners.get('click')();
  assert.equal(harness.calls.restore[0].issue, deleted[0]);
  assert.equal(harness.calls.restore[0].button, restoreButton);

  harness.ui.reconcileDeletedRows();
  assert.equal(harness.deletedIssueList.children[0], firstRow);

  harness.setDeletedIssues([{ ...deleted[0], title: 'Updated title' }]);
  harness.ui.reconcileDeletedRows();
  assert.equal(harness.deletedIssueList.children.length, 1);
  assert.notEqual(harness.deletedIssueList.children[0], firstRow);
  assert.equal(harness.calls.replace, 1);
});
