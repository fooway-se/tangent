import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  diffInboxCollections,
  nextInboxPollDelay,
  shouldDeferInboxUpdates,
} from '../../public/assets/inbox-polling.js';

const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const inboxEventsSource = await readFile(new URL('../../frontend/src/inbox-events.ts', import.meta.url), 'utf8');

test('inbox collection diff reports only changed, added, removed, and reordered rows', () => {
  const before = [
    { id: 1, title: 'Keep' },
    { id: 2, title: 'Old title' },
    { id: 3, title: 'Remove' },
  ];
  const after = [
    { id: 4, title: 'New' },
    { id: 2, title: 'New title' },
    { id: 1, title: 'Keep' },
  ];

  assert.deepEqual(diffInboxCollections(before, after), {
    added: [4],
    changed: [2],
    removed: [3],
    orderChanged: true,
  });
});

test('inbox polling backs off while quiet and resets to fast polling after changes', () => {
  assert.equal(nextInboxPollDelay(1000, false, false), 1500);
  assert.equal(nextInboxPollDelay(9000, false, false), 10000);
  assert.equal(nextInboxPollDelay(9000, true, false), 1000);
  assert.equal(nextInboxPollDelay(1000, false, true), 5000);
});

test('inbox updates defer while the user is working in the list or an action is pending', () => {
  assert.equal(shouldDeferInboxUpdates({ listFocused: true }), true);
  assert.equal(shouldDeferInboxUpdates({ mutationPending: true }), true);
  assert.equal(shouldDeferInboxUpdates({}), false);
});

test('inbox polling uses conditional requests and reconciles rows in place', () => {
  assert.match(app, /function fetchConditionalInboxCollection/);
  assert.match(app, /headers\.set\('If-None-Match', etag\)/);
  assert.match(app, /response\.status === 304/);
  assert.match(app, /fetchConditionalInboxCollection<InboxIssue>\('\/inbox', 'issues'/);
  assert.match(app, /fetchConditionalInboxCollection<InboxEvent>\('\/inbox\/events', 'events'/);
  assert.match(app, /function scheduleInboxPoll\(/);
  assert.match(app, /function stopInboxPolling\(/);
  assert.match(app, /function resumeDeferredInboxPolling\(/);
  assert.match(app, /inboxPollHasDeferredChanges/);
  assert.match(app, /function reconcileInboxRows/);
  assert.doesNotMatch(app, /inboxIssueList\.replaceChildren\(\.\.\.inboxIssues\.map/);
  assert.doesNotMatch(app, /inboxIssueList\.replaceChildren\(\.\.\.events\.map/);
  assert.doesNotMatch(app, /inboxTabsElement\.replaceChildren/);
});

test('inbox row reconciliation preserves focus on event actions', () => {
  assert.match(app, /focused\?\.matches\('\.inbox-event-read'\)/);
  assert.match(app, /focused\?\.matches\('\.inbox-event-done'\)/);
  assert.match(inboxEventsSource, /inbox-event-read/);
  assert.match(inboxEventsSource, /inbox-event-done/);
  assert.match(app, /const nextFocusTarget = nextRow\?\.querySelector<HTMLElement>\('\.issue-title-button'\)[\s\S]*?nextFocusTarget\?\.focus\(\)/);
});

test('local event actions preserve pending refreshes for the other inbox collection', () => {
  const updateStart = app.indexOf('async function updateInboxEvent(');
  const updateEnd = app.indexOf('\nasync function markAllInboxEventsRead(', updateStart + 1);
  const update = app.slice(updateStart, updateEnd);
  const markAllStart = updateEnd;
  const markAllEnd = app.indexOf('\nasync function openInboxEvent(', markAllStart + 1);
  const markAll = app.slice(markAllStart, markAllEnd);
  assert.doesNotMatch(update, /inboxPollHasDeferredChanges = false/);
  assert.doesNotMatch(markAll, /inboxPollHasDeferredChanges = false/);
});
