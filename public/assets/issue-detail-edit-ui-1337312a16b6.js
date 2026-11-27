export function initIssueDetailEditUi(options) {
    const doc = options.doc ?? document;
    const form = required('#issue-detail-edit-form');
    const display = required('#issue-detail-display');
    const editButton = required('#issue-detail-edit-button');
    const cancelButton = required('#issue-detail-cancel-button');
    const saveButton = required('#issue-detail-save-button');
    const titleInput = required('#issue-detail-title-input');
    const descriptionInput = required('#issue-detail-description-input');
    const priorityInput = required('#issue-detail-priority-input');
    const dueDateInput = required('#issue-detail-due-date-input');
    const typeInput = required('#issue-detail-type-input');
    const assigneeInput = required('#issue-detail-assignee-input');
    const milestoneInput = required('#issue-detail-milestone-input');
    const ongoingInput = required('#issue-detail-ongoing-input');
    const sharedInput = required('#issue-detail-shared-input');
    const approvalInput = required('#issue-detail-approval-input');
    const listeners = new AbortController();
    function required(selector) {
        const element = doc.querySelector(selector);
        if (element === null)
            throw new Error(`Missing issue detail editor element: ${selector}`);
        return element;
    }
    function reset() {
        form.reset();
        ongoingInput.disabled = false;
        ongoingInput.title = '';
        options.updateOngoingMilestoneControl(ongoingInput, milestoneInput);
    }
    function close() {
        reset();
        form.hidden = true;
        display.hidden = false;
        if (options.isDetailVisible())
            editButton.focus();
    }
    function open(issue) {
        if (options.getIssue()?.id !== issue.id || options.getProjectId() !== issue.project_id)
            return;
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
    async function save(event) {
        event.preventDefault();
        const issue = options.getIssue();
        const projectId = options.getProjectId();
        if (issue === null || projectId === null || issue.project_id !== projectId)
            return;
        saveButton.disabled = true;
        try {
            const result = await options.api(`/issues/${issue.id}`, {
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
            if (options.getIssue()?.id !== issue.id || options.getProjectId() !== projectId)
                return;
            options.onUpdated(result.issue);
            options.renderDetail();
            options.renderBoard();
            close();
            options.report('Issue updated.');
        }
        catch (error) {
            if (options.getIssue()?.id === issue.id && options.getProjectId() === projectId)
                titleInput.focus();
            options.report(error instanceof Error ? error.message : 'Could not update the issue.', true);
        }
        finally {
            saveButton.disabled = false;
        }
    }
    editButton.addEventListener('click', () => {
        const issue = options.getIssue();
        if (issue !== null)
            open(issue);
    }, { signal: listeners.signal });
    cancelButton.addEventListener('click', close, { signal: listeners.signal });
    form.addEventListener('submit', (event) => void save(event), { signal: listeners.signal });
    ongoingInput.addEventListener('change', () => options.updateOngoingMilestoneControl(ongoingInput, milestoneInput), {
        signal: listeners.signal,
    });
    sharedInput.addEventListener('change', () => {
        if (!sharedInput.checked)
            approvalInput.checked = false;
        approvalInput.disabled = !sharedInput.checked;
    }, { signal: listeners.signal });
    descriptionInput.addEventListener('keydown', (event) => options.submitFormOnEnter(event, form), {
        signal: listeners.signal,
    });
    return { open, close, reset, dispose: () => listeners.abort() };
}
