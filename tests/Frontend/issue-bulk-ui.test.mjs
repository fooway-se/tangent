import assert from 'node:assert/strict';
import test from 'node:test';
import { initIssueBulkUi } from '../../public/assets/issue-bulk-ui.js';

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = '';
    this.textContent = '';
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.hidden = false;
    this.title = '';
    this.parentElement = null;
  }

  append(...children) {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }

  replaceChildren(...children) {
    this.children = [];
    this.append(...children);
  }

  add(option) {
    this.append(option);
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    const className = selector.startsWith('.') ? selector.slice(1) : '';
    const found = [];
    const visit = (element) => {
      for (const child of element.children) {
        if (child.className?.split(' ').includes(className)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }
}

function makeIssue(id, title = `Issue ${id}`) {
  return { id, title };
}

function createHarness(overrides = {}) {
  const state = {
    bulkMovePending: false,
    bulkSelectionActionPending: false,
    bulkAssignSelectionMode: true,
    selectedBulkMoveIssueIds: new Set(),
    selectedBulkAssignIssueIds: new Set(),
    visibleBulkAssignIssueIds: new Set([1, 2]),
    bulkMoveMilestoneId: null,
    bulkAssignTargetValue: '',
    activeMembers: [{ id: 2, name: 'Avery', is_active: true }, { id: 3, name: 'Former', is_active: false }],
    milestones: [{ id: 8, name: 'Sprint', archived_at: null }, { id: 9, name: 'Archived', archived_at: '2026-11-01T00:00:00Z' }],
    readOnly: false,
    ...overrides,
  };
  const issueList = new FakeElement('ul');
  const assignTarget = new FakeElement('select');
  const assignToolbar = new FakeElement('div');
  const assignToggle = new FakeElement('button');
  const assignCount = new FakeElement('span');
  const selectVisible = new FakeElement('button');
  const assignApply = new FakeElement('button');
  const shareApply = new FakeElement('button');
  const unshareApply = new FakeElement('button');
  const assignCancel = new FakeElement('button');
  const calls = { render: 0, reports: [], move: 0, selectedBulkMoveIssueIds: null };
  const ui = initIssueBulkUi({
    doc: { createElement: (tagName) => new FakeElement(tagName) },
    getState: () => state,
    issueList,
    assignTarget,
    assignToolbar,
    assignToggle,
    assignCount,
    selectVisible,
    assignApply,
    shareApply,
    unshareApply,
    assignCancel,
    setBulkMoveMilestoneId: (id) => { state.bulkMoveMilestoneId = id; },
    setBulkAssignTargetValue: (value) => { state.bulkAssignTargetValue = value; },
    setSelectedBulkMoveIssueIds: (ids) => {
      state.selectedBulkMoveIssueIds = ids;
      calls.selectedBulkMoveIssueIds = ids;
    },
    renderBoard: () => { calls.render += 1; },
    moveSelectedIssuesToMilestone: () => { calls.move += 1; },
    report: (message) => calls.reports.push(message),
    setTextContentIfChanged: (element, value) => { element.textContent = value; },
    ...overrides.options,
  });
  return { ui, state, calls, issueList, assignTarget, assignToolbar, assignToggle, assignCount, selectVisible, assignApply, shareApply, unshareApply, assignCancel };
}

test('bulk checkboxes reflect selection and enforce the 500 issue limit', () => {
  const harness = createHarness();
  harness.state.selectedBulkMoveIssueIds.add(1);
  const selected = harness.ui.createMoveCheckbox(makeIssue(1));
  const unselected = harness.ui.createMoveCheckbox(makeIssue(2));
  assert.equal(selected.checked, true);
  assert.equal(unselected.checked, false);
  unselected.checked = true;
  unselected.listeners.get('change')();
  assert.deepEqual([...harness.state.selectedBulkMoveIssueIds], [1, 2]);
  assert.equal(harness.calls.render, 1);

  harness.state.selectedBulkMoveIssueIds = new Set(Array.from({ length: 500 }, (_, index) => index + 1));
  const capped = harness.ui.createMoveCheckbox(makeIssue(501));
  assert.equal(capped.disabled, true);
  capped.disabled = false;
  capped.checked = true;
  capped.listeners.get('change')();
  assert.equal(capped.checked, false);
  assert.equal(harness.calls.reports.at(-1), 'Move up to 500 issues at a time.');
});

test('assignment controls cache active members and reflect busy, read-only, and selection state', () => {
  const harness = createHarness({
    selectedBulkAssignIssueIds: new Set([1]),
    bulkAssignTargetValue: '2',
  });
  const checkbox = new FakeElement('input');
  checkbox.className = 'issue-bulk-assign-checkbox';
  checkbox.dataset.issueId = '1';
  harness.issueList.append(checkbox);

  harness.ui.syncAssignControls();

  assert.deepEqual(harness.assignTarget.children.map((option) => [option.textContent, option.value]), [
    ['Choose assignee', ''], ['Unassigned', 'unassigned'], ['Avery', '2'],
  ]);
  assert.equal(harness.assignTarget.value, '2');
  assert.equal(harness.assignToolbar.hidden, false);
  assert.equal(harness.assignToggle.textContent, 'Cancel selection');
  assert.equal(harness.assignToggle.attributes.get('aria-pressed'), 'true');
  assert.equal(harness.assignCount.textContent, '1 selected');
  assert.equal(checkbox.checked, true);
  assert.equal(harness.assignApply.disabled, false);

  harness.state.readOnly = true;
  harness.ui.syncAssignControls();
  assert.equal(harness.assignApply.disabled, true);
  assert.equal(harness.selectVisible.disabled, true);
});

test('bulk move toolbar selects visible issues, chooses active milestones, and invokes move', () => {
  const harness = createHarness({ selectedBulkMoveIssueIds: new Set([1]) });
  const details = new FakeElement('details');
  const checkbox1 = new FakeElement('input');
  checkbox1.className = 'issue-bulk-select-checkbox';
  checkbox1.dataset.issueId = '1';
  const checkbox2 = new FakeElement('input');
  checkbox2.className = 'issue-bulk-select-checkbox';
  checkbox2.dataset.issueId = '2';
  details.append(checkbox1, checkbox2);
  const toolbar = harness.ui.createMoveToolbar([makeIssue(1), makeIssue(2)]);
  details.append(toolbar);

  const count = toolbar.querySelector('.issue-bulk-move-count');
  const selectAll = toolbar.querySelector('.issue-bulk-select-all');
  const milestoneSelect = toolbar.querySelector('.issue-bulk-move-milestone');
  const moveButton = toolbar.querySelector('.issue-bulk-move-button');
  assert.equal(count.textContent, '1 selected');
  assert.deepEqual(milestoneSelect.children.map((option) => [option.textContent, option.value]), [
    ['Choose milestone', ''], ['Sprint', '8'],
  ]);
  assert.equal(moveButton.disabled, true);

  selectAll.listeners.get('click')();
  assert.deepEqual([...harness.calls.selectedBulkMoveIssueIds], [1, 2]);
  milestoneSelect.value = '8';
  milestoneSelect.listeners.get('change')();
  assert.equal(harness.state.bulkMoveMilestoneId, 8);
  assert.equal(moveButton.disabled, false);
  moveButton.listeners.get('click')();
  assert.equal(harness.calls.move, 1);
  assert.equal(harness.calls.render, 1);
});
