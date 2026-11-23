import assert from 'node:assert/strict';
import test from 'node:test';
import { initIssueActions } from '../../public/assets/issue-actions.js';

function issue(id, title, status = 'todo', projectId = 1) {
  return { id, title, status, project_id: projectId };
}

function createHarness(overrides = {}) {
  const state = {
    projectId: 1,
    issueListVisible: true,
    issueDetailVisible: false,
    selectedIssue: null,
    issues: [issue(1, 'Issue one'), issue(2, 'Issue two')],
  };
  const calls = {
    api: [], reports: [], detail: 0, board: 0, history: [], reloads: [], unauthorized: 0,
    rowQuery: null, focus: 0,
  };
  const focusTarget = { focus: () => { calls.focus += 1; } };
  const movedRow = {
    querySelector: (selector) => {
      calls.rowQuery = selector;
      return focusTarget;
    },
  };
  const issueList = {
    querySelector: (selector) => {
      calls.rowQuery = selector;
      return movedRow;
    },
  };
  const options = {
    api: async (path, request) => {
      calls.api.push({ path, request });
      return { issue: issue(1, 'Updated', 'doing') };
    },
    getProjectId: () => state.projectId,
    isIssueListVisible: () => state.issueListVisible,
    isIssueDetailVisible: () => state.issueDetailVisible,
    getSelectedIssue: () => state.selectedIssue,
    setSelectedIssue: (issue) => { state.selectedIssue = issue; },
    getIssues: () => state.issues,
    setIssues: (issues) => { state.issues = issues; },
    issueList,
    renderDetail: () => { calls.detail += 1; },
    renderBoard: () => { calls.board += 1; },
    loadStatusHistory: (issueId) => { calls.history.push(issueId); },
    reloadIssues: (projectId) => { calls.reloads.push(projectId); },
    isUnauthorized: (error) => error?.status === 401,
    onUnauthorized: () => { calls.unauthorized += 1; },
    report: (message, isError) => calls.reports.push({ message, isError: Boolean(isError) }),
    ...overrides,
  };
  return { actions: initIssueActions(options), state, calls, focusTarget, options };
}

test('status changes update the selected issue, detail, board, and status history', async () => {
  const harness = createHarness();
  harness.state.selectedIssue = issue(1, 'Issue one', 'todo');
  const updated = issue(1, 'Issue one', 'doing');
  harness.options.api = async (path, request) => {
    harness.calls.api.push({ path, request });
    return { issue: updated };
  };

  await harness.actions.updateStatus(harness.state.issues[0], 'doing');

  assert.equal(harness.calls.api[0].path, '/issues/1');
  assert.equal(harness.calls.api[0].request.method, 'PATCH');
  assert.deepEqual(JSON.parse(harness.calls.api[0].request.body), { status: 'doing' });
  assert.equal(harness.state.selectedIssue, updated);
  assert.equal(harness.state.issues[0], updated);
  assert.equal(harness.calls.detail, 1);
  assert.equal(harness.calls.board, 1);
  assert.deepEqual(harness.calls.history, [1]);
  assert.deepEqual(harness.calls.reports, [{ message: 'Issue status updated.', isError: false }]);
});

test('unchanged statuses skip the request and hidden details refresh the issue list', async () => {
  const harness = createHarness();
  await harness.actions.updateStatus(harness.state.issues[0], 'todo');
  assert.equal(harness.calls.api.length, 0);

  harness.state.issueDetailVisible = false;
  harness.state.selectedIssue = null;
  await harness.actions.updateStatus(harness.state.issues[0], 'doing');
  assert.deepEqual(harness.calls.reloads, [1]);
  assert.equal(harness.calls.reports.at(-1).message, 'Issue status updated.');
});

test('reordering updates the visible issue and restores focus to a usable move control', async () => {
  const harness = createHarness();
  const button = { disabled: false };
  const updated = issue(1, 'Issue one moved');
  harness.options.api = async (path, request) => {
    harness.calls.api.push({ path, request });
    return { issue: updated };
  };

  await harness.actions.move(harness.state.issues[0], 'down', button);

  assert.equal(harness.calls.api[0].path, '/issues/1/move');
  assert.equal(harness.calls.api[0].request.method, 'POST');
  assert.deepEqual(JSON.parse(harness.calls.api[0].request.body), { direction: 'down' });
  assert.equal(harness.state.issues[0], updated);
  assert.equal(harness.calls.board, 1);
  assert.equal(harness.calls.rowQuery, '[data-move-direction="down"]:not(:disabled)');
  assert.equal(harness.calls.focus, 1);
  assert.equal(button.disabled, false);
});

test('stale move results are ignored and unauthorized reorder errors are handled', async () => {
  const stale = createHarness();
  let finishMove;
  stale.options.api = () => new Promise((resolve) => { finishMove = resolve; });
  const button = { disabled: false };
  const pending = stale.actions.move(stale.state.issues[0], 'up', button);
  stale.state.projectId = 2;
  finishMove({ issue: issue(1, 'Stale', 'todo', 1) });
  await pending;
  assert.equal(stale.state.issues[0].title, 'Issue one');
  assert.equal(stale.calls.board, 0);
  assert.equal(button.disabled, false);

  const unauthorized = createHarness({ api: async () => { throw { status: 401 }; } });
  await unauthorized.actions.move(unauthorized.state.issues[0], 'up', { disabled: false });
  assert.equal(unauthorized.calls.unauthorized, 1);
  assert.equal(unauthorized.calls.reports.length, 0);
});
