import assert from 'node:assert/strict';
import test from 'node:test';
import { parseEmailNotificationLink } from '../../public/assets/email-notification-links.js';

test('email notification links parse workspace issue and conversation destinations', () => {
  assert.deepEqual(parseEmailNotificationLink(new URL('https://tangent.example/app.html?workspace_id=3&project_id=8&issue_id=21')), {
    workspaceId: 3,
    projectId: 8,
    issueId: 21,
    conversationId: null,
    adminNotifications: false,
  });
  assert.deepEqual(parseEmailNotificationLink(new URL('https://tangent.example/app.html?workspace_id=3&project_id=8&conversation_id=34')), {
    workspaceId: 3,
    projectId: 8,
    issueId: null,
    conversationId: 34,
    adminNotifications: false,
  });
});

test('notification settings links require only a workspace and ignore malformed destinations', () => {
  assert.deepEqual(parseEmailNotificationLink(new URL('https://tangent.example/app.html?workspace_id=3&admin=notifications')), {
    workspaceId: 3,
    projectId: null,
    issueId: null,
    conversationId: null,
    adminNotifications: true,
  });
  assert.equal(parseEmailNotificationLink(new URL('https://tangent.example/app.html?workspace_id=0&issue_id=abc')), null);
  assert.equal(parseEmailNotificationLink(new URL('https://tangent.example/app.html?project_id=8&issue_id=21&conversation_id=34')), null);
});
