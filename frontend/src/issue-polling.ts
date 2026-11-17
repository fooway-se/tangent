export interface IssueCollectionDiff {
  added: number[];
  changed: number[];
  removed: number[];
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
