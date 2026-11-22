import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ChatEventFeed } from '../../public/assets/chat-event-feed.js';

const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');

test('chat polling resumes from the commit-ordered cursor', () => {
  const feed = new ChatEventFeed();
  assert.equal(feed.requestQuery(), '?cursor=0');
  feed.consume([{ id: 8, feed_cursor: 17, project_id: 2 }], 2, () => false, () => undefined);
  assert.equal(feed.requestQuery(), '?cursor=17');
});

test('chat feed pages advance across project filters and suppress repeated message delivery', () => {
  const feed = new ChatEventFeed();
  const rendered = new Map();
  const render = (event) => rendered.set(event.id, event.body);
  const page = (first, count) => Array.from({ length: count }, (_, offset) => {
    const cursor = first + offset;
    return {
      id: 1000 + cursor,
      feed_cursor: cursor,
      project_id: cursor % 2 === 0 ? 7 : 9,
      body: `message ${cursor}`,
    };
  });
  const firstPage = page(1, 100);
  const secondPage = page(101, 5);

  feed.consume(firstPage, 7, (id) => rendered.has(id), render);
  assert.equal(feed.cursor, 100);
  assert.equal(rendered.size, 50);

  feed.consume(secondPage, 7, (id) => rendered.has(id), render);
  assert.equal(feed.cursor, 105);
  assert.equal(rendered.size, 52);

  feed.consume(secondPage, 7, (id) => rendered.has(id), render);
  assert.equal(feed.cursor, 105);
  assert.equal(rendered.size, 52, 'a repeated page does not render messages twice');
  assert.equal(feed.requestQuery(), '?cursor=105');
});

test('project chat consumes commit cursors and uses its rendered-message map for deduplication', () => {
  const poll = app.slice(app.indexOf('async function pollProjectChat('), app.indexOf('async function loadProjectChatHistory('));
  assert.match(poll, /chatEventFeed\.requestQuery\(\)/);
  assert.match(poll, /chatEventFeed\.consume\([\s\S]*chatMessagesById\.has\(messageId\)/);
  assert.match(app, /interface ChatEvent extends ChatMessage, ChatFeedEvent/);
  const append = app.slice(app.indexOf('function appendChatMessage('), app.indexOf('function updateChatMessageReplyCount('));
  assert.match(append, /chatMessagesById\.set\(message\.id, message\)/);
});
