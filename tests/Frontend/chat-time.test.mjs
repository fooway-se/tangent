import assert from 'node:assert/strict';
import test from 'node:test';
import { formatChatTimestamp } from '../../public/assets/chat-time.js';

const localDate = (year, month, day, hour, minute) => new Date(year, month, day, hour, minute);

test('chat timestamps show only the time for today and relative days for recent posts', () => {
  const now = localDate(2026, 10, 21, 21, 0);
  const time = (date) => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date);
  const today = localDate(2026, 10, 21, 20, 30);
  const yesterday = localDate(2026, 10, 20, 20, 30);
  const twoDaysAgo = localDate(2026, 10, 19, 20, 30);

  assert.equal(formatChatTimestamp(today.toISOString(), now), time(today));
  assert.equal(formatChatTimestamp(yesterday.toISOString(), now), `Yesterday · ${time(yesterday)}`);
  assert.equal(formatChatTimestamp(twoDaysAgo.toISOString(), now), `2 days ago · ${time(twoDaysAgo)}`);
});

test('older chat timestamps use a calendar date and invalid timestamps stay empty', () => {
  const now = localDate(2026, 10, 21, 21, 0);
  const older = localDate(2026, 10, 13, 20, 30);
  const date = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(older);
  const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(older);

  assert.equal(formatChatTimestamp(older.toISOString(), now), `${date} · ${time}`);
  assert.equal(formatChatTimestamp('invalid-date', now), '');
});
