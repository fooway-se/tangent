import type { IssueBoardGroup, Issue } from './types.js';

type ReorderOptions = { canMoveEarlier?: boolean; canMoveLater?: boolean; showMilestoneTag?: boolean };

interface IssueBoardUiState {
  bulkMoveSelectionMode: boolean;
  bulkMovePending: boolean;
  bulkAssignSelectionMode: boolean;
  selectedBulkMoveIssueIds: ReadonlySet<number>;
  selectedBulkAssignIssueIds: ReadonlySet<number>;
  selectedIssueId: number | null;
  readOnly: boolean;
}

export interface IssueBoardUiController {
  render(groups: IssueBoardGroup[]): void;
}

export function issueRowRenderSignature(
  issue: Issue,
  reorder: ReorderOptions | undefined,
  issueAssigneeLabel: (assigneeId: number | null) => string,
  allowBulkMoveSelection = false,
  bulkMoveSelected = false,
  allowBulkAssignSelection = false,
  bulkAssignSelected = false,
): string {
  return JSON.stringify([
    issue.title,
    issue.description,
    issue.status,
    issue.type,
    issueAssigneeLabel(issue.assignee_id),
    issue.is_shared,
    reorder?.showMilestoneTag === false ? null : issue.milestone_name ?? null,
    issue.source_message_id !== null,
    issue.discussion_count ?? 0,
    reorder?.canMoveEarlier,
    reorder?.canMoveLater,
    issue.is_ongoing,
    issue.is_blocked,
    issue.blocking_reason,
    allowBulkMoveSelection,
    bulkMoveSelected,
    allowBulkAssignSelection,
    bulkAssignSelected,
  ]);
}

