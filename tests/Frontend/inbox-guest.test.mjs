import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// DOM-free helpers only; the modules touch `document` inside functions.
const events = await import('../../public/assets/inbox-events.js');
const guest = await import('../../public/assets/guest-view.js');
const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');

const event = (id, type, read, done) => ({ id, type, read, done, actor_name: 'a', summary: 's', detail: null, project_id: 1, project_name: 'P', issue_id: null, message_id: null, created_at: '2026-11-17T10:00:00Z' });

test('inbox tabs filter events', () => {
  const list = [event(1, 'mention', false, false), event(2, 'status', false, false), event(3, 'reply', true, false), event(4, 'mention', true, true)];
  assert.deepEqual(events.eventsForTab(list, 'unread').map((e) => e.id), [1, 2]);
  assert.deepEqual(events.eventsForTab(list, 'all').map((e) => e.id), [1, 2, 3]);
  assert.deepEqual(events.eventsForTab(list, 'mentions').map((e) => e.id), [1]);
  assert.deepEqual(events.eventsForTab(list, 'done').map((e) => e.id), [4]);
  assert.deepEqual(events.eventsForTab(list, 'assigned'), []);
  assert.equal(events.tabCount(list, 'unread'), 2);
  assert.equal(events.tabCount(list, 'assigned'), null);
});

test('relative time is compact', () => {
  const now = new Date('2026-11-17T12:00:00Z');
  assert.equal(events.relativeTime('2026-11-17T11:55:00Z', now), '5 min');
  assert.equal(events.relativeTime('2026-11-17T09:00:00Z', now), '3 h');
  assert.equal(events.relativeTime('2026-11-15T12:00:00Z', now), '2 d');
});

test('guest progress segments are clamped', () => {
  assert.equal(guest.litSegments(0, 0), 0);
  assert.equal(guest.litSegments(6, 15), 4);
  assert.equal(guest.litSegments(20, 10), 10);
});

test('guest shell and inbox tabs exist in the page', () => {
  assert.match(html, /id="guest-shell"/);
  assert.match(html, /id="guest-main"/);
  assert.match(html, /id="inbox-tabs"/);
  assert.match(html, /id="inbox-mark-all-read"/);
});

test('admin can create a guest account from the existing user form', () => {
  assert.match(html, /<select[^>]+name="role"/);
  assert.match(html, /<option value="guest">Guest<\/option>/);
});

test('issue editor can share work and request guest approval', () => {
  assert.match(html, /name="is_shared"/);
  assert.match(html, /name="approval_requested"/);
  assert.match(app, /is_shared:/);
  assert.match(app, /approval_requested:/);
});

test('new views never use innerHTML', async () => {
  for (const file of ['inbox-events', 'guest-view']) {
    const source = await readFile(new URL(`../../frontend/src/${file}.ts`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML/);
  }
});

test('guest startup does not request workspace or internal project data', () => {
  const startup = app.slice(app.indexOf('async function start()'), app.indexOf('void start();'));
  assert.match(startup, /showSignedIn\(result\.user\);\s*if \(result\.user\.role === 'guest'\) return;/);
});

test('inbox message events select their source chat message', () => {
  const openEvent = app.slice(app.indexOf('async function openInboxEvent('), app.indexOf('function renderInboxIssues('));
  assert.match(openEvent, /event\.message_id/);
  assert.match(openEvent, /selectChatMessage\(/);
  assert.match(openEvent, /This issue is no longer available/);
});
