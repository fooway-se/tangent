import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');

test('chat Create issue starts the quick-add draft and does not create immediately', () => {
  assert.match(app, /function beginCreateIssueFromChatMessage\(/);
  assert.match(app, /issueQuickAddSourceMessageId = message\.id/);

  const actionStart = app.indexOf("createIssue.addEventListener('click'");
  const actionEnd = app.indexOf('\n  });', actionStart);
  const action = app.slice(actionStart, actionEnd);
  assert.match(action, /beginCreateIssueFromChatMessage\(message, createIssue\)/);
  assert.doesNotMatch(action, /api<.*>\(`\/messages/);
});

test('submitting a chat-backed quick-add sends the source message with the edited fields', () => {
  assert.match(app, /issueInput\.source_message_id = issueQuickAddSourceMessageId/);
  assert.match(app, /issueQuickAddSourceMessageId = null/);
});

test('cancel returns focus to the chat opener and clears the source link', () => {
  const cancelStart = app.indexOf('function cancelIssueQuickAdd(');
  const cancelEnd = app.indexOf('\nfunction ', cancelStart + 1);
  const cancel = app.slice(cancelStart, cancelEnd);
  assert.match(cancel, /issueQuickAddSourceMessageId = null/);
  assert.match(app, /projectChatColumn\.contains\(target\)/);
});
