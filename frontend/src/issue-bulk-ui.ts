import type { Issue } from './types.js';
import type { Member, Milestone } from './types.js';

export interface IssueBulkUiState {
  bulkMovePending: boolean;
  bulkSelectionActionPending: boolean;
  bulkAssignSelectionMode: boolean;
  selectedBulkMoveIssueIds: Set<number>;
  selectedBulkAssignIssueIds: Set<number>;
  visibleBulkAssignIssueIds: Set<number>;
  bulkMoveMilestoneId: number | null;
  bulkAssignTargetValue: string;
  activeMembers: readonly Member[];
  milestones: readonly Milestone[];
  readOnly: boolean;
}

export interface IssueBulkUiOptions {
  doc: Pick<Document, 'createElement'>;
  getState: () => IssueBulkUiState;
  issueList: HTMLElement;
  assignTarget: HTMLSelectElement;
  assignToolbar: HTMLElement;
  assignToggle: HTMLButtonElement;
  assignCount: HTMLElement;
  selectVisible: HTMLButtonElement;
  assignApply: HTMLButtonElement;
  shareApply: HTMLButtonElement;
  unshareApply: HTMLButtonElement;
  assignCancel: HTMLButtonElement;
  setBulkMoveMilestoneId: (milestoneId: number | null) => void;
  setBulkAssignTargetValue: (value: string) => void;
  setSelectedBulkMoveIssueIds: (issueIds: Set<number>) => void;
  renderBoard: () => void;
  moveSelectedIssuesToMilestone: () => void | Promise<void>;
  report: (message: string, isError?: boolean) => void;
  setTextContentIfChanged: (element: HTMLElement, value: string) => void;
}

