import assert from 'node:assert/strict';
import test from 'node:test';
import { parseQuickIssueInput } from '../../public/assets/quick-issue.js';

const members = [
  { id: 1, name: 'Niklas', email: 'niklas@example.test' },
  { id: 2, name: 'Review Admin', email: 'review@example.test' },
  { id: 3, name: 'Alex', email: 'alex.one@example.test' },
  { id: 4, name: 'Alex', email: 'alex.two@example.test' },
];
const milestones = [{ id: 10, name: 'First release' }];

test('quick issue parsing accepts a title with optional assignee, type, and milestone tokens', () => {
  assert.deepEqual(parseQuickIssueInput(
    'Fix login redirect @niklas type:BUG milestone:"First release"',
    members,
    milestones,
  ), {
    title: 'Fix login redirect',
    assigneeId: 1,
    type: 'bug',
    milestoneId: 10,
  });
});

test('quick issue parsing accepts priority and an ISO due date', () => {
  assert.deepEqual(parseQuickIssueInput(
    'Ship account export priority:urgent due:2026-11-30',
    members,
    milestones,
  ), {
    title: 'Ship account export',
    priority: 'urgent',
    dueDate: '2026-11-30',
  });
});

test('quick issue parsing supports quoted member names and leaves ordinary titles alone', () => {
  assert.deepEqual(parseQuickIssueInput('Fix it asap', members, milestones), { title: 'Fix it asap' });
  assert.deepEqual(parseQuickIssueInput('Review the access flow @"Review Admin"', members, milestones), {
    title: 'Review the access flow',
    assigneeId: 2,
  });
});

test('unknown or ambiguous tokens remain part of the issue title', () => {
  assert.deepEqual(parseQuickIssueInput(
    'Check with @alex type:urgent milestone:Future !high due:fri',
    members,
    milestones,
  ), { title: 'Check with @alex type:urgent milestone:Future !high due:fri' });
});

test('invalid priority and calendar dates stay in the title', () => {
  assert.deepEqual(parseQuickIssueInput(
    'Check deploy priority:critical due:2026-02-30',
    members,
    milestones,
  ), { title: 'Check deploy priority:critical due:2026-02-30' });
});

test('each metadata token is optional', () => {
  assert.deepEqual(parseQuickIssueInput('A plain issue title', members, milestones), { title: 'A plain issue title' });
  assert.deepEqual(parseQuickIssueInput('Repair login @niklas', members, milestones), {
    title: 'Repair login',
    assigneeId: 1,
  });
  assert.deepEqual(parseQuickIssueInput('First release prep type:task', members, milestones), {
    title: 'First release prep',
    type: 'task',
  });
});

test('metadata tokens do not make a title optional', () => {
  assert.deepEqual(parseQuickIssueInput('@niklas type:bug milestone:"First release"', members, milestones), {
    title: '',
    assigneeId: 1,
    type: 'bug',
    milestoneId: 10,
  });
});
