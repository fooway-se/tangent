import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// DOM-free helpers only; the modules touch `document` inside functions.
const events = await import('../../public/assets/inbox-events.js');
const guest = await import('../../public/assets/guest-view.js');
const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const css = await readFile(new URL('../../public/assets/app.css', import.meta.url), 'utf8');
const guestSource = await readFile(new URL('../../frontend/src/guest-view.ts', import.meta.url), 'utf8');

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

test('guest progress ranges stay valid for native progress elements', () => {
  assert.deepEqual(guest.progressRange(0, 0), { max: 1, value: 0 });
  assert.deepEqual(guest.progressRange(14, 21), { max: 21, value: 14 });
  assert.deepEqual(guest.progressRange(20, 10), { max: 10, value: 10 });
});

test('guest dashboard selects the earliest unfinished milestone and filters its shared issues by id', () => {
  const milestones = [
    { id: 4, name: 'Foundation', due_date: '2026-10-30', done: 3, total: 3 },
    { id: 8, name: 'Beta launch', due_date: '2026-11-27', done: 1, total: 2 },
  ];
  assert.equal(guest.featuredMilestone(milestones).id, 8);
  assert.equal(guest.featuredMilestone(milestones.map((item) => ({ ...item, done: item.total }))).id, 4);
  assert.equal(guest.featuredMilestone([]), null);
  const items = [
    { id: 1, title: 'Done', status: 'done', milestone_id: 8, milestone_name: 'Beta launch' },
    { id: 2, title: 'Other', status: 'planned', milestone_id: 9, milestone_name: 'Later' },
    { id: 3, title: 'Unassigned', status: 'doing', milestone_id: null, milestone_name: null },
  ];
  assert.deepEqual(guest.itemsForMilestone(items, 8).map((item) => item.id), [1]);
});

test('guest milestone countdown uses calendar days', () => {
  const today = new Date('2026-11-13T12:00:00Z');
  assert.equal(guest.daysUntil('2026-11-27', today), 14);
  assert.equal(guest.daysUntil('2026-11-13', today), 0);
  assert.equal(guest.daysUntil(null, today), null);
  assert.equal(guest.formatGuestDate('2026-11-27', true), 'Fri 27 Nov');
  assert.equal(guest.updateDateLabel('2026-11-16T10:00:00Z', new Date('2026-11-17T12:00:00Z')), 'Yesterday');
  assert.equal(guest.updateDateLabel('2026-11-10T10:00:00Z', new Date('2026-11-17T12:00:00Z')), 'Tue 10 Nov');
});

test('guest dashboard follows the customer mockup layout and remains responsive', () => {
  for (const className of [
    'guest-screen-heading', 'guest-project-overview', 'guest-stats', 'guest-approval-banner',
    'guest-planning-grid', 'guest-milestone-select', 'guest-deliverables', 'guest-updates', 'guest-composer-footer',
  ]) {
    assert.match(guestSource, new RegExp(className));
  }
  assert.match(css, /\.guest-planning-grid\s*\{[^}]*grid-template-columns/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.guest-planning-grid\s*\{[^}]*grid-template-columns/);
  assert.match(css, /\.guest-milestone-title strong\s*\{[^}]*font:[^;]*var\(--font-display\)/);
  assert.match(css, /\.guest-item-title\s*\{[^}]*font:[^;]*var\(--font-display\)/);
});

test('guest progress bars reuse the shared segmented progress treatment', () => {
  assert.match(guestSource, /el\('progress', `guest-progress/);
  assert.match(css, /#issue-progress, \.guest-progress\s*\{/);
  assert.match(css, /#issue-progress::-webkit-progress-bar, \.guest-progress::-webkit-progress-bar\s*\{[^}]*repeating-linear-gradient/);
  assert.match(css, /#issue-progress\.is-complete::-webkit-progress-value, \.guest-progress\.is-complete::-webkit-progress-value\s*\{[^}]*var\(--success\)/);
});

test('guest view renders its shared conversation alongside the composer', () => {
  assert.match(guestSource, /guest-conversation-list/);
  assert.match(guestSource, /message\.author_id === handlers\.userId/);
  assert.match(guestSource, /message\.author_name/);
  assert.match(app, /await api\(`\/projects\/\$\{projectId\}\/client-comments`[\s\S]*?await loadClientView\(projectId\)/);
  assert.match(app, /Your reply will be visible to the guest/);
  assert.doesNotMatch(app, /Message sent to the team/);
  assert.match(css, /\.guest-conversation-message\.is-own\s*\{[^}]*margin-left:\s*0/);
  assert.match(css, /\.guest-conversation-message\.is-reply\s*\{[^}]*margin-left:\s*auto/);
});

test('guest with no projects gets the same framed customer screen', () => {
  assert.match(app, /renderClientEmptyState\(guestMain/);
  assert.match(guestSource, /export function renderClientEmptyState\(/);
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

test('assigned issue type and status align with the title column', () => {
  assert.match(app, /primary\.className = 'inbox-issue-primary'/);
  assert.match(app, /primary\.append\(title, metadata\)/);
  assert.match(app, /mainline\.append\(key, primary\)/);
  assert.match(css, /\.inbox-issue-card \.inbox-issue-metadata\s*\{\s*margin:\s*4px 0 0;\s*\}/);
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

test('guest sign-in skips workspace and developer project loading', () => {
  const signIn = app.slice(app.indexOf("loginForm.addEventListener('submit'"), app.indexOf("workspaceSwitcher.addEventListener('click'"));
  assert.match(signIn, /showSignedIn\(result\.user\);\s*if \(result\.user\.role === 'guest'\) return;\s*await loadWorkspaces\(\);\s*await loadProjects\(\);/);
});

test('inbox message events select their source chat message', () => {
  const openEvent = app.slice(app.indexOf('async function openInboxEvent('), app.indexOf('function renderInboxIssues('));
  assert.match(openEvent, /event\.message_id/);
  assert.match(openEvent, /selectChatMessage\(/);
  assert.match(openEvent, /This issue is no longer available/);
});
