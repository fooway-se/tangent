import assert from 'node:assert/strict';
import test from 'node:test';
import { discussionIndicatorLabel, filterIssues, filterIssuesByMilestoneArchive, groupIssues, groupIssuesByMilestone, milestoneProgress, projectProgress, sortIssues } from '../../public/assets/issue-board.js';

const issues = [
  { id: 12, title: 'Fix login redirect', description: 'After reset', status: 'doing', created_at: '2026-11-01', updated_at: '2026-11-14' },
  { id: 16, title: 'Run regression suite', description: '', status: 'testing', created_at: '2026-11-05', updated_at: '2026-11-15' },
  { id: 13, title: 'Add client roles', description: '', status: 'todo', created_at: '2026-11-02', updated_at: '2026-11-12' },
  { id: 14, title: 'Export CSV', description: 'Allow downloads', status: 'backlog', created_at: '2026-11-03', updated_at: '2026-11-13' },
  { id: 15, title: 'Update docs', description: '', status: 'done', created_at: '2026-11-04', updated_at: '2026-11-10' },
];

test('discussion indicators are omitted for empty discussions and label message counts accessibly', () => {
  assert.equal(discussionIndicatorLabel(0), null);
  assert.equal(discussionIndicatorLabel(1), '1 discussion message');
  assert.equal(discussionIndicatorLabel(4), '4 discussion messages');
});

test('issues group in the visual status order with accurate counts', () => {
  const groups = groupIssues(issues);
  assert.deepEqual(groups.map((group) => group.status), ['doing', 'testing', 'todo', 'backlog', 'done']);
  assert.deepEqual(groups.map((group) => group.issues.length), [1, 1, 1, 1, 1]);
});

test('issues group by milestone in due-date order with unassigned issues last', () => {
  const milestones = [
    { id: 7, name: 'Later', due_date: '2027-02-01' },
    { id: 3, name: 'Soon', due_date: '2027-01-10' },
    { id: 8, name: 'No date', due_date: null },
  ];
  const planned = [
    { ...issues[0], id: 31, milestone_id: 7, milestone_name: 'Later', milestone_due_date: '2027-02-01' },
    { ...issues[1], id: 32, milestone_id: null },
    { ...issues[2], id: 33, milestone_id: 3, milestone_name: 'Soon', milestone_due_date: '2027-01-10' },
    { ...issues[3], id: 34, milestone_id: 8, milestone_name: 'No date' },
  ];

  const groups = groupIssuesByMilestone(planned, milestones);
  assert.deepEqual(groups.map((group) => group.name), ['Soon', 'Later', 'No date', 'No milestone']);
  assert.deepEqual(groups.map((group) => group.issues.map((issue) => issue.id)), [[33], [31], [34], [32]]);
});

test('ongoing issues get their own group apart from issues that are simply unplanned', () => {
  const groups = groupIssuesByMilestone([
    { ...issues[0], id: 51, milestone_id: null, is_ongoing: true },
    { ...issues[1], id: 52, milestone_id: null },
  ], []);
  assert.deepEqual(groups.map((group) => group.name), ['Ongoing', 'No milestone']);
  assert.deepEqual(groups.map((group) => group.issues.map((issue) => issue.id)), [[51], [52]]);
  assert.equal(groups[0].isOngoing, true);
});

test('milestone history filtering hides archived milestone issues from current work and preserves unassigned issues', () => {
  const milestones = [
    { id: 1, name: 'Current', due_date: null, archived_at: null },
    { id: 2, name: 'Shelved', due_date: null, archived_at: '2026-11-20 12:00:00' },
  ];
  const planned = [
    { ...issues[0], id: 41, milestone_id: 1 },
    { ...issues[1], id: 42, milestone_id: 2 },
    { ...issues[2], id: 43, milestone_id: null },
  ];

  assert.deepEqual(filterIssuesByMilestoneArchive(planned, milestones, 'active').map((issue) => issue.id), [41, 43]);
  assert.deepEqual(filterIssuesByMilestoneArchive(planned, milestones, 'history').map((issue) => issue.id), [42]);
});