export function initIssueBulkUi(options: IssueBulkUiOptions): {
  createMoveCheckbox: (issue: Issue) => HTMLInputElement;
  createAssignCheckbox: (issue: Issue) => HTMLInputElement;
  createMoveToolbar: (issues: Issue[]) => HTMLDivElement;
  syncMoveToolbar: (toolbar: HTMLDivElement, issues: Issue[]) => void;
  syncAssignControls: () => void;
} {
  const { doc } = options;

  function createOption(label: string, value: string): HTMLOptionElement {
    const option = doc.createElement('option');
    option.textContent = label;
    option.value = value;
    return option;
  }

  function createMoveCheckbox(issue: Issue): HTMLInputElement {
    const checkbox = doc.createElement('input');
    const state = options.getState();
    checkbox.type = 'checkbox';
    checkbox.className = 'issue-bulk-select-checkbox';
    checkbox.dataset.issueId = String(issue.id);
    checkbox.checked = state.selectedBulkMoveIssueIds.has(issue.id);
    checkbox.disabled = state.bulkMovePending || state.bulkSelectionActionPending
      || (!checkbox.checked && state.selectedBulkMoveIssueIds.size >= 500)
      || state.readOnly;
    checkbox.setAttribute('aria-label', `Select ${issue.title}`);
    checkbox.addEventListener('change', () => {
      const current = options.getState();
      if (current.bulkMovePending || current.bulkSelectionActionPending) return;
      if (checkbox.checked) {
        if (current.selectedBulkMoveIssueIds.size >= 500) {
          checkbox.checked = false;
          options.report('Move up to 500 issues at a time.', true);
          return;
        }
        current.selectedBulkMoveIssueIds.add(issue.id);
      } else {
        current.selectedBulkMoveIssueIds.delete(issue.id);
      }
      options.renderBoard();
    });
    return checkbox;
  }

  function createAssignCheckbox(issue: Issue): HTMLInputElement {
    const checkbox = doc.createElement('input');
    const state = options.getState();
    checkbox.type = 'checkbox';
    checkbox.className = 'issue-bulk-assign-checkbox';
    checkbox.dataset.issueId = String(issue.id);
    checkbox.checked = state.selectedBulkAssignIssueIds.has(issue.id);
    checkbox.disabled = state.bulkSelectionActionPending || state.bulkMovePending
      || (!checkbox.checked && state.selectedBulkAssignIssueIds.size >= 500)
      || state.readOnly;
    checkbox.setAttribute('aria-label', `Select ${issue.title} for assignment`);
    checkbox.addEventListener('change', () => {
      const current = options.getState();
      if (current.bulkSelectionActionPending) return;
      if (checkbox.checked) {
        if (current.selectedBulkAssignIssueIds.size >= 500) {
          checkbox.checked = false;
          options.report('Assign up to 500 issues at a time.', true);
          return;
        }
        current.selectedBulkAssignIssueIds.add(issue.id);
      } else {
        current.selectedBulkAssignIssueIds.delete(issue.id);
      }
      options.renderBoard();
    });
    return checkbox;
  }

  function syncAssignControls(): void {
    const state = options.getState();
    const activeMembers = state.activeMembers.filter((member) => member.is_active !== false && member.is_active !== 0);
    const optionsSignature = JSON.stringify(activeMembers.map((member) => [member.id, member.name]));
    if (options.assignTarget.dataset.optionsSignature !== optionsSignature) {
      options.assignTarget.replaceChildren(
        createOption('Choose assignee', ''),
        createOption('Unassigned', 'unassigned'),
      );
      for (const member of activeMembers) options.assignTarget.add(createOption(member.name, String(member.id)));
      options.assignTarget.dataset.optionsSignature = optionsSignature;
    }
    if (state.bulkAssignTargetValue !== 'unassigned'
      && state.bulkAssignTargetValue !== ''
      && !activeMembers.some((member) => String(member.id) === state.bulkAssignTargetValue)) {
      options.setBulkAssignTargetValue('');
    }
    const current = options.getState();
    options.assignTarget.value = current.bulkAssignTargetValue;
    options.assignToolbar.hidden = !current.bulkAssignSelectionMode;
    options.assignToggle.textContent = current.bulkAssignSelectionMode ? 'Cancel selection' : 'Select issues';
    options.assignToggle.setAttribute('aria-pressed', String(current.bulkAssignSelectionMode));
    options.assignToggle.disabled = current.bulkSelectionActionPending || current.bulkMovePending || current.readOnly
      || (!current.bulkAssignSelectionMode && current.visibleBulkAssignIssueIds.size === 0);
    options.setTextContentIfChanged(options.assignCount, `${current.selectedBulkAssignIssueIds.size} selected`);
    options.selectVisible.disabled = current.bulkSelectionActionPending || current.readOnly
      || current.visibleBulkAssignIssueIds.size === 0 || current.visibleBulkAssignIssueIds.size > 500
      || current.bulkMovePending;
    options.selectVisible.title = current.visibleBulkAssignIssueIds.size > 500 ? 'Select up to 500 issues at a time.' : '';
    options.assignTarget.disabled = current.bulkSelectionActionPending || current.bulkMovePending || current.readOnly;
    options.assignApply.disabled = current.bulkSelectionActionPending || current.bulkMovePending || current.readOnly
      || current.selectedBulkAssignIssueIds.size === 0 || current.bulkAssignTargetValue === '';
    options.shareApply.disabled = current.bulkSelectionActionPending || current.bulkMovePending || current.readOnly
      || current.selectedBulkAssignIssueIds.size === 0;
    options.unshareApply.disabled = current.bulkSelectionActionPending || current.bulkMovePending || current.readOnly
      || current.selectedBulkAssignIssueIds.size === 0;
    options.assignCancel.disabled = current.bulkSelectionActionPending || current.bulkMovePending;
    for (const checkbox of options.issueList.querySelectorAll<HTMLInputElement>('.issue-bulk-assign-checkbox')) {
      checkbox.checked = current.selectedBulkAssignIssueIds.has(Number(checkbox.dataset.issueId));
      checkbox.disabled = current.bulkSelectionActionPending || current.readOnly
        || (!checkbox.checked && current.selectedBulkAssignIssueIds.size >= 500);
    }
  }

  function createMoveToolbar(issues: Issue[]): HTMLDivElement {
    const toolbar = doc.createElement('div');
    toolbar.className = 'issue-bulk-move-toolbar';
    toolbar.setAttribute('role', 'group');
    toolbar.setAttribute('aria-label', 'Move unassigned issues to a milestone');

    const selectionActions = doc.createElement('div');
    selectionActions.className = 'issue-bulk-move-selection-actions';
    selectionActions.setAttribute('role', 'group');
    selectionActions.setAttribute('aria-label', 'Selection');

    const selectionLabel = doc.createElement('span');
    selectionLabel.className = 'issue-bulk-action-label';
    selectionLabel.textContent = 'Selection';

    const count = doc.createElement('span');
    count.className = 'issue-bulk-move-count';
    count.setAttribute('aria-live', 'polite');

    const selectAll = doc.createElement('button');
    selectAll.type = 'button';
    selectAll.className = 'button button-secondary issue-bulk-select-all';
    selectAll.textContent = 'Select all';
    selectAll.addEventListener('click', () => {
      const state = options.getState();
      if (state.bulkMovePending) return;
      const details = toolbar.parentElement;
      if (details?.tagName !== 'DETAILS') return;
      const issueIds = Array.from(details.querySelectorAll<HTMLInputElement>('.issue-bulk-select-checkbox'))
        .map((checkbox) => Number(checkbox.dataset.issueId))
        .filter((issueId) => Number.isInteger(issueId) && issueId > 0);
      if (issueIds.length > 500) return;
      options.setSelectedBulkMoveIssueIds(new Set(issueIds));
      options.renderBoard();
    });

    selectionActions.append(selectionLabel, count, selectAll);

    const actionGroup = doc.createElement('div');
    actionGroup.className = 'issue-bulk-move-action-group';
    actionGroup.setAttribute('role', 'group');
    actionGroup.setAttribute('aria-label', 'Milestone');

    const milestoneLabel = doc.createElement('span');
    milestoneLabel.className = 'issue-bulk-action-label';
    milestoneLabel.textContent = 'Milestone';

    const milestoneSelect = doc.createElement('select');
    milestoneSelect.className = 'issue-bulk-move-milestone';
    milestoneSelect.setAttribute('aria-label', 'Move selected issues to milestone');
    milestoneSelect.addEventListener('change', () => {
      options.setBulkMoveMilestoneId(milestoneSelect.value === '' ? null : Number(milestoneSelect.value));
      const state = options.getState();
      const moveButton = toolbar.querySelector<HTMLButtonElement>('.issue-bulk-move-button');
      if (moveButton !== null) moveButton.disabled = state.bulkMovePending
        || state.selectedBulkMoveIssueIds.size === 0
        || state.bulkMoveMilestoneId === null
        || state.readOnly;
    });

    const moveButton = doc.createElement('button');
    moveButton.type = 'button';
    moveButton.className = 'button button-primary issue-bulk-move-button';
    moveButton.textContent = 'Move';
    moveButton.setAttribute('aria-label', 'Move selected issues');
    moveButton.addEventListener('click', () => void options.moveSelectedIssuesToMilestone());

    actionGroup.append(milestoneLabel, milestoneSelect, moveButton);
    toolbar.append(selectionActions, actionGroup);
    syncMoveToolbar(toolbar, issues);
    return toolbar;
  }

  function syncMoveToolbar(toolbar: HTMLDivElement, issues: Issue[]): void {
    const count = toolbar.querySelector<HTMLElement>('.issue-bulk-move-count');
    const selectAll = toolbar.querySelector<HTMLButtonElement>('.issue-bulk-select-all');
    const milestoneSelect = toolbar.querySelector<HTMLSelectElement>('.issue-bulk-move-milestone');
    const moveButton = toolbar.querySelector<HTMLButtonElement>('.issue-bulk-move-button');
    const state = options.getState();
    const disabled = state.bulkMovePending || state.bulkSelectionActionPending || state.readOnly;
    if (count !== null) options.setTextContentIfChanged(count, `${state.selectedBulkMoveIssueIds.size} selected`);
    if (selectAll !== null) {
      selectAll.disabled = disabled || issues.length > 500;
      selectAll.title = issues.length > 500 ? 'Select up to 500 issues at a time.' : '';
    }
    if (milestoneSelect !== null) {
      const optionsSignature = state.milestones
        .filter((milestone) => milestone.archived_at === null)
        .map((milestone) => `${milestone.id}:${milestone.name}`)
        .join('|');
      if (milestoneSelect.dataset.optionsSignature !== optionsSignature) {
        milestoneSelect.replaceChildren(createOption('Choose milestone', ''));
        for (const milestone of state.milestones) {
          if (milestone.archived_at !== null) continue;
          milestoneSelect.append(createOption(milestone.name, String(milestone.id)));
        }
        milestoneSelect.dataset.optionsSignature = optionsSignature;
      }
      if (state.bulkMoveMilestoneId !== null && !state.milestones.some((milestone) =>
        milestone.id === state.bulkMoveMilestoneId && milestone.archived_at === null)) {
        options.setBulkMoveMilestoneId(null);
      }
      const current = options.getState();
      milestoneSelect.value = current.bulkMoveMilestoneId === null ? '' : String(current.bulkMoveMilestoneId);
      milestoneSelect.disabled = disabled;
    }
    const current = options.getState();
    if (moveButton !== null) moveButton.disabled = disabled
      || current.selectedBulkMoveIssueIds.size === 0 || current.bulkMoveMilestoneId === null;

    const details = toolbar.parentElement;
    if (details?.tagName === 'DETAILS') {
      for (const checkbox of details.querySelectorAll<HTMLInputElement>('.issue-bulk-select-checkbox')) {
        checkbox.checked = current.selectedBulkMoveIssueIds.has(Number(checkbox.dataset.issueId));
        checkbox.disabled = disabled || (!checkbox.checked && current.selectedBulkMoveIssueIds.size >= 500);
      }
    }
  }

  return { createMoveCheckbox, createAssignCheckbox, createMoveToolbar, syncMoveToolbar, syncAssignControls };
}
