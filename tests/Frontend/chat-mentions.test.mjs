import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findMentionQuery,
  filterMentionMembers,
  replaceMentionQuery,
  mentionEmptyMessage,
  splitMentions,
} from '../../public/assets/chat-mentions.js';

const members = [
  { id: 1, name: 'Niklas T', email: 'niklas.t@example.test', is_active: true },
  { id: 2, name: 'Richard K', email: 'richard.k@example.test', is_active: true },
  { id: 3, name: 'Richard M', email: 'richard.m@example.test', is_active: true },
  { id: 4, name: 'Riley', email: 'riley@example.test', is_active: 0 },
];

test('mention search matches saved full names and excludes inactive members and the current user', () => {
  assert.deepEqual(filterMentionMembers(members, 'richard k', 1), [members[1]]);
  assert.deepEqual(filterMentionMembers(members, 'rich', 1), [members[1], members[2]]);
  assert.deepEqual(filterMentionMembers(members, '', 2), [members[0], members[2]]);
});

test('mention search explains when no project member matches or can be mentioned', () => {
  assert.equal(mentionEmptyMessage(members, 'nobody', 1), 'No project members match “nobody”.');
  assert.equal(mentionEmptyMessage([members[0], members[3]], '', 1), 'No other active project members.');
});

test('mention search uses workspace wording for the Lounge', () => {
  assert.equal(mentionEmptyMessage(members, 'nobody', 1, 'workspace'), 'No workspace members match “nobody”.');
  assert.equal(mentionEmptyMessage([members[0]], '', 1, 'workspace'), 'No other active workspace members.');
});

test('mention query finds a full display name and ignores ordinary email addresses', () => {
  const body = 'Could you ask @Richard K';
  assert.deepEqual(findMentionQuery(body, body.length), {
    start: 14,
    end: body.length,
    query: 'Richard K',
  });
  const email = 'Email richard@example.test';
  assert.equal(findMentionQuery(email, email.length), null);
});

test('mention insertion replaces the query with the selected full name and keeps punctuation', () => {
  const body = 'Hey @Rich, please look';
  const query = findMentionQuery(body, 9);
  assert.ok(query);
  assert.deepEqual(replaceMentionQuery(body, query, 'Richard K'), {
    value: 'Hey @Richard K, please look',
    cursor: 14,
  });
});

test('message mention highlighting matches display names without treating email addresses as mentions', () => {
  assert.deepEqual(splitMentions('Hi @Richard K, email richard.k@example.test', [members[1]]), [
    { text: 'Hi ', memberId: null },
    { text: '@Richard K', memberId: 2 },
    { text: ', email richard.k@example.test', memberId: null },
  ]);
});