test('issue filter matches title, description, status, and identifier', () => {
  assert.deepEqual(filterIssues(issues, 'login').map((issue) => issue.id), [12]);
  assert.deepEqual(filterIssues(issues, 'downloads').map((issue) => issue.id), [14]);
  assert.deepEqual(filterIssues(issues, '#13').map((issue) => issue.id), [13]);
  assert.deepEqual(filterIssues(issues, 'doing').map((issue) => issue.id), [12]);
  assert.deepEqual(filterIssues(issues, 'testing').map((issue) => issue.id), [16]);
});

test('issue filter matches priority and issue due date', () => {
  const planned = [
    { ...issues[0], priority: 'urgent', due_date: '2026-11-30' },
    { ...issues[1], priority: 'low', due_date: null },
  ];
  assert.deepEqual(filterIssues(planned, 'urgent').map((issue) => issue.id), [12]);
  assert.deepEqual(filterIssues(planned, '2026-11-30').map((issue) => issue.id), [12]);
});

test('issue order choices sort copies without mutating the input', () => {
  assert.deepEqual(sortIssues(issues, 'updated').map((issue) => issue.id), [16, 12, 14, 13, 15]);
  assert.deepEqual(sortIssues(issues, 'title').map((issue) => issue.id), [13, 14, 12, 16, 15]);
  assert.equal(issues[0].id, 12);
});

test('priority order puts urgent issues before lower priority issues', () => {
  const planned = [
    { ...issues[0], id: 21, priority: 'low' },
    { ...issues[1], id: 22, priority: 'urgent' },
    { ...issues[2], id: 23, priority: 'high' },
    { ...issues[3], id: 24, priority: 'medium' },
  ];
  assert.deepEqual(sortIssues(planned, 'priority').map((issue) => issue.id), [22, 23, 24, 21]);
});

test('next-up order uses milestone due dates, then the saved issue sequence', () => {
  const planned = [
    { ...issues[0], id: 21, milestone_id: 3, milestone_due_date: '2027-02-01', sort_order: 2048 },
    { ...issues[0], id: 22, milestone_id: 3, milestone_due_date: '2027-02-01', sort_order: 1024 },
    { ...issues[0], id: 23, milestone_id: 4, milestone_due_date: '2027-01-10', sort_order: 9000 },
    { ...issues[0], id: 24, milestone_id: 5, milestone_due_date: null, sort_order: 100 },
    { ...issues[0], id: 25, milestone_id: null, milestone_due_date: null, sort_order: 1 },
  ];
  assert.deepEqual(sortIssues(planned, 'next_up').map((issue) => issue.id), [23, 22, 21, 24, 25]);
});

test('next-up order uses an issue due date ahead of its milestone date', () => {
  const planned = [
    { ...issues[0], id: 31, milestone_id: 3, milestone_due_date: '2027-01-10', due_date: '2027-02-10' },
    { ...issues[1], id: 32, milestone_id: null, due_date: '2026-12-01' },
  ];
  assert.deepEqual(sortIssues(planned, 'next_up').map((issue) => issue.id), [32, 31]);
});

test('milestone progress ignores cancelled issues and completes only when active work exists and is done', () => {
  assert.deepEqual(milestoneProgress([
    { status: 'done' },
    { status: 'done' },
    { status: 'cancelled' },
  ]), { done: 2, active: 2, cancelled: 1, complete: true });
  assert.deepEqual(milestoneProgress([
    { status: 'done' },
    { status: 'testing' },
    { status: 'cancelled' },
  ]), { done: 1, active: 2, cancelled: 1, complete: false });
  assert.deepEqual(milestoneProgress([]), { done: 0, active: 0, cancelled: 0, complete: false });
});

test('milestone progress excludes ongoing work from the planned completion denominator', () => {
  assert.deepEqual(milestoneProgress([
    { status: 'done' },
    { status: 'doing', is_ongoing: true },
    { status: 'cancelled' },
  ]), { done: 1, active: 1, cancelled: 1, complete: true });
});

test('ongoing issues do not block project completion and are counted separately', () => {
  assert.deepEqual(projectProgress([
    { status: 'done' },
    { status: 'testing' },
    { status: 'doing', is_ongoing: true },
    { status: 'cancelled' },
  ]), { done: 1, total: 2, ongoing: 1, cancelled: 1, complete: false });
  assert.deepEqual(projectProgress([
    { status: 'done' },
    { status: 'doing', is_ongoing: true },
  ]), { done: 1, total: 1, ongoing: 1, cancelled: 0, complete: true });
});
