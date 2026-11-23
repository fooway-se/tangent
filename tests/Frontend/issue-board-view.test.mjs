import assert from 'node:assert/strict';
import test from 'node:test';
import { initIssueBoardView } from '../../public/assets/issue-board-view.js';

function element() {
  return {
    textContent: '',
    hidden: false,
    max: 0,
    value: 0,
    classList: { toggle() {} },
  };
}

function makeIssue(overrides = {}) {
  return {
    id: 1,
    project_id: 7,
    title: 'Prepare release',
    description: '',
    status: 'doing',
    type: 'task',
    priority: 'medium',
    due_date: null,
    assignee_id: 4,
    milestone_id: 3,
    milestone_name: null,
    is_ongoing: false,
    source_message_id: null,
    discussion_count: 0,
    is_shared: false,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-20T00:00:00Z',
    ...overrides,
  };
}

function createHarness({
  issues = [],
  milestones = [],
  deletedIssues = [],
  scope = 'active',
  order = 'updated',
  grouping = 'status',
  filter = '',
} = {}) {
  const selectedBulkAssignIssueIds = new Set();
  const selectedBulkMoveIssueIds = new Set();
  const output = {
    visibleBulkAssignIssueIds: new Set(),
    groups: [],
    bulkAssignSyncs: 0,
    deletedSyncs: 0,
    clearBulkMoveCalls: 0,
  };
  const issueProgress = element();
  const issueProgressLabel = element();
  const issueCountSummary = element();
  const emptyIssues = element();
  const deletedIssueCount = element();
  const deletedIssuesDetails = element();
  const ui = initIssueBoardView({
    issues: () => issues,
    milestones: () => milestones,
    deletedIssues: () => deletedIssues,
    scope: () => scope,
    order: () => order,
    grouping: () => grouping,
    filter: () => filter,
    issueAssigneeLabel: (id) => id === null ? 'Unassigned' : `Member ${id}`,
    issueProgress,
    issueProgressLabel,
    issueCountSummary,
    emptyIssues,
    deletedIssueCount,
    deletedIssuesDetails,
    getSelectedBulkMoveIssueIds: () => selectedBulkMoveIssueIds,
    getSelectedBulkAssignIssueIds: () => selectedBulkAssignIssueIds,
    setVisibleBulkAssignIssueIds: (ids) => { output.visibleBulkAssignIssueIds = ids; },
    clearBulkMoveSelection: () => { output.clearBulkMoveCalls += 1; selectedBulkMoveIssueIds.clear(); },
    syncBulkAssignControls: () => { output.bulkAssignSyncs += 1; },
    reconcileDeletedIssueRows: () => { output.deletedSyncs += 1; },
    issueBoardUi: { render: (groups) => { output.groups = groups; } },
    setTextContentIfChanged: (target, value) => { target.textContent = value; },
  });
  output.ui = ui;
  output.issueProgress = issueProgress;
  output.issueProgressLabel = issueProgressLabel;
  output.issueCountSummary = issueCountSummary;
  output.emptyIssues = emptyIssues;
  output.deletedIssueCount = deletedIssueCount;
  output.selectedBulkMoveIssueIds = selectedBulkMoveIssueIds;
  output.selectedBulkAssignIssueIds = selectedBulkAssignIssueIds;
  return output;
}

test('issue board view renders progress, counts, filtered visibility, and status groups', () => {
  const issues = [
    makeIssue(),
    makeIssue({ id: 2, title: 'Ongoing support', status: 'todo', milestone_id: null, is_ongoing: true, assignee_id: null }),
    makeIssue({ id: 3, title: 'Release notes', status: 'done', milestone_id: null, assignee_id: null }),
  ];
  const harness = createHarness({ issues, deletedIssues: [makeIssue({ id: 9 })] });
  harness.selectedBulkAssignIssueIds.add(1);

  harness.ui.render();

  assert.equal(harness.visibleBulkAssignIssueIds.size, 3);
  assert.equal(harness.bulkAssignSyncs, 1);
  assert.equal(harness.deletedSyncs, 1);
  assert.equal(harness.groups.length, 3);
  assert.deepEqual(harness.groups.map((group) => group.key), ['status:doing', 'status:todo', 'status:done']);
  assert.equal(harness.groups[0].issues[0].assignee_name, 'Member 4');
  assert.equal(harness.groups[0].issues[0].milestone_name, null);
  assert.equal(harness.issueCountSummary.textContent, '1 open · 1 done · 1 ongoing');
  assert.equal(harness.issueProgress.max, 2);
  assert.equal(harness.issueProgress.value, 1);
  assert.equal(harness.issueProgressLabel.textContent, '1 of 2 planned issues done · 1 ongoing');
  assert.equal(harness.deletedIssueCount.textContent, '1');
});

