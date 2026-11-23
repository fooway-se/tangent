import assert from 'node:assert/strict';
import test from 'node:test';
import { formatChatTimestamp } from '../../public/assets/chat-time.js';

const localDate = (year, month, day, hour, minute) => new Date(year, month, day, hour, minute);

test('chat timestamps use compact relative days with the sent time', () => {
  const now = localDate(2026, 10, 21, 21, 0);
  const time = (date) => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date);
  const today = localDate(2026, 10, 21, 20, 30);
  const yesterday = localDate(2026, 10, 20, 20, 30);
  const twoDaysAgo = localDate(2026, 10, 19, 20, 30);

  assert.equal(formatChatTimestamp(today.toISOString(), now), time(today));
  assert.equal(formatChatTimestamp(yesterday.toISOString(), now), `1d · ${time(yesterday)}`);
  assert.equal(formatChatTimestamp(twoDaysAgo.toISOString(), now), `2d · ${time(twoDaysAgo)}`);
});

test('older chat timestamps use compact weeks and months, and invalid timestamps stay empty', () => {
  const now = localDate(2026, 10, 21, 21, 0);
  const weekAgo = localDate(2026, 10, 13, 20, 30);
  const monthsAgo = localDate(2026, 8, 21, 20, 30);
  const time = (date) => new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date);

  assert.equal(formatChatTimestamp(weekAgo.toISOString(), now), `1w · ${time(weekAgo)}`);
  assert.equal(formatChatTimestamp(monthsAgo.toISOString(), now), `2mo · ${time(monthsAgo)}`);
  assert.equal(formatChatTimestamp('invalid-date', now), '');
});
