import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// DOM-free helpers only; the modules touch `document` inside functions.
const events = await import('../../public/assets/inbox-events.js');
const guest = await import('../../public/assets/guest-view.js');
const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const authUi = await readFile(new URL('../../frontend/src/auth-ui.ts', import.meta.url), 'utf8');
const inboxUi = await readFile(new URL('../../frontend/src/inbox-ui.ts', import.meta.url), 'utf8');
const css = await readFile(new URL('../../public/assets/app.css', import.meta.url), 'utf8');
const guestSource = await readFile(new URL('../../frontend/src/guest-view.ts', import.meta.url), 'utf8');
const guestUi = await readFile(new URL('../../frontend/src/guest-ui.ts', import.meta.url), 'utf8');

const event = (id, type, read, done) => ({ id, type, read, done, actor_name: 'a', summary: 's', detail: null, project_id: 1, project_name: 'P', issue_id: null, message_id: null, created_at: '2026-11-17T10:00:00Z' });

test('inbox tabs filter events', () => {
  const list = [event(1, 'mention', false, false), event(2, 'status', false, false), event(3, 'reply', true, false), event(4, 'mention', true, true)];
  assert.deepEqual(events.eventsForTab(list, 'unread').map((e) => e.id), [1, 2]);
  assert.deepEqual(events.eventsForTab(list, 'all').map((e) => e.id), [1, 2, 3]);
  assert.deepEqual(events.eventsForTab(list, 'mentions').map((e) => e.id), [1]);
  assert.deepEqual(events.eventsForTab(list, 'done').map((e) => e.id), [4]);
  assert.equal(events.tabCount(list, 'unread'), 2);
  assert.equal(events.tabCount(list, 'done'), null);
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

test('project, guest, and roadmap progress bars share the segmented treatment', () => {
  assert.match(guestSource, /el\('progress', `guest-progress/);
  assert.match(css, /#issue-progress, \.guest-progress, \.roadmap-progress\s*\{/);
  assert.match(css, /#issue-progress::-webkit-progress-bar, \.guest-progress::-webkit-progress-bar, \.roadmap-progress::-webkit-progress-bar\s*\{[^}]*repeating-linear-gradient/);
  assert.match(css, /#issue-progress\.is-complete::-webkit-progress-value, \.guest-progress\.is-complete::-webkit-progress-value, \.roadmap-progress\.is-complete::-webkit-progress-value\s*\{[^}]*var\(--success\)/);
});

test('guest view renders its shared conversation alongside the composer', () => {
  assert.match(guestSource, /guest-conversation-list/);
  assert.match(guestSource, /message\.author_id === handlers\.userId/);
  assert.match(guestSource, /message\.author_name/);
  assert.match(guestUi, /await request\(`\/projects\/\$\{projectId\}\/client-comments`[\s\S]*?await loadClientView\(projectId\)/);
  assert.match(app, /Your reply will be visible to the guest/);
  assert.doesNotMatch(app, /Message sent to the team/);
  assert.match(css, /\.guest-conversation-message\.is-own\s*\{[^}]*margin-left:\s*0/);
  assert.match(css, /\.guest-conversation-message\.is-reply\s*\{[^}]*margin-left:\s*auto/);
});

test('project chat identifies client authors and client-visible messages with compact icons', () => {
  assert.match(app, /message\.author_role === 'guest'/);
  assert.match(app, /message\.is_client_visible/);
  assert.match(app, /chat-message-marker/);
  assert.match(app, /Client message/);
  assert.match(app, /Visible to client/);
  assert.match(css, /\.chat-message-marker\s*\{[^}]*width:\s*12px/);
});

test('project chat replies quote their parent and can jump back to it', () => {
  assert.match(app, /parent_author_name/);
  assert.match(app, /parent_body/);
  assert.match(app, /chat-reply-context/);
  assert.match(app, /context\.textContent = `↳ \$\{parentLabel\}`/);
  assert.match(app, /context\.addEventListener\('click', \(\) => void focusChatMessageById/);
  assert.match(app, /function focusChatMessageById\(/);
  assert.match(app, /sourceMessage\.scrollIntoView\(\{ behavior: 'smooth', block: 'center' \}\)/);
  assert.match(css, /\.chat-reply-context\s*\{[^}]*white-space:\s*nowrap/);
});

test('project chat shows reply counts that jump to the first reply', () => {
  assert.match(app, /reply_count/);
  assert.match(app, /first_reply_id/);
  assert.match(app, /chat-message-reply-count/);
  assert.match(app, /focusChatMessageById\(firstReplyId\)/);
  assert.match(css, /\.chat-message-reply-count\s*\{/);
});

test('chat follows incoming messages until someone navigates into history', () => {
  assert.match(app, /function appendChatMessage\(message: ChatMessage, scrollToBottom = false\)/);
  assert.match(app, /const followingMessage = scrollToBottom \? null/);
  assert.match(app, /let chatFollowLatest = true/);
  assert.match(app, /appendChatMessage\(event, chatFollowLatest\)/);
  assert.match(app, /function loadProjectChatHistory[\s\S]*?if \(chatFollowLatest\) scrollChatToBottom\(\)/);
  assert.match(app, /function isChatNearBottom\(\): boolean[\s\S]*?<= 24/);
  assert.match(app, /messageList\.addEventListener\('scroll', \(\) => \{\s*if \(chatMessageList !== messageList\) return;\s*chatFollowLatest = isChatNearBottom\(\)/);
  assert.match(app, /chatFollowLatest = chatMessageElements\(\)\.at\(-1\) === item/);
  assert.match(app, /item\.addEventListener\('focusin', \(\) => selectChatMessage\(message\.id, false\)\)/);
  assert.match(app, /function scrollChatToBottom\(\)[\s\S]*?chatFollowLatest = true[\s\S]*?chatMessageList\.scrollTop = chatMessageList\.scrollHeight/);
});

test('sending a chat message returns the conversation to the latest message', () => {
  assert.match(app, /appendChatMessage\(optimisticMessage, true\)/);
  assert.match(app, /appendChatMessage\(result\.message\);\s*scrollChatToBottom\(\)/);
});

test('guest with no projects gets the same framed customer screen', () => {
  assert.match(guestUi, /renderEmptyState\(guestMain/);
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
  assert.match(inboxUi, /primary\.className = 'inbox-issue-primary'/);
  assert.match(inboxUi, /primary\.append\(title, metadata\)/);
  assert.match(inboxUi, /mainline\.append\(key, primary\)/);
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

test('guest startup loads workspace choices without requesting internal project data', () => {
  const startup = app.slice(app.indexOf('async function start()'), app.indexOf('void start();'));
  assert.match(startup, /showSignedIn\(result\.user\);\s*await loadWorkspaces\(\);\s*if \(result\.user\.role === 'guest'\) return;\s*await loadProjects\(\);/);
});

test('guest sign-in loads workspace choices and skips internal project loading', () => {
  const signIn = authUi.slice(
    authUi.indexOf("loginForm.addEventListener('submit'"),
    authUi.indexOf('return {', authUi.indexOf("loginForm.addEventListener('submit'")),
  );
  assert.match(signIn, /options\.onSignedIn\(result\.user\);\s*await options\.loadWorkspaces\(\);\s*if \(result\.user\.role === 'guest'\) return;\s*await options\.loadProjects\(\);/);
});

test('inbox message events select their source chat message', () => {
  const openEvent = app.slice(app.indexOf('async function openInboxEvent('), app.indexOf('async function openInboxIssue('));
  assert.match(openEvent, /event\.message_id/);
  assert.match(openEvent, /selectChatMessage\(/);
  assert.match(openEvent, /selectChatMessage\(result\.message\.id\);\s*chatFollowLatest = false/);
  assert.match(openEvent, /This issue is no longer available/);
});