test('board filters update visible assignment ids and prune selections outside the filter', () => {
  const harness = createHarness({
    issues: [makeIssue(), makeIssue({ id: 2, title: 'Write test plan', milestone_id: null, assignee_id: null })],
    filter: 'release',
  });
  harness.selectedBulkAssignIssueIds.add(1);
  harness.selectedBulkAssignIssueIds.add(2);

  harness.ui.render();

  assert.deepEqual([...harness.visibleBulkAssignIssueIds], [1]);
  assert.deepEqual([...harness.selectedBulkAssignIssueIds], [1]);
  assert.equal(harness.bulkAssignSyncs, 1);
});

test('milestone grouping prunes ineligible move selections and next-up creates reorder positions', () => {
  const milestones = [{ id: 3, name: 'Sprint A', due_date: '2026-11-25', archived_at: null }];
  const issues = [
    makeIssue(),
    makeIssue({ id: 2, title: 'Follow up', status: 'todo', milestone_id: null, assignee_id: null }),
  ];
  const milestoneHarness = createHarness({ issues, milestones, grouping: 'milestone' });
  milestoneHarness.selectedBulkMoveIssueIds.add(1);
  milestoneHarness.selectedBulkMoveIssueIds.add(2);
  milestoneHarness.ui.render();

  const unassigned = milestoneHarness.groups.find((group) => group.key === 'milestone:none');
  assert.equal(unassigned.allowBulkMove, true);
  assert.equal(unassigned.openByDefault, true);
  assert.deepEqual([...milestoneHarness.selectedBulkMoveIssueIds], [2]);

  const nextUpHarness = createHarness({ issues, milestones, order: 'next_up' });
  nextUpHarness.ui.render();
  const sprint = nextUpHarness.groups.find((group) => group.key === 'milestone:3');
  assert.equal(sprint.issues.length, 1);
  assert.deepEqual(sprint.reorderByIssueId.get(1), {
    canMoveEarlier: false,
    canMoveLater: false,
    showMilestoneTag: false,
  });
});

test('issue board view gives scope-specific empty messages and clears move mode without active milestones', () => {
  const emptyCurrent = createHarness({ issues: [] });
  emptyCurrent.ui.render();
  assert.equal(emptyCurrent.emptyIssues.hidden, false);
  assert.equal(emptyCurrent.emptyIssues.textContent, 'No issues yet. Create the first one.');

  const noMilestones = createHarness({
    issues: [makeIssue({ milestone_id: null })],
    milestones: [{ id: 3, name: 'Archived', due_date: null, archived_at: '2026-11-01T00:00:00Z' }],
    grouping: 'milestone',
  });
  noMilestones.ui.render();
  assert.equal(noMilestones.clearBulkMoveCalls, 1);

  const history = createHarness({
    scope: 'history',
    grouping: 'milestone',
    issues: [],
    milestones: [{ id: 3, name: 'Archived Sprint', due_date: null, archived_at: '2026-11-01T00:00:00Z' }],
  });
  history.ui.render();
  assert.equal(history.emptyIssues.textContent, 'No archived milestone issues. Archive a milestone to move its issues into History.');

  const archivedHistory = createHarness({
    scope: 'history',
    grouping: 'milestone',
    issues: [makeIssue()],
    milestones: [{ id: 3, name: 'Archived Sprint', due_date: null, archived_at: '2026-11-01T00:00:00Z' }],
  });
  archivedHistory.ui.render();
  assert.ok(archivedHistory.groups.every((group) => group.openByDefault === false));
});
