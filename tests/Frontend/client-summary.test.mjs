import assert from 'node:assert/strict';
import test from 'node:test';
import { generateClientSummary } from '../../public/assets/client-summary.js';

const view = {
  project: { id: 9, name: 'Website refresh', status: 'active' },
  progress: { percent: 60, done: 3, total: 5 },
  next_milestone: { name: 'Beta launch', due_date: '2026-11-20' },
  milestones: [{ id: 7, name: 'Beta launch', due_date: '2026-11-20', done: 3, total: 5 }],
  approvals: [{ id: 4, title: 'Checkout flow', description: 'Please review the new flow.' }],
  items: [],
  updates: [],
  messages: [],
};

test('summary includes a dated client-safe snapshot, selected-period updates, and pending approvals', () => {
  const summary = generateClientSummary(
    view,
    {
      total_count: 7,
      updates: [
        { id: 1, text: 'Completed: Checkout flow', created_at: '2026-11-07T10:00:00Z' },
        { id: 2, text: 'Updated: Account page (in progress)', created_at: '2026-11-06T10:00:00Z' },
        { id: 3, text: 'Updated: Billing screen (testing)', created_at: '2026-11-05T10:00:00Z' },
        { id: 4, text: 'Updated: Sign-in flow (done)', created_at: '2026-11-04T10:00:00Z' },
        { id: 5, text: 'Updated: Profile page (planned)', created_at: '2026-11-03T10:00:00Z' },
        { id: 6, text: 'Updated: Internal-only title should not appear', created_at: '2026-11-02T10:00:00Z' },
      ],
    },
    '2026-11-01',
    '2026-11-07',
  );

  assert.match(summary, /Website refresh/);
  assert.match(summary, /60%/);
  assert.match(summary, /3 of 5/);
  assert.match(summary, /Beta launch/);
  assert.match(summary, /2026/);
  assert.match(summary, /Completed: Checkout flow/);
  assert.match(summary, /Awaiting client input/);
  assert.match(summary, /Checkout flow/);
  assert.match(summary, /2 more client-visible updates/);
  assert.doesNotMatch(summary, /Internal-only title/);
});

test('summary explains an empty update period and omits an empty client-action section', () => {
  const summary = generateClientSummary(
    { ...view, approvals: [], next_milestone: null, progress: { percent: 0, done: 0, total: 0 } },
    { total_count: 0, updates: [] },
    '2026-11-01',
    '2026-11-07',
  );

  assert.match(summary, /No client-visible issue status changes in this period/);
  assert.match(summary, /No shared items yet/);
  assert.doesNotMatch(summary, /Awaiting client input/);
});
