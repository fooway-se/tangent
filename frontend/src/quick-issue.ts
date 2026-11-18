export type QuickIssueType = 'task' | 'bug' | 'feature' | 'research' | 'maintenance';
export type QuickIssuePriority = 'low' | 'medium' | 'high' | 'urgent';

export interface QuickIssueMember {
  id: number;
  name: string;
  email?: string;
}

export interface QuickIssueMilestone {
  id: number;
  name: string;
}

export interface ParsedQuickIssue {
  title: string;
  assigneeId?: number;
  type?: QuickIssueType;
  milestoneId?: number;
  priority?: QuickIssuePriority;
  dueDate?: string;
}

export function parseQuickIssueInput(
  input: string,
  members: readonly QuickIssueMember[],
  milestones: readonly QuickIssueMilestone[],
): ParsedQuickIssue {
  let title = input;
  const parsed: ParsedQuickIssue = { title: '' };

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

  const priorityToken = extractToken(title, /(^|\s)priority:([^\s]+)/i);
  if (priorityToken !== null) {
    const priority = resolveIssuePriority(priorityToken.value);
    if (priority !== null) {
      parsed.priority = priority;
      title = priorityToken.remaining;
    }
  }

  const dueDateToken = extractToken(title, /(^|\s)due:([^\s]+)/i);
  if (dueDateToken !== null && isValidDate(dueDateToken.value)) {
    parsed.dueDate = dueDateToken.value;
    title = dueDateToken.remaining;
  }

  parsed.title = title.replace(/\s+/g, ' ').trim();
  return parsed;
}

function extractToken(input: string, pattern: RegExp): { value: string; remaining: string } | null {
  const match = pattern.exec(input);
  if (match === null) return null;
  const value = match[2] ?? match[3];
  if (value === undefined) return null;
  return {
    value,
    remaining: input.slice(0, match.index) + match[1] + input.slice(match.index + match[0].length),
  };
}

function resolveMemberId(token: string, members: readonly QuickIssueMember[]): number | null {
  const normalized = normalize(token);
  const matches = members.filter((member) => normalize(member.name) === normalized
    || normalize(member.email?.split('@')[0] ?? '') === normalized);
  const ids = [...new Set(matches.map((member) => member.id))];
  return ids.length === 1 ? ids[0]! : null;
}

function resolveIssueType(token: string): QuickIssueType | null {
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

function resolveIssuePriority(token: string): QuickIssuePriority | null {
  const normalized = token.toLocaleLowerCase();
  switch (normalized) {
    case 'low':
    case 'medium':
    case 'high':
    case 'urgent':
      return normalized;
    default:
      return null;
  }
}

function isValidDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  if (year < 1000) return false;
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function resolveMilestoneId(token: string, milestones: readonly QuickIssueMilestone[]): number | null {
  const normalized = normalize(token);
  const matches = milestones.filter((milestone) => normalize(milestone.name) === normalized);
  return matches.length === 1 ? matches[0]!.id : null;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}
