import assert from 'node:assert/strict';
import test from 'node:test';
import { initIssueDetailEditUi } from '../../public/assets/issue-detail-edit-ui.js';

class FakeElement extends EventTarget {
  constructor() {
    super();
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.value = '';
    this.title = '';
    this.textContent = '';
    this.open = false;
    this.attributes = new Map();
    this.focused = false;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  reset() { this.resetCalled = true; }
  focus() { this.focused = true; }
  click() { this.dispatchEvent(new Event('click', { bubbles: true, cancelable: true })); }
}

const issue = {
  id: 21, project_id: 7, workspace_id: 2, created_by: 3,
  title: 'Prepare release', description: 'Review changes', status: 'todo',
  priority: 'high', due_date: '2026-12-01', type: 'task', assignee_id: 5,
  milestone_id: 8, is_ongoing: false, is_shared: true, approval_requested_at: null,
  is_blocked: true, blocked_at: '2026-11-24 08:00:00', blocking_reason: 'Waiting on review',
};

function setup({ api } = {}) {
  const ids = [
    'issue-detail-edit-form', 'issue-detail-display', 'issue-detail-edit-button',
    'issue-detail-cancel-button', 'issue-detail-save-button', 'issue-detail-title-input',
    'issue-detail-description-input', 'issue-detail-priority-input', 'issue-detail-due-date-input',
    'issue-detail-type-input', 'issue-detail-assignee-input', 'issue-detail-milestone-input',
    'issue-detail-ongoing-input', 'issue-detail-shared-input', 'issue-detail-approval-input',
    'issue-detail-blocked-input', 'issue-detail-blocking-reason-input',
  ];
  const elements = new Map(ids.map((id) => [`#${id}`, new FakeElement()]));
  const doc = { querySelector: (selector) => elements.get(selector) ?? null };
  const previousDocument = globalThis.document;
  globalThis.document = doc;
  let selectedIssue = issue;
  let projectId = issue.project_id;
  const calls = [];
  const updates = [];
  const renders = [];
  const reports = [];
  const focusEvents = [];
  const ui = initIssueDetailEditUi({
    getIssue: () => selectedIssue,
    getProjectId: () => projectId,
    isDetailVisible: () => true,
    populateAssigneeSelect: (select, value) => { select.value = value === null ? '' : String(value); },
    populateMilestoneSelect: (select, value) => { select.value = value === null ? '' : String(value); },
    updateOngoingMilestoneControl: (ongoing, milestone) => { milestone.disabled = ongoing.checked; },
    submitFormOnEnter: () => {},
    api: async (path, init) => {
      calls.push([path, init]);
      if (api !== undefined) return await api(path, init);
      return { issue: { ...issue, title: 'Prepared release' } };
    },
    onUpdated: (updatedIssue) => { selectedIssue = updatedIssue; updates.push(updatedIssue); },
    renderDetail: () => renders.push('detail'),
    renderBoard: () => renders.push('board'),
    report: (message, isError = false) => reports.push([message, isError]),
    onFocusEditButton: () => focusEvents.push('edit-button'),
    doc,
  });
  return {
    ui, elements, calls, updates, renders, reports, focusEvents,
    setIssue: (nextIssue) => { selectedIssue = nextIssue; },
    setProjectId: (nextId) => { projectId = nextId; },
    cleanup: () => {
      ui.dispose();
      if (previousDocument === undefined) delete globalThis.document;
      else globalThis.document = previousDocument;
    },
  };
}

test('issue editor opens with current values and applies ongoing/shared field rules', (t) => {
  const { ui, elements, cleanup } = setup();
  t.after(cleanup);

  ui.open(issue);

  assert.equal(elements.get('#issue-detail-edit-form').hidden, false);
  assert.equal(elements.get('#issue-detail-display').hidden, true);
  assert.equal(elements.get('#issue-detail-title-input').value, 'Prepare release');
  assert.equal(elements.get('#issue-detail-description-input').value, 'Review changes');
  assert.equal(elements.get('#issue-detail-assignee-input').value, '5');
  assert.equal(elements.get('#issue-detail-milestone-input').value, '8');
  assert.equal(elements.get('#issue-detail-approval-input').disabled, false);
  assert.equal(elements.get('#issue-detail-blocked-input').checked, true);
  assert.equal(elements.get('#issue-detail-blocking-reason-input').value, 'Waiting on review');
  assert.equal(elements.get('#issue-detail-title-input').focused, true);

  const shared = elements.get('#issue-detail-shared-input');
  shared.checked = false;
  shared.dispatchEvent(new Event('change'));
  assert.equal(elements.get('#issue-detail-approval-input').checked, false);
  assert.equal(elements.get('#issue-detail-approval-input').disabled, true);
});

test('issue editor saves normalized fields and refreshes detail and board views', async (t) => {
  const { ui, elements, calls, updates, renders, reports, cleanup } = setup();
  t.after(cleanup);
  ui.open(issue);
  elements.get('#issue-detail-title-input').value = 'Prepared release';
  elements.get('#issue-detail-due-date-input').value = '';
  elements.get('#issue-detail-assignee-input').value = '';
  elements.get('#issue-detail-milestone-input').value = '';
  elements.get('#issue-detail-ongoing-input').checked = true;
  elements.get('#issue-detail-shared-input').checked = false;
  elements.get('#issue-detail-approval-input').checked = false;
  elements.get('#issue-detail-blocked-input').checked = true;
  elements.get('#issue-detail-blocking-reason-input').value = 'Waiting for security review';

  elements.get('#issue-detail-edit-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls[0][0], '/issues/21');
  assert.equal(calls[0][1].method, 'PATCH');
  assert.deepEqual(JSON.parse(calls[0][1].body), {
    title: 'Prepared release',
    description: 'Review changes',
    priority: 'high',
    due_date: null,
    type: 'task',
    assignee_id: null,
    milestone_id: null,
    is_ongoing: true,
    is_shared: false,
    approval_requested: false,
    is_blocked: true,
    blocking_reason: 'Waiting for security review',
  });
  assert.equal(updates[0].title, 'Prepared release');
  assert.deepEqual(renders, ['detail', 'board']);
  assert.deepEqual(reports, [['Issue updated.', false]]);
  assert.equal(elements.get('#issue-detail-edit-form').hidden, true);
});

test('issue editor ignores a save response after navigation to another issue', async (t) => {
  let resolveApi;
  const { ui, elements, updates, cleanup, setIssue } = setup({
    api: () => new Promise((resolve) => { resolveApi = resolve; }),
  });
  t.after(cleanup);
  ui.open(issue);
  elements.get('#issue-detail-edit-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  setIssue({ ...issue, id: 22 });
  resolveApi({ issue: { ...issue, title: 'Stale response' } });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(updates, []);
});
