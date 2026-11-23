import assert from 'node:assert/strict';
import test from 'node:test';
import { initIssuePollingController } from '../../public/assets/issue-polling-controller.js';

function issue(id, title, status = 'todo') {
  return { id, title, status };
}

function response(issues, etag) {
  return { issues, etag };
}

function createHarness(overrides = {}) {
  const state = {
    projectId: 1,
    pollingActive: true,
    documentHidden: false,
    updatesDeferred: false,
    deletedIssuesOpen: false,
    issues: [issue(1, 'Before')],
    deletedIssues: [],
    selectedIssue: null,
    detailVisible: false,
  };
  const calls = {
    fetch: [], renderBoard: 0, renderDetail: 0, statusHistory: [], removedDetail: 0,
    errors: [], unauthorized: 0,
  };
  const timers = new Map();
  let nextTimerId = 1;
  const queues = { active: [], deleted: [] };
  const options = {
    getProjectId: () => state.projectId,
    isPollingActive: (projectId) => state.pollingActive && state.projectId === projectId,
    isDocumentHidden: () => state.documentHidden,
    issueUpdatesAreDeferred: () => state.updatesDeferred,
    isDeletedIssuesOpen: () => state.deletedIssuesOpen,
    getIssues: () => state.issues,
    setIssues: (issues) => { state.issues = issues; },
    getDeletedIssues: () => state.deletedIssues,
    setDeletedIssues: (issues) => { state.deletedIssues = issues; },
    getSelectedIssue: () => state.selectedIssue,
    setSelectedIssue: (issue) => { state.selectedIssue = issue; },
    isIssueDetailVisible: () => state.detailVisible,
    onIssueRemovedFromDetail: () => { calls.removedDetail += 1; state.detailVisible = false; },
    fetchConditionalIssueList: async (projectId, deleted, etag) => {
      calls.fetch.push({ projectId, deleted, etag });
      const result = queues[deleted ? 'deleted' : 'active'].shift();
      if (result instanceof Error) throw result;
      return result;
    },
    renderIssueDetail: () => { calls.renderDetail += 1; },
    loadStatusHistory: (issueId) => { calls.statusHistory.push(issueId); },
    renderBoard: () => { calls.renderBoard += 1; },
    onError: (error) => { calls.errors.push(error); return false; },
    setTimeout: (callback, delay) => {
      const id = nextTimerId++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id) => { timers.delete(id); },
    ...overrides,
  };
  const controller = initIssuePollingController(options);
  return { controller, state, calls, timers, queues, options };
}

test('polling updates active and deleted collections and refreshes a changed selected issue', async () => {
  const harness = createHarness();
  harness.state.deletedIssuesOpen = true;
  harness.state.selectedIssue = issue(1, 'Before', 'todo');
  const updated = issue(1, 'After', 'doing');
  const added = issue(2, 'New');
  const deleted = issue(3, 'Deleted');
  harness.queues.active.push(response([updated, added], 'active-v1'));
  harness.queues.deleted.push(response([deleted], 'deleted-v1'));

  await harness.controller.poll(1);

  assert.deepEqual(harness.calls.fetch, [
    { projectId: 1, deleted: false, etag: null },
    { projectId: 1, deleted: true, etag: null },
  ]);
  assert.deepEqual(harness.state.issues, [updated, added]);
  assert.deepEqual(harness.state.deletedIssues, [deleted]);
  assert.equal(harness.state.selectedIssue, updated);
  assert.equal(harness.calls.renderDetail, 1);
  assert.deepEqual(harness.calls.statusHistory, [1]);
  assert.equal(harness.calls.renderBoard, 1);
  assert.equal(harness.controller.getDelay(), 1000);
});

test('conditional responses reuse the last ETag without rerendering unchanged collections', async () => {
  const harness = createHarness();
  harness.controller.seedActiveEtag('active-v1');
  harness.queues.active.push(response(null, 'active-v2'));

  await harness.controller.poll(1);

  assert.deepEqual(harness.calls.fetch, [{ projectId: 1, deleted: false, etag: 'active-v1' }]);
  assert.equal(harness.state.issues[0].title, 'Before');
  assert.equal(harness.calls.renderBoard, 0);
  assert.equal(harness.controller.getDelay(), 1500);

  harness.queues.active.push(response(null, 'active-v3'));
  await harness.controller.poll(1);
  assert.equal(harness.calls.fetch[1].etag, 'active-v2');
});

test('removing the selected issue returns from its detail to the issue list', async () => {
  const harness = createHarness();
  harness.state.selectedIssue = issue(1, 'Before');
  harness.state.detailVisible = true;
  harness.queues.active.push(response([], 'active-v2'));

  await harness.controller.poll(1);

  assert.equal(harness.state.selectedIssue, null);
  assert.equal(harness.calls.removedDetail, 1);
  assert.equal(harness.state.detailVisible, false);
  assert.equal(harness.calls.renderBoard, 1);
});

test('deferred changes are retained and force an unconditional refresh when editing ends', async () => {
  const harness = createHarness();
  harness.state.updatesDeferred = true;
  const incoming = issue(1, 'Incoming');
  harness.queues.active.push(response([incoming], 'etag-v1'));

  await harness.controller.poll(1);

  assert.equal(harness.state.issues[0].title, 'Before');
  assert.equal(harness.calls.renderBoard, 0);
  assert.equal(harness.controller.hasDeferredChanges(), true);
  harness.state.updatesDeferred = false;
  harness.controller.resumeDeferred();
  assert.deepEqual([...harness.timers.values()].map((timer) => timer.delay), [0]);

  harness.queues.active.push(response([incoming], 'etag-v2'));
  await harness.controller.poll(1);

  assert.equal(harness.calls.fetch[1].etag, null);
  assert.equal(harness.state.issues[0], incoming);
  assert.equal(harness.controller.hasDeferredChanges(), false);
  assert.equal(harness.calls.renderBoard, 1);
});

test('hidden document polls back off and schedule another check without fetching', async () => {
  const harness = createHarness();
  harness.state.documentHidden = true;

  await harness.controller.poll(1);

  assert.equal(harness.calls.fetch.length, 0);
  assert.equal(harness.controller.getDelay(), 5000);
  assert.deepEqual([...harness.timers.values()].map((timer) => timer.delay), [5000]);
});

test('pausing invalidates an in-flight response so it cannot overwrite current issues', async () => {
  const harness = createHarness();
  let resolveActive;
  harness.options.fetchConditionalIssueList = (projectId, deleted, etag) => {
    calls.fetch.push({ projectId, deleted, etag });
    return new Promise((resolve) => { resolveActive = resolve; });
  };
  const calls = harness.calls;
  const pending = harness.controller.poll(1);
  harness.controller.pause();
  resolveActive(response([issue(1, 'Stale')], 'stale'));

  await pending;

  assert.equal(harness.state.issues[0].title, 'Before');
  assert.equal(harness.calls.renderBoard, 0);
  assert.equal(harness.timers.size, 0);
});

test('unauthorized errors are delegated without scheduling a retry', async () => {
  let controller;
  const harness = createHarness({
    fetchConditionalIssueList: async () => { throw new Error('Unauthorized'); },
    onError: () => {
      harness.calls.unauthorized += 1;
      controller.stop();
      return true;
    },
  });
  controller = harness.controller;

  await controller.poll(1);

  assert.equal(harness.calls.unauthorized, 1);
  assert.equal(harness.calls.renderBoard, 0);
  assert.equal(harness.timers.size, 0);
});
