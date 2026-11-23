import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiFailure } from '../../public/assets/api.js';
import { initIssueBulkActions } from '../../public/assets/issue-bulk-actions.js';

function makeIssue(id, overrides = {}) {
  return {
    id,
    project_id: 7,
    title: `Issue ${id}`,
    status: 'doing',
    assignee_id: null,
    is_shared: false,
    milestone_id: null,
    milestone_name: null,
    milestone_due_date: null,
    sort_order: 0,
    ...overrides,
  };
}

function createHarness({ api = async () => ({}), overrides = {} } = {}) {
  const state = {
    projectId: 7,
    activeProjectId: 7,
    issueViewVisible: true,
    issues: [makeIssue(1), makeIssue(2)],
    selectedIssue: makeIssue(1),
    selectedAssignIds: new Set([1, 2]),
    selectedMoveIds: new Set([1, 2]),
    assignTarget: '3',
    moveMilestoneId: 4,
    actionPending: false,
    movePending: false,
    milestones: [{ id: 4, name: 'Winter', due_date: '2026-12-01' }],
  };
  const calls = {
    api: [], reports: [], renderBoard: 0, renderDetail: 0, syncControls: 0,
    clearAssign: 0, clearMove: 0, focusAssign: 0, focusMilestone: [], unauthorized: 0, loadedProjects: [],
  };
  const actions = initIssueBulkActions({
    getProjectId: () => state.projectId,
    getActiveProjectId: () => state.activeProjectId,
    isIssueViewVisible: () => state.issueViewVisible,
    getIssues: () => state.issues,
    setIssues: (issues) => { state.issues = issues; },
    getSelectedIssue: () => state.selectedIssue,
    setSelectedIssue: (issue) => { state.selectedIssue = issue; },
    getSelectedAssignIssueIds: () => state.selectedAssignIds,
    getSelectedMoveIssueIds: () => state.selectedMoveIds,
    getAssignTargetValue: () => state.assignTarget,
    getMoveMilestoneId: () => state.moveMilestoneId,
    getMilestones: () => state.milestones,
    isActionPending: () => state.actionPending,
    setActionPending: (pending) => { state.actionPending = pending; },
    isMovePending: () => state.movePending,
    setMovePending: (pending) => { state.movePending = pending; },
    clearAssignSelection: () => { calls.clearAssign += 1; state.selectedAssignIds.clear(); },
    clearMoveSelection: () => { calls.clearMove += 1; state.selectedMoveIds.clear(); },
    focusMilestoneGroup: (milestoneId) => { calls.focusMilestone.push(milestoneId); },
    syncAssignControls: () => { calls.syncControls += 1; },
    renderBoard: () => { calls.renderBoard += 1; },
    renderDetail: () => { calls.renderDetail += 1; },
    focusAssignToggle: () => { calls.focusAssign += 1; },
    issueAssigneeLabel: (id) => `Member ${id}`,
    report: (message, isError = false) => calls.reports.push([message, isError]),
    loadProjectIssues: async (projectId) => { calls.loadedProjects.push(projectId); },
    onUnauthorized: () => { calls.unauthorized += 1; },
    api: async (path, init) => {
      calls.api.push([path, init]);
      return api(path, init, state);
    },
    ...overrides,
  });
  return { actions, state, calls };
}

test('assign selected issues updates board and detail, clears selection, and reloads issues', async () => {
  const harness = createHarness({ api: async () => ({ assigned_count: 2 }) });
  await harness.actions.assignSelectedIssues();

  assert.equal(harness.calls.api[0][0], '/projects/7/issues/assign');
  assert.deepEqual(JSON.parse(harness.calls.api[0][1].body), { issue_ids: [1, 2], assignee_id: 3 });
  assert.deepEqual(harness.state.issues.map((issue) => issue.assignee_id), [3, 3]);
  assert.equal(harness.state.selectedIssue.assignee_id, 3);
  assert.equal(harness.state.actionPending, false);
  assert.equal(harness.state.selectedAssignIds.size, 0);
  assert.equal(harness.calls.renderBoard, 1);
  assert.equal(harness.calls.renderDetail, 1);
  assert.equal(harness.calls.focusAssign, 1);
  assert.deepEqual(harness.calls.reports, [['Assigned 2 issues to Member 3.', false]]);
  assert.deepEqual(harness.calls.loadedProjects, [7]);
});

test('sharing handles no-op responses and ignores a response after project navigation', async () => {
  const noOp = createHarness({ api: async () => ({ updated_count: 0 }) });
  await noOp.actions.updateSelectedIssuesSharing(true);
  assert.deepEqual(JSON.parse(noOp.calls.api[0][1].body), { issue_ids: [1, 2], is_shared: true });
  assert.deepEqual(noOp.state.issues.map((issue) => issue.is_shared), [true, true]);
  assert.deepEqual(noOp.calls.reports, [['Selected issues were already shared with guests.', false]]);

  let resolveResponse;
  const stale = createHarness({ api: () => new Promise((resolve) => { resolveResponse = resolve; }) });
  stale.state.issues = stale.state.issues.map((issue) => ({ ...issue, is_shared: true }));
  const pending = stale.actions.updateSelectedIssuesSharing(false);
  stale.state.activeProjectId = 9;
  resolveResponse({ updated_count: 2 });
  await pending;
  assert.deepEqual(stale.state.issues.map((issue) => issue.is_shared), [true, true]);
  assert.equal(stale.state.actionPending, false);
  assert.equal(stale.calls.renderBoard, 1);
});

test('moving selected issues appends them to the milestone and handles unauthorized failures', async () => {
  const harness = createHarness({
    api: async () => ({ moved_count: 2 }),
    overrides: {},
  });
  harness.state.issues.push(makeIssue(3, { milestone_id: 4, sort_order: 4 }));
  await harness.actions.moveSelectedIssuesToMilestone();

  assert.equal(harness.calls.api[0][0], '/projects/7/issues/move-to-milestone');
  assert.deepEqual(JSON.parse(harness.calls.api[0][1].body), { issue_ids: [1, 2], milestone_id: 4 });
  assert.deepEqual(harness.state.issues.slice(0, 2).map((issue) => [issue.milestone_id, issue.milestone_name, issue.sort_order]), [
    [4, 'Winter', 5], [4, 'Winter', 6],
  ]);
  assert.equal(harness.state.movePending, false);
  assert.equal(harness.state.selectedMoveIds.size, 0);
  assert.deepEqual(harness.calls.focusMilestone, [4]);
  assert.deepEqual(harness.calls.reports, [['Moved 2 issues to Winter.', false]]);

  const unauthorized = createHarness({ api: async () => { throw new ApiFailure('Unauthorized', 401); } });
  await unauthorized.actions.assignSelectedIssues();
  assert.equal(unauthorized.state.actionPending, false);
  assert.equal(unauthorized.calls.unauthorized, 1);
  assert.deepEqual(unauthorized.calls.reports, []);
});
