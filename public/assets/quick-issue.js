export function parseQuickIssueInput(input, members, milestones) {
    let title = input;
    const parsed = { title: '' };
    const assigneeToken = extractToken(title, /(^|\s)@(?:"([^"]+)"|([^\s]+))/i);
    if (assigneeToken !== null) {
        const memberId = resolveMemberId(assigneeToken.value, members);
        if (memberId !== null) {
            parsed.assigneeId = memberId;
            title = assigneeToken.remaining;
        }
    }
    const typeToken = extractToken(title, /(^|\s)type:([^\s]+)/i);
    if (typeToken !== null) {
        const type = resolveIssueType(typeToken.value);
        if (type !== null) {
            parsed.type = type;
            title = typeToken.remaining;
        }
    }
    const milestoneToken = extractToken(title, /(^|\s)milestone:(?:"([^"]+)"|([^\s]+))/i);
    if (milestoneToken !== null) {
        const milestoneId = resolveMilestoneId(milestoneToken.value, milestones);
        if (milestoneId !== null) {
            parsed.milestoneId = milestoneId;
            title = milestoneToken.remaining;
        }
    }
    parsed.title = title.replace(/\s+/g, ' ').trim();
    return parsed;
}
function extractToken(input, pattern) {
    const match = pattern.exec(input);
    if (match === null)
        return null;
    const value = match[2] ?? match[3];
    if (value === undefined)
        return null;
    return {
        value,
        remaining: input.slice(0, match.index) + match[1] + input.slice(match.index + match[0].length),
    };
}
function resolveMemberId(token, members) {
    const normalized = normalize(token);
    const matches = members.filter((member) => normalize(member.name) === normalized
        || normalize(member.email?.split('@')[0] ?? '') === normalized);
    const ids = [...new Set(matches.map((member) => member.id))];
    return ids.length === 1 ? ids[0] : null;
}
function resolveIssueType(token) {
    const normalized = token.toLocaleLowerCase();
    switch (normalized) {
        case 'task':
        case 'bug':
        case 'feature':
        case 'research':
        case 'maintenance':
            return normalized;
        default:
            return null;
    }
}
function resolveMilestoneId(token, milestones) {
    const normalized = normalize(token);
    const matches = milestones.filter((milestone) => normalize(milestone.name) === normalized);
    return matches.length === 1 ? matches[0].id : null;
}
function normalize(value) {
    return value.trim().toLocaleLowerCase();
}
