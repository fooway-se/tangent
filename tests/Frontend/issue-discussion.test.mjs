import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
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
  assert.match(app, /interface IssueDiscussionMessage/);
  assert.match(app, /async function loadIssueDiscussion\(issueId: number/);
  assert.match(app, /`\/issues\/\$\{issueId\}\/discussion`/);
  assert.match(app, /function createIssueDiscussionMessage\(/);
  assert.match(app, /parent_id\s*\??:/);
  assert.match(app, /api<\{ message: IssueDiscussionMessage \}>\s*\(`\/issues\/\$\{issueId\}\/discussion`/);
  assert.match(app, /loadIssueDiscussion\(issue\.id\)/);
});

test('issue discussion replies remain within the selected issue and show their parent context', () => {
  assert.match(app, /issueDiscussionParent/);
  assert.match(app, /issue-discussion-reply-context/);
  assert.match(app, /function setIssueDiscussionReply\(/);
  assert.match(app, /function clearIssueDiscussionReply\(/);
  assert.match(app, /selectedIssue\?\.id !== issueId/);
});
