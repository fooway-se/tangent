const mentionCharacters = /^[\p{L}\p{M}\p{N}\s.'’_-]*$/u;
const mentionDelimiter = /[,;:!?()[\]{}<>]/u;
export function findMentionQuery(value, caret) {
    const safeCaret = Math.max(0, Math.min(caret, value.length));
    const start = value.lastIndexOf('@', safeCaret - 1);
    if (start < 0)
        return null;
    const previousCharacter = Array.from(value.slice(0, start)).at(-1);
    if (previousCharacter !== undefined && /[\p{L}\p{N}_]/u.test(previousCharacter))
        return null;
    const beforeCaret = value.slice(start + 1, safeCaret);
    if (beforeCaret.includes('\n') || mentionDelimiter.test(beforeCaret))
        return null;
    const followingCharacters = value.slice(safeCaret).match(/^[\p{L}\p{M}\p{N}\s.'’_-]*/u)?.[0] ?? '';
    const end = safeCaret + followingCharacters.length;
    const rawQuery = value.slice(start + 1, end);
    if (rawQuery.includes('\n') || !mentionCharacters.test(rawQuery))
        return null;
    return { start, end, query: rawQuery.trim().replace(/\s+/gu, ' ') };
}
export function filterMentionMembers(members, query, currentUserId, limit = 8) {
    const normalizedQuery = normalize(query);
    return members
        .filter((member) => member.id !== currentUserId && member.is_active !== false && member.is_active !== 0)
        .filter((member) => normalizedQuery === ''
        || normalize(member.name).startsWith(normalizedQuery)
        || normalize(member.email).startsWith(normalizedQuery))
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }) || left.id - right.id)
        .slice(0, Math.max(0, limit));
}
export function mentionEmptyMessage(members, query, currentUserId, scope = 'project') {
    const subject = scope === 'workspace' ? 'workspace members' : 'project members';
    return filterMentionMembers(members, '', currentUserId, 1).length === 0
        ? `No other active ${subject}.`
        : `No ${subject} match “${query}”.`;
}
export function replaceMentionQuery(value, query, memberName) {
    const prefix = value.slice(0, query.start);
    const suffix = value.slice(query.end);
    const spacer = suffix === '' || !/^[\s,.;:!?)}\]]/u.test(suffix) ? ' ' : '';
    const replacement = `@${memberName}${spacer}`;
    return {
        value: `${prefix}${replacement}${suffix}`,
        cursor: prefix.length + replacement.length,
    };
}
export function splitMentions(value, members) {
    const activeMembers = members
        .filter((member) => member.is_active !== false && member.is_active !== 0 && member.name.trim() !== '')
        .sort((left, right) => right.name.length - left.name.length || left.id - right.id);
    if (activeMembers.length === 0)
        return [{ text: value, memberId: null }];
    const membersByName = new Map(activeMembers.map((member) => [normalize(member.name), member.id]));
    const alternatives = activeMembers
        .map((member) => member.name.trim().replace(/\s+/gu, ' ')
        .split(' ').map(escapeRegExp).join('\\s+'))
        .filter((name, index, names) => names.indexOf(name) === index);
    const expression = new RegExp(`(?<![\\p{L}\\p{N}_])@(${alternatives.join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
    const segments = [];
    let cursor = 0;
    for (const match of value.matchAll(expression)) {
        const matchedText = match[0];
        const matchedName = match[1];
        const index = match.index;
        if (matchedText === undefined || matchedName === undefined || index === undefined)
            continue;
        if (index > cursor)
            segments.push({ text: value.slice(cursor, index), memberId: null });
        segments.push({ text: matchedText, memberId: membersByName.get(normalize(matchedName)) ?? null });
        cursor = index + matchedText.length;
    }
    if (cursor < value.length)
        segments.push({ text: value.slice(cursor), memberId: null });
    return segments.length > 0 ? segments : [{ text: value, memberId: null }];
}
export function nextMentionSelectionIndex(currentIndex, direction, optionCount) {
    if (optionCount <= 0)
        return currentIndex;
    return (currentIndex + direction + optionCount) % optionCount;
}
function normalize(value) {
    return value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
