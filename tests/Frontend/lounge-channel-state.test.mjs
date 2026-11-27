import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addUnreadChatEvents,
  latestChatFeedCursor,
  markChatChannelRead,
  parseLoungeChannelUnreadState,
} from '../../public/assets/lounge-channel-state.js';

test('the initial chat feed cursor includes the latest event from its ETag', () => {
  assert.equal(latestChatFeedCursor('"events-7-52"', [
    { feed_cursor: 41 },
    { feed_cursor: 42 },
  ]), 52);
});

test('new messages increment unread counts only for other project channels', () => {
  const state = { cursor: 20, unreadByProject: { 4: 1 } };
  const next = addUnreadChatEvents(state, [
    { feed_cursor: 21, project_id: 4, author_id: 8 },
    { feed_cursor: 22, project_id: 9, author_id: 11 },
    { feed_cursor: 23, project_id: 12, author_id: 8 },
  ], 4, 11);

  assert.deepEqual(next, { cursor: 23, unreadByProject: { 4: 1, 12: 1 } });
});

test('opening a project channel clears only that channel unread count', () => {
  const next = markChatChannelRead({ cursor: 23, unreadByProject: { 4: 1, 9: 2 } }, 4);

  assert.deepEqual(next, { cursor: 23, unreadByProject: { 9: 2 } });
});

test('persisted channel state rejects malformed cursors and unread counts', () => {
  assert.deepEqual(parseLoungeChannelUnreadState('{"cursor":23,"unreadByProject":{"9":2}}'), {
    cursor: 23,
    unreadByProject: { 9: 2 },
  });
  assert.equal(parseLoungeChannelUnreadState('{"cursor":-1,"unreadByProject":{}}'), null);
  assert.equal(parseLoungeChannelUnreadState('{not json'), null);
});
