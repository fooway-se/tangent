export type IssueStatus = 'backlog' | 'todo' | 'doing' | 'done' | 'cancelled';
export type IssueSortOrder = 'updated' | 'newest' | 'oldest' | 'title';

export interface BoardIssue {
  id: number;
  title: string;
  description: string;
  status: IssueStatus;
  type?: string;
  assignee_name?: string;
  created_at: string;
  updated_at: string;
}

const statusOrder: IssueStatus[] = ['doing', 'todo', 'backlog', 'done', 'cancelled'];

export function filterIssues<T extends BoardIssue>(issues: readonly T[], query: string): T[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (normalized === '') return [...issues];
  return issues.filter((issue) =>
    `#${issue.id} ${issue.title} ${issue.description} ${issue.status} ${issue.type ?? ''} ${issue.assignee_name ?? ''}`
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

export function sortIssues<T extends BoardIssue>(issues: readonly T[], order: IssueSortOrder): T[] {
  return [...issues].sort((a, b) => {
    if (order === 'title') return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    if (order === 'oldest') return dateValue(a.created_at) - dateValue(b.created_at);
    if (order === 'newest') return dateValue(b.created_at) - dateValue(a.created_at);
    return dateValue(b.updated_at) - dateValue(a.updated_at);
  });
}

function dateValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}