export function initIssueBoardUi(options: {
  getState: () => IssueBoardUiState;
  onToggleBulkMoveSelection: () => void;
  renderBoard: () => void;
  issueAssigneeLabel: (assigneeId: number | null) => string;
  createIssueRow: (issue: Issue, reorder: ReorderOptions | undefined, allowBulkMoveSelection: boolean, allowBulkAssignSelection: boolean) => HTMLLIElement;
  createBulkMoveToolbar: (issues: Issue[]) => HTMLDivElement;
  syncBulkMoveToolbar: (toolbar: HTMLDivElement, issues: Issue[]) => void;
  setTextContentIfChanged: (element: HTMLElement, value: string) => void;
  placeNodeAtPosition: (parent: Element, node: Element, index: number) => void;
  replaceIssueRowPreservingFocus: (previous: HTMLLIElement, next: HTMLLIElement) => void;
  issueList: HTMLUListElement;
  doc?: Document;
}): IssueBoardUiController {
  const doc = options.doc ?? document;
  const rowRenderSignatures = new WeakMap<HTMLLIElement, string>();

  function createGroupSummary(name: string, count: number): HTMLElement {
    const summary = doc.createElement('summary');
    summary.className = 'issue-group-summary';
    const chevron = doc.createElement('span');
    chevron.className = 'issue-group-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '›';
    const groupName = doc.createElement('span');
    groupName.className = 'issue-group-name';
    groupName.textContent = name;
    const groupCount = doc.createElement('span');
    groupCount.className = 'issue-group-count';
    groupCount.textContent = String(count);
    summary.append(chevron, groupName, groupCount);
    return summary;
  }

  function reconcileGroups(groups: IssueBoardGroup[]): void {
    const existingGroups = new Map(
      Array.from(options.issueList.querySelectorAll<HTMLDetailsElement>(':scope > .issue-group'))
        .map((group) => [group.dataset.groupKey ?? '', group]),
    );
    const existingRows = new Map(
      Array.from(options.issueList.querySelectorAll<HTMLLIElement>('.issue-card'))
        .map((row) => [Number(row.dataset.issueId), row]),
    );
    const expectedRowsByGroup = new Map<string, Set<number>>();
    const retainedGroupKeys = new Set<string>();

    for (const [groupIndex, group] of groups.entries()) {
      retainedGroupKeys.add(group.key);
      let details = existingGroups.get(group.key);
      if (details === undefined) {
        details = doc.createElement('details');
        details.open = group.openByDefault ?? true;
        details.dataset.groupKey = group.key;
      }
      if (details.className !== group.className) details.className = group.className;
      const summary = details.querySelector<HTMLElement>(':scope > summary') ?? createGroupSummary(group.name, group.issues.length);
      const groupName = summary.querySelector<HTMLElement>('.issue-group-name');
      const groupCount = summary.querySelector<HTMLElement>('.issue-group-count');
      if (groupName !== null) options.setTextContentIfChanged(groupName, group.name);
      if (groupCount !== null) options.setTextContentIfChanged(groupCount, String(group.issues.length));
      let bulkSelectToggle = summary.querySelector<HTMLButtonElement>(':scope > .issue-bulk-select-toggle');
      const state = options.getState();
      if (group.allowBulkMove === true) {
        if (bulkSelectToggle === null) {
          bulkSelectToggle = doc.createElement('button');
          bulkSelectToggle.type = 'button';
          bulkSelectToggle.className = 'button button-secondary issue-bulk-select-toggle';
          bulkSelectToggle.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (options.getState().bulkMovePending) return;
            options.onToggleBulkMoveSelection();
            details!.open = true;
            options.renderBoard();
          });
          summary.append(bulkSelectToggle);
        }
        bulkSelectToggle.textContent = state.bulkMoveSelectionMode ? 'Cancel selection' : 'Select issues';
        bulkSelectToggle.disabled = state.bulkMovePending || state.readOnly;
      } else {
        bulkSelectToggle?.remove();
      }
      const isBulkMoveGroup = group.key === 'milestone:none' && group.allowBulkMove === true;
      let bulkToolbar = details.querySelector<HTMLDivElement>(':scope > .issue-bulk-move-toolbar');
      if (isBulkMoveGroup && state.bulkMoveSelectionMode) {
        if (bulkToolbar === null) bulkToolbar = options.createBulkMoveToolbar(group.issues);
        options.syncBulkMoveToolbar(bulkToolbar, group.issues);
      } else {
        bulkToolbar?.remove();
        bulkToolbar = null;
      }
      const rows = details.querySelector<HTMLUListElement>(':scope > .issue-group-items') ?? doc.createElement('ul');
      rows.className = 'issue-group-items';
      const expectedIds = new Set<number>();
      for (const [rowIndex, issue] of group.issues.entries()) {
        expectedIds.add(issue.id);
        const reorder = group.reorderByIssueId?.get(issue.id);
        const allowBulkMoveSelection = isBulkMoveGroup && state.bulkMoveSelectionMode;
        const bulkMoveSelected = state.selectedBulkMoveIssueIds.has(issue.id);
        const allowBulkAssignSelection = state.bulkAssignSelectionMode;
        const bulkAssignSelected = state.selectedBulkAssignIssueIds.has(issue.id);
        const signature = issueRowRenderSignature(
          issue,
          reorder,
          options.issueAssigneeLabel,
          allowBulkMoveSelection,
          bulkMoveSelected,
          allowBulkAssignSelection,
          bulkAssignSelected,
        );
        const existing = existingRows.get(issue.id);
        let row: HTMLLIElement;
        if (existing !== undefined && rowRenderSignatures.get(existing) === signature) {
          row = existing;
        } else {
          row = options.createIssueRow(issue, reorder, allowBulkMoveSelection, allowBulkAssignSelection);
          row.classList.toggle('is-keyboard-selected', state.selectedIssueId === issue.id);
          rowRenderSignatures.set(row, signature);
          if (existing !== undefined) options.replaceIssueRowPreservingFocus(existing, row);
        }
        options.placeNodeAtPosition(rows, row, rowIndex);
      }
      if (bulkToolbar !== null) options.syncBulkMoveToolbar(bulkToolbar, group.issues);
      expectedRowsByGroup.set(group.key, expectedIds);
      options.placeNodeAtPosition(details, summary, 0);
      if (bulkToolbar !== null) options.placeNodeAtPosition(details, bulkToolbar, 1);
      options.placeNodeAtPosition(details, rows, bulkToolbar === null ? 1 : 2);
      options.placeNodeAtPosition(options.issueList, details, groupIndex);
    }

    for (const group of Array.from(options.issueList.querySelectorAll<HTMLDetailsElement>(':scope > .issue-group'))) {
      const key = group.dataset.groupKey ?? '';
      if (!retainedGroupKeys.has(key)) {
        group.remove();
        continue;
      }
      const expected = expectedRowsByGroup.get(key) ?? new Set<number>();
      group.querySelectorAll<HTMLLIElement>(':scope > .issue-group-items > .issue-card').forEach((row) => {
        if (!expected.has(Number(row.dataset.issueId))) row.remove();
      });
    }
  }

  return { render: reconcileGroups };
}
