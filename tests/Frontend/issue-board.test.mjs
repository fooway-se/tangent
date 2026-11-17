import assert from 'node:assert/strict';
import test from 'node:test';
import { filterIssues, groupIssues, sortIssues } from '../../public/assets/issue-board.js';

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
