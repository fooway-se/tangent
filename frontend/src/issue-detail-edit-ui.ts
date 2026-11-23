import type { Issue } from './types.js';

export interface IssueDetailEditUiController {
  open(issue: Issue): void;
  close(): void;
  reset(): void;
  dispose(): void;
}

export function initIssueDetailEditUi(options: {
  getIssue: () => Issue | null;
  getProjectId: () => number | null;
  isDetailVisible: () => boolean;
  populateAssigneeSelect: (select: HTMLSelectElement, selectedAssigneeId: number | null) => void;
  populateMilestoneSelect: (select: HTMLSelectElement, selectedMilestoneId: number | null) => void;
  updateOngoingMilestoneControl: (ongoing: HTMLInputElement, milestone: HTMLSelectElement) => void;
  submitFormOnEnter: (event: KeyboardEvent, form: HTMLFormElement) => void;
  api: <T>(path: string, init?: RequestInit) => Promise<T>;
  onUpdated: (issue: Issue) => void;
  renderDetail: () => void;
  renderBoard: () => void;
  report: (message: string, isError?: boolean) => void;
  doc?: Document;
}): IssueDetailEditUiController {
  const doc = options.doc ?? document;
  const form = required<HTMLFormElement>('#issue-detail-edit-form');
  const display = required<HTMLElement>('#issue-detail-display');
  const editButton = required<HTMLButtonElement>('#issue-detail-edit-button');
  const cancelButton = required<HTMLButtonElement>('#issue-detail-cancel-button');
  const saveButton = required<HTMLButtonElement>('#issue-detail-save-button');
  const titleInput = required<HTMLInputElement>('#issue-detail-title-input');
  const descriptionInput = required<HTMLTextAreaElement>('#issue-detail-description-input');
  const priorityInput = required<HTMLSelectElement>('#issue-detail-priority-input');
  const dueDateInput = required<HTMLInputElement>('#issue-detail-due-date-input');
  const typeInput = required<HTMLSelectElement>('#issue-detail-type-input');
  const assigneeInput = required<HTMLSelectElement>('#issue-detail-assignee-input');
  const milestoneInput = required<HTMLSelectElement>('#issue-detail-milestone-input');
  const ongoingInput = required<HTMLInputElement>('#issue-detail-ongoing-input');
  const sharedInput = required<HTMLInputElement>('#issue-detail-shared-input');
  const approvalInput = required<HTMLInputElement>('#issue-detail-approval-input');
  const listeners = new AbortController();

  function required<T extends Element>(selector: string): T {
    const element = doc.querySelector<T>(selector);
    if (element === null) throw new Error(`Missing issue detail editor element: ${selector}`);
    return element;
  }

  function reset(): void {
    form.reset();
    ongoingInput.disabled = false;
    ongoingInput.title = '';
    options.updateOngoingMilestoneControl(ongoingInput, milestoneInput);
  }

  function close(): void {
    reset();
    form.hidden = true;
    display.hidden = false;
    if (options.isDetailVisible()) editButton.focus();
  }

  function open(issue: Issue): void {
    if (options.getIssue()?.id !== issue.id || options.getProjectId() !== issue.project_id) return;
    titleInput.value = issue.title;
    descriptionInput.value = issue.description;
    priorityInput.value = issue.priority;
    dueDateInput.value = issue.due_date ?? '';
    typeInput.value = issue.type;
    options.populateAssigneeSelect(assigneeInput, issue.assignee_id);
    options.populateMilestoneSelect(milestoneInput, issue.milestone_id);
    ongoingInput.checked = issue.is_ongoing;
    ongoingInput.disabled = issue.status === 'done' && !issue.is_ongoing;
    ongoingInput.title = ongoingInput.disabled ? 'Move this issue out of Done before marking it as ongoing.' : '';
    options.updateOngoingMilestoneControl(ongoingInput, milestoneInput);
    sharedInput.checked = issue.is_shared;
    approvalInput.checked = issue.approval_requested_at !== null;
    approvalInput.disabled = !issue.is_shared;
    display.hidden = true;
    form.hidden = false;
    titleInput.focus();
  }

  async function save(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const issue = options.getIssue();
    const projectId = options.getProjectId();
    if (issue === null || projectId === null || issue.project_id !== projectId) return;
    saveButton.disabled = true;
    try {
      const result = await options.api<{ issue: Issue }>(`/issues/${issue.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: titleInput.value,
          description: descriptionInput.value,
          priority: priorityInput.value,
          due_date: dueDateInput.value === '' ? null : dueDateInput.value,
          type: typeInput.value,
          assignee_id: assigneeInput.value === '' ? null : Number(assigneeInput.value),
          milestone_id: ongoingInput.checked || milestoneInput.value === '' ? null : Number(milestoneInput.value),
          is_ongoing: ongoingInput.checked,
          is_shared: sharedInput.checked,
          approval_requested: approvalInput.checked,
        }),
      });
      if (options.getIssue()?.id !== issue.id || options.getProjectId() !== projectId) return;
      options.onUpdated(result.issue);
      options.renderDetail();
      options.renderBoard();
      close();
      options.report('Issue updated.');
    } catch (error) {
      if (options.getIssue()?.id === issue.id && options.getProjectId() === projectId) titleInput.focus();
      options.report(error instanceof Error ? error.message : 'Could not update the issue.', true);
    } finally {
      saveButton.disabled = false;
    }
  }

  editButton.addEventListener('click', () => {
    const issue = options.getIssue();
    if (issue !== null) open(issue);
  }, { signal: listeners.signal });
  cancelButton.addEventListener('click', close, { signal: listeners.signal });
  form.addEventListener('submit', (event) => void save(event), { signal: listeners.signal });
  ongoingInput.addEventListener('change', () => options.updateOngoingMilestoneControl(ongoingInput, milestoneInput), {
    signal: listeners.signal,
  });
  sharedInput.addEventListener('change', () => {
    if (!sharedInput.checked) approvalInput.checked = false;
    approvalInput.disabled = !sharedInput.checked;
  }, { signal: listeners.signal });
  descriptionInput.addEventListener('keydown', (event) => options.submitFormOnEnter(event, form), {
    signal: listeners.signal,
  });

  return { open, close, reset, dispose: () => listeners.abort() };
}
