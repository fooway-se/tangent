import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as chatEventModule from '../../public/assets/chat-event-feed.js';
import { ChatEventFeed } from '../../public/assets/chat-event-feed.js';

const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');

test('chat polling resumes from the commit-ordered cursor', () => {
  const feed = new ChatEventFeed();
  assert.equal(feed.requestQuery(), '?cursor=0');
  feed.consume([{ id: 8, feed_cursor: 17, project_id: 2 }], 2, () => false, () => undefined);
  assert.equal(feed.requestQuery(), '?cursor=17');
});

test('project event polling keeps unchanged feeds quiet and wakes quickly for new events', async () => {
  const pollProjectChatEvents = chatEventModule.pollProjectChatEvents;
  assert.equal(typeof pollProjectChatEvents, 'function');

  const requests = [];
  const responses = [
    { status: 304, headers: new Headers({ ETag: '"project-events-7-12-0"' }) },
    {
      status: 200,
      ok: true,
      headers: new Headers({ ETag: '"project-events-7-12-14"' }),
      json: async () => ({ events: [{ id: 31, feed_cursor: 14, project_id: 7, body: 'New update' }] }),
    },
  ];
  const fetcher = async (url, options) => {
    requests.push({ url, options });
    return responses.shift();
  };

  const unchanged = await pollProjectChatEvents(fetcher, '/api/v1/', 7, '?cursor=0', '"project-events-7-12-0"', 1_000);
  assert.equal(requests[0].url, '/api/v1/projects/7/events?cursor=0');
  assert.equal(unchanged.notModified, true);
  assert.equal(unchanged.etag, '"project-events-7-12-0"');
  assert.equal(unchanged.nextDelay, 1_500);

  const active = await pollProjectChatEvents(fetcher, '/api/v1/', 7, '?cursor=0', unchanged.etag, unchanged.nextDelay);
  assert.equal(requests[1].url, '/api/v1/projects/7/events?cursor=0');
  assert.equal(active.notModified, false);
  assert.equal(active.events[0].project_id, 7);
  assert.equal(active.etag, '"project-events-7-12-14"');
  assert.equal(active.nextDelay, 1_000);
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
