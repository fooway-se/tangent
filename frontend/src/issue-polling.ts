export interface IssueCollectionDiff {
  added: number[];
  changed: number[];
  removed: number[];
}

export interface ConditionalIssueDiffs {
  active: IssueCollectionDiff | null;
  deleted: IssueCollectionDiff | null;
}

export interface IssueCollections<T> {
  active: T;
  deleted: T | null;
}

export async function loadIssueCollections<T>(
  loadActive: () => Promise<T>,
  loadDeleted: () => Promise<T>,
  includeDeleted: boolean,
): Promise<IssueCollections<T>> {
  const [active, deleted] = await Promise.all([
    loadActive(),
    includeDeleted ? loadDeleted() : Promise.resolve(null),
  ]);
  return { active, deleted };
}

export function refreshDeletedIssuesOnOpen(
  isOpen: boolean,
  projectId: number | null,
  loadDeleted: (projectId: number) => Promise<void>,
): Promise<void> {
  if (!isOpen || projectId === null) return Promise.resolve();
  return loadDeleted(projectId);
}

export function diffConditionalIssueCollections<T extends { id: number }>(
  previousActive: readonly T[],
  nextActive: readonly T[] | null,
  previousDeleted: readonly T[],
  nextDeleted: readonly T[] | null,
): ConditionalIssueDiffs {
  return {
    active: nextActive === null ? null : diffIssueCollections(previousActive, nextActive),
    deleted: nextDeleted === null ? null : diffIssueCollections(previousDeleted, nextDeleted),
  };
}

export interface IssueUpdateDeferralState {
  issueEditorOpen?: boolean;
  quickAddActive?: boolean;
  filterFocused?: boolean;
  dialogOpen?: boolean;
}

export function diffIssueCollections<T extends { id: number }>(
  previous: readonly T[],
  next: readonly T[],
): IssueCollectionDiff {
  const previousById = new Map(previous.map((issue) => [issue.id, issue]));
  const nextById = new Map(next.map((issue) => [issue.id, issue]));
  const added: number[] = [];
  const changed: number[] = [];
  const removed: number[] = [];

  for (const issue of next) {
    const previousIssue = previousById.get(issue.id);
    if (previousIssue === undefined) {
      added.push(issue.id);
    } else if (previousIssue !== issue && issueSignature(previousIssue) !== issueSignature(issue)) {
      changed.push(issue.id);
    }
  }
  for (const issue of previous) {
    if (!nextById.has(issue.id)) removed.push(issue.id);
  }

  return { added, changed, removed };
}

export function nextIssuePollDelay(currentDelay: number, changed: boolean, hidden: boolean): number {
  if (hidden) return Math.min(10_000, Math.max(5_000, Math.round(currentDelay * 1.5)));
  if (changed) return 1_000;
  return Math.min(10_000, Math.round(currentDelay * 1.5));
}

export function shouldDeferIssueUpdates(state: IssueUpdateDeferralState): boolean {
  return state.issueEditorOpen === true
    || state.quickAddActive === true
    || state.filterFocused === true
    || state.dialogOpen === true;
}

function issueSignature(issue: object): string {
  return JSON.stringify(Object.entries(issue).sort(([left], [right]) => left.localeCompare(right)));
}
