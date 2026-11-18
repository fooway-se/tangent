export interface MentionMember {
  id: number;
  name: string;
  email: string;
  is_active?: boolean | number;
}

export interface MentionQuery {
  start: number;
  end: number;
  query: string;
}

const mentionCharacters = /^[\p{L}\p{M}\p{N}\s.'’_-]*$/u;
const mentionDelimiter = /[,;:!?()[\]{}<>]/u;

export function findMentionQuery(value: string, caret: number): MentionQuery | null {
  const safeCaret = Math.max(0, Math.min(caret, value.length));
  const start = value.lastIndexOf('@', safeCaret - 1);
  if (start < 0) return null;

  const previousCharacter = Array.from(value.slice(0, start)).at(-1);
  if (previousCharacter !== undefined && /[\p{L}\p{N}_]/u.test(previousCharacter)) return null;

  const beforeCaret = value.slice(start + 1, safeCaret);
  if (beforeCaret.includes('\n') || mentionDelimiter.test(beforeCaret)) return null;
  const followingCharacters = value.slice(safeCaret).match(/^[\p{L}\p{M}\p{N}\s.'’_-]*/u)?.[0] ?? '';
  const end = safeCaret + followingCharacters.length;
  const rawQuery = value.slice(start + 1, end);
  if (rawQuery.includes('\n') || !mentionCharacters.test(rawQuery)) return null;

  return { start, end, query: rawQuery.trim().replace(/\s+/gu, ' ') };
}

export function filterMentionMembers<T extends MentionMember>(
  members: readonly T[],
  query: string,
  currentUserId: number | null,
  limit = 8,
): T[] {
  const normalizedQuery = normalize(query);
  return members
    .filter((member) => member.id !== currentUserId && member.is_active !== false && member.is_active !== 0)
    .filter((member) => normalizedQuery === ''
      || normalize(member.name).startsWith(normalizedQuery)
      || normalize(member.email).startsWith(normalizedQuery))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }) || left.id - right.id)
    .slice(0, Math.max(0, limit));
}

export function mentionEmptyMessage(
  members: readonly MentionMember[],
  query: string,
  currentUserId: number | null,
): string {
  return filterMentionMembers(members, '', currentUserId, 1).length === 0
    ? 'No other active project members.'
    : `No project members match “${query}”.`;
}

export function replaceMentionQuery(
  value: string,
  query: MentionQuery,
  memberName: string,
): { value: string; cursor: number } {
  const prefix = value.slice(0, query.start);
  const suffix = value.slice(query.end);
  const spacer = suffix === '' || !/^[\s,.;:!?)}\]]/u.test(suffix) ? ' ' : '';
  const replacement = `@${memberName}${spacer}`;
  return {
    value: `${prefix}${replacement}${suffix}`,
    cursor: prefix.length + replacement.length,
  };
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
}
