export interface InboxCollectionDiff {
  added: number[];
  changed: number[];
  removed: number[];
  orderChanged: boolean;
}

export interface InboxUpdateDeferralState {
  listFocused?: boolean;
  mutationPending?: boolean;
}

export function diffInboxCollections<T extends { id: number }>(
  previous: readonly T[],
  next: readonly T[],
): InboxCollectionDiff {
  const previousById = new Map(previous.map((item) => [item.id, item]));
  const nextById = new Map(next.map((item) => [item.id, item]));
  const added: number[] = [];
  const changed: number[] = [];
  const removed: number[] = [];

  for (const item of next) {
    const previousItem = previousById.get(item.id);
    if (previousItem === undefined) added.push(item.id);
    else if (collectionSignature(previousItem) !== collectionSignature(item)) changed.push(item.id);
  }
  for (const item of previous) {
    if (!nextById.has(item.id)) removed.push(item.id);
  }

  const orderChanged = previous.length !== next.length
    || previous.some((item, index) => item.id !== next[index]?.id);
  return { added, changed, removed, orderChanged };
}

export function nextInboxPollDelay(currentDelay: number, changed: boolean, hidden: boolean): number {
  if (hidden) return Math.min(10_000, Math.max(5_000, Math.round(currentDelay * 1.5)));
  if (changed) return 1_000;
  return Math.min(10_000, Math.round(currentDelay * 1.5));
}

export function shouldDeferInboxUpdates(state: InboxUpdateDeferralState): boolean {
  return state.listFocused === true || state.mutationPending === true;
}

function collectionSignature(item: object): string {
  return JSON.stringify(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)));
}
