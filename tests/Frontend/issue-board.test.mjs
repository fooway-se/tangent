import assert from 'node:assert/strict';
import test from 'node:test';
import { filterIssues, groupIssues, groupIssuesByMilestone, milestoneProgress, sortIssues } from '../../public/assets/issue-board.js';

const issues = [
  { id: 12, title: 'Fix login redirect', description: 'After reset', status: 'doing', created_at: '2026-11-01', updated_at: '2026-11-14' },
  { id: 13, title: 'Add client roles', description: '', status: 'todo', created_at: '2026-11-02', updated_at: '2026-11-12' },
  { id: 14, title: 'Export CSV', description: 'Allow downloads', status: 'backlog', created_at: '2026-11-03', updated_at: '2026-11-13' },
  { id: 15, title: 'Update docs', description: '', status: 'done', created_at: '2026-11-04', updated_at: '2026-11-10' },
];

test('issues group in the visual status order with accurate counts', () => {
  const groups = groupIssues(issues);
  assert.deepEqual(groups.map((group) => group.status), ['doing', 'todo', 'backlog', 'done']);
  assert.deepEqual(groups.map((group) => group.issues.length), [1, 1, 1, 1]);
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

test('issue filter matches title, description, status, and identifier', () => {
  assert.deepEqual(filterIssues(issues, 'login').map((issue) => issue.id), [12]);
  assert.deepEqual(filterIssues(issues, 'downloads').map((issue) => issue.id), [14]);
  assert.deepEqual(filterIssues(issues, '#13').map((issue) => issue.id), [13]);
  assert.deepEqual(filterIssues(issues, 'doing').map((issue) => issue.id), [12]);
});

test('issue order choices sort copies without mutating the input', () => {
  assert.deepEqual(sortIssues(issues, 'updated').map((issue) => issue.id), [12, 14, 13, 15]);
  assert.deepEqual(sortIssues(issues, 'title').map((issue) => issue.id), [13, 14, 12, 15]);
  assert.equal(issues[0].id, 12);
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

test('milestone progress ignores cancelled issues and completes only when active work exists and is done', () => {
  assert.deepEqual(milestoneProgress([
    { status: 'done' },
    { status: 'done' },
    { status: 'cancelled' },
  ]), { done: 2, active: 2, cancelled: 1, complete: true });
  assert.deepEqual(milestoneProgress([
    { status: 'done' },
    { status: 'doing' },
    { status: 'cancelled' },
  ]), { done: 1, active: 2, cancelled: 1, complete: false });
  assert.deepEqual(milestoneProgress([]), { done: 0, active: 0, cancelled: 0, complete: false });
});
