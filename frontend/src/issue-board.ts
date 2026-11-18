export type IssueStatus = 'backlog' | 'todo' | 'doing' | 'testing' | 'done' | 'cancelled';
export type IssueSortOrder = 'updated' | 'newest' | 'oldest' | 'title' | 'priority' | 'next_up';

export interface BoardIssue {
  id: number;
  title: string;
  description: string;
  status: IssueStatus;
  type?: string;
  priority?: string;
  due_date?: string | null;
  assignee_name?: string;
  milestone_id?: number | null;
  milestone_name?: string | null;
  milestone_due_date?: string | null;
  discussion_count?: number;
  sort_order?: number;
  created_at: string;
  updated_at: string;
}

export interface BoardMilestone {
  id: number;
  name: string;
  due_date: string | null;
}

export interface MilestoneProgress {
  done: number;
  active: number;
  cancelled: number;
  complete: boolean;
}

export function discussionIndicatorLabel(count: number): string | null {
  if (!Number.isSafeInteger(count) || count < 1) return null;
  return `${count} discussion ${count === 1 ? 'message' : 'messages'}`;
}

const statusOrder: IssueStatus[] = ['doing', 'testing', 'todo', 'backlog', 'done', 'cancelled'];

export function milestoneProgress(issues: readonly Pick<BoardIssue, 'status'>[]): MilestoneProgress {
  const cancelled = issues.filter((issue) => issue.status === 'cancelled').length;
  const active = issues.length - cancelled;
  const done = issues.filter((issue) => issue.status === 'done').length;
  return { done, active, cancelled, complete: active > 0 && done === active };
}

export function filterIssues<T extends BoardIssue>(issues: readonly T[], query: string): T[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (normalized === '') return [...issues];
  return issues.filter((issue) =>
    `#${issue.id} ${issue.title} ${issue.description} ${issue.status} ${issue.type ?? ''} ${issue.priority ?? ''} ${issue.due_date ?? ''} ${issue.assignee_name ?? ''} ${issue.milestone_name ?? ''}`
      .toLocaleLowerCase()
      .includes(normalized),
  );
}

export function groupIssues<T extends BoardIssue>(issues: readonly T[]): Array<{ status: IssueStatus; issues: T[] }> {
  return statusOrder.flatMap((status) => {
    const matches = issues.filter((issue) => issue.status === status);
    return matches.length > 0 ? [{ status, issues: matches }] : [];
  });
}

export function groupIssuesByMilestone<T extends BoardIssue>(
  issues: readonly T[],
  milestones: readonly BoardMilestone[],
): Array<{ milestoneId: number | null; name: string; dueDate: string | null; issues: T[] }> {
  const issuesByMilestone = new Map<number | null, T[]>();
  for (const issue of issues) {
    const milestoneId = issue.milestone_id ?? null;
    const matches = issuesByMilestone.get(milestoneId) ?? [];
    matches.push(issue);
    issuesByMilestone.set(milestoneId, matches);
  }

  const milestoneById = new Map(milestones.map((milestone) => [milestone.id, milestone]));
  const groups = [...issuesByMilestone.entries()]
    .filter(([milestoneId]) => milestoneId !== null)
    .map(([milestoneId, groupedIssues]) => {
      const firstIssue = groupedIssues[0]!;
      const milestone = milestoneById.get(milestoneId!);
      return {
        milestoneId,
        name: milestone?.name ?? firstIssue.milestone_name ?? `Milestone ${milestoneId}`,
        dueDate: milestone?.due_date ?? firstIssue.milestone_due_date ?? null,
        issues: groupedIssues,
      };
    })
    .sort((a, b) => {
      if (a.dueDate === null && b.dueDate !== null) return 1;
      if (a.dueDate !== null && b.dueDate === null) return -1;
      return (a.dueDate ?? '').localeCompare(b.dueDate ?? '')
        || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

  const unassigned = issuesByMilestone.get(null);
  if (unassigned !== undefined) groups.push({ milestoneId: null, name: 'No milestone', dueDate: null, issues: unassigned });
  return groups;
}

export function sortIssues<T extends BoardIssue>(issues: readonly T[], order: IssueSortOrder): T[] {
  return [...issues].sort((a, b) => {
    if (order === 'next_up') return compareNextUp(a, b);
    if (order === 'title') return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    if (order === 'priority') return priorityRank(a.priority) - priorityRank(b.priority)
      || dateValue(b.updated_at) - dateValue(a.updated_at);
    if (order === 'oldest') return dateValue(a.created_at) - dateValue(b.created_at);
    if (order === 'newest') return dateValue(b.created_at) - dateValue(a.created_at);
    return dateValue(b.updated_at) - dateValue(a.updated_at);
  });
}

function priorityRank(priority: string | undefined): number {
  switch (priority) {
    case 'urgent': return 0;
    case 'high': return 1;
    case 'medium': return 2;
    case 'low': return 3;
    default: return 4;
  }
}

function compareNextUp(a: BoardIssue, b: BoardIssue): number {
  const aDueDate = a.due_date ?? a.milestone_due_date ?? null;
  const bDueDate = b.due_date ?? b.milestone_due_date ?? null;
  if (aDueDate === null && bDueDate !== null) return 1;
  if (aDueDate !== null && bDueDate === null) return -1;
  if (aDueDate !== null && bDueDate !== null && aDueDate !== bDueDate) return aDueDate.localeCompare(bDueDate);

  const aHasMilestone = a.milestone_id !== null && a.milestone_id !== undefined;
  const bHasMilestone = b.milestone_id !== null && b.milestone_id !== undefined;
  if (aHasMilestone !== bHasMilestone) return aHasMilestone ? -1 : 1;

  if (aHasMilestone && bHasMilestone) {
    if (a.milestone_id !== b.milestone_id) return (a.milestone_id ?? 0) - (b.milestone_id ?? 0);
  }

  return (a.sort_order ?? a.id) - (b.sort_order ?? b.id) || a.id - b.id;
}

function dateValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}
