import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const dom = await readFile(new URL('../../frontend/src/dom.ts', import.meta.url), 'utf8');
const types = await readFile(new URL('../../frontend/src/types.ts', import.meta.url), 'utf8');
const css = await readFile(new URL('../../public/assets/app.css', import.meta.url), 'utf8');

test('issue detail contains a separate discussion timeline and composer', () => {
  const detailStart = html.indexOf('id="issue-detail-view"');
  const chatStart = html.indexOf('id="project-chat-column"', detailStart);
  const detail = html.slice(detailStart, chatStart);
  assert.notEqual(detailStart, -1);
  assert.ok(chatStart > detailStart);
  assert.match(detail, /id="issue-discussion"/);
  assert.match(detail, /id="issue-discussion-list"/);
  assert.match(detail, /id="issue-discussion-form"/);
  assert.match(detail, /id="issue-discussion-input"[^>]*maxlength="10000"/);
  assert.match(detail, /id="issue-discussion-submit"/);
  assert.match(css, /\.issue-discussion\s*\{/);
});

test('issue discussions load for the selected issue and post issue-scoped replies', () => {
  assert.match(types, /interface IssueDiscussionMessage/);
  assert.match(app, /async function loadIssueDiscussion\(issueId: number/);
  assert.match(app, /`\/issues\/\$\{issueId\}\/discussion`/);
  assert.match(app, /function createIssueDiscussionMessage\(/);
  assert.match(app, /parent_id\s*\??:/);
  assert.match(app, /api<\{ message: IssueDiscussionMessage \}>\s*\(`\/issues\/\$\{issueId\}\/discussion`/);
  assert.match(app, /loadIssueDiscussion\(issue\.id\)/);
});

test('only the author of the final issue discussion message gets edit and delete actions', () => {
  assert.match(app, /function canEditIssueDiscussionMessage\(/);
  assert.match(app, /activeUser !== null\s*&&\s*message\.author_id === activeUser\.id/);
  assert.match(app, /issueDiscussionMessages\.at\(-1\)\?\.id === message\.id/);
  assert.match(app, /data-discussion-edit/);
  assert.match(app, /data-discussion-delete/);
  assert.match(app, /`\/issues\/\$\{issueId\}\/discussion\/\$\{messageId\}`/);
  assert.match(app, /method: 'PATCH'/);
  assert.match(app, /method: 'DELETE'/);
});

test('issue rows show an accessible discussion indicator when messages exist', () => {
  assert.match(app, /createDiscussionIndicator\(issue\.discussion_count \?\? 0\)/);
  assert.match(app, /discussionIndicatorLabel\(count\)/);
  assert.match(app, /issue-discussion-indicator/);
  assert.match(app, /setAttribute\('aria-label', label\)/);
  assert.match(css, /\.issue-discussion-indicator/);
});

test('discussion indicators are a plain pixel bubble next to the row status control', () => {
  assert.match(app, /actions\.append\(discussionIndicator\)/);
  assert.doesNotMatch(app, /mainline\.append\(discussionIndicator\)/);
  const rule = css.split('\n').find((line) => line.startsWith('.issue-discussion-indicator {')) ?? '';
  assert.doesNotMatch(rule, /border:\s*1px|border-radius/, 'no chip border');
  assert.match(app, /viewBox', '0 0 11 10'/, 'pixel-grid bubble icon');
});

test('issue discussion messages reuse the chat avatar and thread styling', () => {
  assert.match(app, /avatar\.className = 'chat-message-avatar'/);
  assert.match(css, /\.issue-discussion-message\.is-reply\s*\{[^}]*border-left:\s*3px solid var\(--accent\)/);
  assert.match(css, /\.issue-discussion-author\s*\{[^}]*700 13px var\(--font-display\)/);
});

test('issue discussion replies remain within the selected issue and show their parent context', () => {
  assert.match(app, /issueDiscussionParent/);
  assert.match(dom, /issue-discussion-reply-context/);
  assert.match(app, /function setIssueDiscussionReply\(/);
  assert.match(app, /function clearIssueDiscussionReply\(/);
  assert.match(app, /selectedIssue\?\.id !== issueId/);
});
