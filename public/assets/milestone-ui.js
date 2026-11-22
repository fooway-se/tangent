import { ApiFailure, api } from './api.js';
import { milestoneProgress } from './issue-board.js';
export function initMilestoneUi(options) {
    const manageButton = document.querySelector('#manage-milestones-button');
    const managerDialog = document.querySelector('#milestone-manager-dialog');
    const deleteConfirmation = document.querySelector('#milestone-delete-confirmation');
    const deleteDescription = document.querySelector('#milestone-delete-description');
    const deleteError = document.querySelector('#milestone-delete-error');
    const deleteCancel = document.querySelector('#milestone-delete-cancel');
    const deleteConfirmButton = document.querySelector('#milestone-delete-confirm');
    const managerClose = document.querySelector('#milestone-manager-close');
    const milestoneList = document.querySelector('#milestone-list');
    const milestoneListEmpty = document.querySelector('#milestone-list-empty');
    const milestoneForm = document.querySelector('#milestone-form');
    const formHeading = document.querySelector('#milestone-form-heading');
    const milestoneNameInput = document.querySelector('#milestone-name-input');
    const milestoneDueDateInput = document.querySelector('#milestone-due-date-input');
    const formError = document.querySelector('#milestone-form-error');
    const formCancel = document.querySelector('#milestone-form-cancel');
    const formSubmit = document.querySelector('#milestone-form-submit');
    const quickAddMilestone = document.querySelector('#issue-quick-add-milestone');
    const detailMilestoneInput = document.querySelector('#issue-detail-milestone-input');
    const issueDetailEditForm = document.querySelector('#issue-detail-edit-form');
    const listeners = new AbortController();
    let editingMilestoneId = null;
    let deleteTarget = null;
    function resetForm() {
        milestoneForm.reset();
        editingMilestoneId = null;
        formHeading.textContent = 'Add a milestone';
        formSubmit.textContent = 'Add milestone';
        formCancel.hidden = true;
        formError.textContent = '';
        formError.hidden = true;
    }
    function renderList() {
        const milestones = options.getMilestones();
        milestoneList.replaceChildren();
        milestoneListEmpty.hidden = milestones.length > 0;
        for (const milestone of milestones) {
            const archived = milestone.archived_at !== null;
            const row = document.createElement('li');
            row.className = 'milestone-row';
            row.classList.toggle('is-archived', archived);
            row.tabIndex = 0;
            row.setAttribute('aria-keyshortcuts', 'Delete');
            const info = document.createElement('div');
            info.className = 'milestone-row-info';
            const name = document.createElement('strong');
            name.textContent = milestone.name;
            if (archived) {
                const archivedLabel = document.createElement('span');
                archivedLabel.className = 'milestone-row-archived';
                archivedLabel.textContent = 'Archived';
                info.append(name, archivedLabel);
            }
            else {
                info.append(name);
            }
            const dueDate = document.createElement('span');
            dueDate.textContent = milestone.due_date === null ? 'No due date' : `Due ${milestone.due_date}`;
            const milestoneIssues = options.getIssues().filter((issue) => issue.milestone_id === milestone.id);
            const progress = milestoneProgress(milestoneIssues);
            const progressLabel = document.createElement('span');
            progressLabel.className = `milestone-row-progress${progress.complete ? ' is-complete' : ''}`;
            if (progress.active === 0) {
                progressLabel.textContent = progress.cancelled > 0
                    ? `No active issues · ${progress.cancelled} cancelled`
                    : 'No issues yet';
            }
            else {
                const completion = progress.complete ? '✓ Complete · ' : '';
                const cancelled = progress.cancelled > 0 ? ` · ${progress.cancelled} cancelled` : '';
                progressLabel.textContent = `${completion}${progress.done}/${progress.active} issues done${cancelled}`;
            }
            info.append(dueDate, progressLabel);
            const edit = document.createElement('button');
            edit.type = 'button';
            edit.className = 'button button-quiet';
            edit.textContent = 'Edit';
            edit.setAttribute('aria-label', `Edit milestone: ${milestone.name}`);
            edit.addEventListener('click', () => {
                editingMilestoneId = milestone.id;
                milestoneNameInput.value = milestone.name;
                milestoneDueDateInput.value = milestone.due_date ?? '';
                formHeading.textContent = 'Edit milestone';
                formSubmit.textContent = 'Save milestone';
                formCancel.hidden = false;
                formError.textContent = '';
                formError.hidden = true;
                milestoneNameInput.focus();
            }, { signal: listeners.signal });
            const archive = document.createElement('button');
            archive.type = 'button';
            archive.className = 'button button-quiet';
            archive.textContent = archived ? 'Restore' : 'Archive';
            archive.dataset.milestoneId = String(milestone.id);
            archive.setAttribute('aria-label', `${archived ? 'Restore' : 'Archive'} milestone: ${milestone.name}`);
            archive.addEventListener('click', () => { void setArchived(milestone, !archived, archive); }, { signal: listeners.signal });
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'button button-quiet button-danger';
            remove.textContent = 'Delete';
            remove.setAttribute('aria-label', `Delete milestone: ${milestone.name}`);
            remove.addEventListener('click', () => openDeleteConfirmation(milestone, remove), { signal: listeners.signal });
            row.addEventListener('keydown', (event) => {
                if (event.key !== 'Delete' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.repeat)
                    return;
                event.preventDefault();
                event.stopPropagation();
                remove.click();
            }, { signal: listeners.signal });
            const actions = document.createElement('div');
            actions.className = 'milestone-row-actions';
            actions.append(edit, archive, remove);
            row.append(info, actions);
            milestoneList.append(row);
        }
    }
    async function setArchived(milestone, archived, button) {
        const projectId = options.getProject()?.id;
        if (projectId === undefined)
            return;
        const quickAddMilestoneId = quickAddMilestone.value === '' ? null : Number(quickAddMilestone.value);
        const detailMilestoneId = detailMilestoneInput.value === '' ? null : Number(detailMilestoneInput.value);
        button.disabled = true;
        try {
            await api(`/projects/${projectId}/milestones/${milestone.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ archived }),
            });
            const result = await api(`/projects/${projectId}/milestones`);
            if (options.getProject()?.id !== projectId)
                return;
            options.setMilestones(result.milestones);
            options.populateIssueMilestoneSelect(quickAddMilestone, archived && quickAddMilestoneId === milestone.id ? null : quickAddMilestoneId);
            options.populateIssueMilestoneSelect(detailMilestoneInput, detailMilestoneId);
            renderList();
            options.renderProjectIssueBoard();
            if (options.getSelectedIssue() !== null)
                options.renderIssueDetail();
            options.report(archived
                ? 'Milestone archived. Its issues are in History.'
                : 'Milestone restored to Current work.');
            milestoneList.querySelector(`button[data-milestone-id="${milestone.id}"]`)?.focus();
        }
        catch (error) {
            if (error instanceof ApiFailure && error.status === 401) {
                close();
                options.onUnauthorized();
                return;
            }
            options.report(error instanceof Error ? error.message : 'Could not update the milestone archive state.', true);
        }
        finally {
            button.disabled = false;
        }
    }
    function open() {
        if (options.getProject() === null)
            return;
        resetForm();
        renderList();
        managerDialog.showModal();
        const firstMilestoneRow = milestoneList.querySelector('.milestone-row');
        if (firstMilestoneRow === null)
            milestoneNameInput.focus();
        else
            firstMilestoneRow.focus();
    }
    function close() {
        if (deleteConfirmButton.disabled)
            return;
        if (deleteConfirmation.open)
            closeDeleteConfirmation();
        if (managerDialog.open)
            managerDialog.close();
    }
    function openDeleteConfirmation(milestone, button) {
        deleteTarget = { milestone, button };
        deleteDescription.textContent = `Deleting “${milestone.name}” leaves its issues in the project and removes their milestone assignment.`;
        deleteError.textContent = '';
        deleteError.hidden = true;
        deleteConfirmation.showModal();
        deleteCancel.focus();
    }
    function closeDeleteConfirmation(force = false) {
        if (deleteConfirmButton.disabled && !force)
            return;
        const target = deleteTarget;
        if (deleteConfirmation.open)
            deleteConfirmation.close();
        deleteTarget = null;
        deleteError.textContent = '';
        deleteError.hidden = true;
        deleteConfirmButton.disabled = false;
        deleteCancel.disabled = false;
        if (target?.button.isConnected && managerDialog.open)
            target.button.focus();
    }
    async function save(event) {
        event.preventDefault();
        const projectId = options.getProject()?.id;
        if (projectId === undefined)
            return;
        const editingId = editingMilestoneId;
        const quickAddMilestoneId = quickAddMilestone.value === '' ? null : Number(quickAddMilestone.value);
        const detailMilestoneId = detailMilestoneInput.value === '' ? null : Number(detailMilestoneInput.value);
        const path = editingId === null
            ? `/projects/${projectId}/milestones`
            : `/projects/${projectId}/milestones/${editingId}`;
        const payload = {
            name: milestoneNameInput.value.trim(),
            due_date: milestoneDueDateInput.value === '' ? null : milestoneDueDateInput.value,
        };
        formError.textContent = '';
        formError.hidden = true;
        formSubmit.disabled = true;
        formCancel.disabled = true;
        managerClose.disabled = true;
        milestoneNameInput.disabled = true;
        milestoneDueDateInput.disabled = true;
        try {
            await api(path, {
                method: editingId === null ? 'POST' : 'PATCH',
                body: JSON.stringify(payload),
            });
            const result = await api(`/projects/${projectId}/milestones`);
            if (options.getProject()?.id !== projectId)
                return;
            options.setMilestones(result.milestones);
            renderList();
            options.populateIssueMilestoneSelect(quickAddMilestone, quickAddMilestoneId);
            options.populateIssueMilestoneSelect(detailMilestoneInput, issueDetailEditForm.hidden ? options.getSelectedIssue()?.milestone_id ?? null : detailMilestoneId);
            options.renderProjectIssueBoard();
            if (options.getSelectedIssue() !== null)
                options.renderIssueDetail();
            resetForm();
            options.report(editingId === null ? 'Milestone created.' : 'Milestone updated.');
            if (managerDialog.open)
                milestoneNameInput.focus();
        }
        catch (error) {
            if (error instanceof ApiFailure && error.status === 401) {
                close();
                options.onUnauthorized();
                return;
            }
            formError.textContent = error instanceof Error ? error.message : 'Could not save the milestone.';
            formError.hidden = false;
            if (managerDialog.open)
                milestoneNameInput.focus();
        }
        finally {
            formSubmit.disabled = false;
            formCancel.disabled = false;
            managerClose.disabled = false;
            milestoneNameInput.disabled = false;
            milestoneDueDateInput.disabled = false;
        }
    }
    async function removeMilestone(milestone, button) {
        const projectId = options.getProject()?.id;
        if (projectId === undefined)
            return;
        const milestones = options.getMilestones();
        const milestoneIndex = Math.max(0, milestones.findIndex((candidate) => candidate.id === milestone.id));
        const quickAddMilestoneId = quickAddMilestone.value === '' ? null : Number(quickAddMilestone.value);
        const detailMilestoneId = detailMilestoneInput.value === '' ? null : Number(detailMilestoneInput.value);
        button.disabled = true;
        deleteConfirmButton.disabled = true;
        deleteCancel.disabled = true;
        managerClose.disabled = true;
        try {
            await api(`/projects/${projectId}/milestones/${milestone.id}`, { method: 'DELETE' });
            if (options.getProject()?.id !== projectId)
                return;
            closeDeleteConfirmation(true);
            options.setMilestones(options.getMilestones().filter((candidate) => candidate.id !== milestone.id));
            options.setIssues(options.getIssues().map((issue) => issue.milestone_id === milestone.id
                ? { ...issue, milestone_id: null }
                : issue));
            const selectedIssue = options.getSelectedIssue();
            if (selectedIssue?.milestone_id === milestone.id) {
                options.setSelectedIssue({ ...selectedIssue, milestone_id: null });
            }
            options.populateIssueMilestoneSelect(quickAddMilestone, quickAddMilestoneId === milestone.id ? null : quickAddMilestoneId);
            const nextDetailMilestoneId = issueDetailEditForm.hidden
                ? options.getSelectedIssue()?.milestone_id ?? null
                : detailMilestoneId;
            options.populateIssueMilestoneSelect(detailMilestoneInput, nextDetailMilestoneId === milestone.id ? null : nextDetailMilestoneId);
            if (editingMilestoneId === milestone.id)
                resetForm();
            renderList();
            options.renderProjectIssueBoard();
            if (options.getSelectedIssue() !== null)
                options.renderIssueDetail();
            options.report('Milestone deleted. Its issues are now unassigned.');
            if (managerDialog.open) {
                const remainingRows = Array.from(milestoneList.querySelectorAll('.milestone-row'));
                const nextMilestoneRow = remainingRows[Math.min(milestoneIndex, remainingRows.length - 1)];
                if (nextMilestoneRow === undefined)
                    milestoneNameInput.focus();
                else
                    nextMilestoneRow.focus();
            }
        }
        catch (error) {
            if (error instanceof ApiFailure && error.status === 401) {
                closeDeleteConfirmation(true);
                close();
                options.onUnauthorized();
                return;
            }
            deleteError.textContent = error instanceof Error ? error.message : 'Could not delete the milestone.';
            deleteError.hidden = false;
            if (deleteConfirmation.open)
                deleteConfirmButton.focus();
        }
        finally {
            button.disabled = false;
            deleteConfirmButton.disabled = false;
            deleteCancel.disabled = false;
            managerClose.disabled = false;
        }
    }
    manageButton.addEventListener('click', open, { signal: listeners.signal });
    managerClose.addEventListener('click', close, { signal: listeners.signal });
    deleteCancel.addEventListener('click', () => closeDeleteConfirmation(), { signal: listeners.signal });
    deleteConfirmButton.addEventListener('click', () => {
        if (deleteTarget !== null)
            void removeMilestone(deleteTarget.milestone, deleteTarget.button);
    }, { signal: listeners.signal });
    deleteConfirmation.addEventListener('cancel', (event) => {
        event.preventDefault();
        closeDeleteConfirmation();
    }, { signal: listeners.signal });
    milestoneForm.addEventListener('submit', (event) => { void save(event); }, { signal: listeners.signal });
    formCancel.addEventListener('click', () => {
        resetForm();
        milestoneNameInput.focus();
    }, { signal: listeners.signal });
    managerDialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        close();
    }, { signal: listeners.signal });
    managerDialog.addEventListener('close', () => {
        resetForm();
        if (options.shouldRestoreFocus())
            manageButton.focus();
    }, { signal: listeners.signal });
    return {
        manageButton,
        managerDialog,
        deleteConfirmation,
        deleteConfirmButton,
        open,
        close,
        closeDeleteConfirmation,
    };
}
