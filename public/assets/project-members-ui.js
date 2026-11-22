export function initProjectMembersUi(options) {
    const doc = options.doc ?? document;
    const memberList = required('#member-list');
    const memberForm = required('#member-form');
    const memberAddControls = required('#member-add-controls');
    const memberAddStatus = required('#member-add-status');
    const memberSelect = required('#member-select');
    const removalDialog = required('#member-removal-confirmation');
    const removalDescription = required('#member-removal-description');
    const removalCancel = required('#member-removal-cancel');
    const removalConfirm = required('#member-removal-confirm');
    const addMemberButton = required('#add-member-button');
    const membersView = required('#members-view');
    const listeners = new AbortController();
    let removalTarget = null;
    function required(selector) {
        const element = doc.querySelector(selector);
        if (element === null)
            throw new Error(`Missing project member element: ${selector}`);
        return element;
    }
    function updatePanelTabIndex() {
        const hasFocusableContent = Array.from(membersView.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')).some((element) => element.tabIndex >= 0 && !element.matches(':disabled') && element.closest('[hidden]') === null);
        membersView.tabIndex = hasFocusableContent ? -1 : 0;
    }
    function setReadOnly(readOnly) {
        memberForm.hidden = options.getRole() !== 'admin' || readOnly;
        if (memberForm.hidden) {
            memberAddControls.hidden = true;
            memberAddStatus.hidden = true;
        }
        updatePanelTabIndex();
    }
    function renderMembers() {
        memberList.replaceChildren();
        for (const member of options.getMembers()) {
            const item = doc.createElement('li');
            const label = doc.createElement('span');
            label.textContent = `${member.name} · ${member.role}`;
            item.append(label);
            if (options.getRole() === 'admin') {
                const removeButton = doc.createElement('button');
                removeButton.type = 'button';
                removeButton.className = 'button button-quiet button-danger';
                removeButton.textContent = 'Remove';
                removeButton.dataset.userId = String(member.id);
                removeButton.setAttribute('aria-label', `Remove ${member.name} from this project`);
                removeButton.addEventListener('click', () => openRemovalConfirmation(member, removeButton));
                item.append(removeButton);
            }
            memberList.append(item);
        }
    }
    function openRemovalConfirmation(member, button) {
        removalTarget = { member, button };
        removalDescription.textContent = `“${member.name}” will be removed from the project.`;
        removalDialog.showModal();
        removalCancel.focus();
    }
    function closeRemovalConfirmation() {
        if (removalDialog.open)
            removalDialog.close();
        removalTarget = null;
        removalConfirm.disabled = false;
    }
    async function removeMember(member, removeButton) {
        const projectId = options.getProjectId();
        if (projectId === null)
            return;
        const memberIndex = options.getMembers().findIndex((candidate) => candidate.id === member.id);
        removeButton.disabled = true;
        try {
            await options.api(`/projects/${projectId}/members/${member.id}`, { method: 'DELETE' });
            if (options.getProjectId() === projectId) {
                await options.onRefresh(projectId, 'members');
                if (options.getProjectId() === projectId && options.isViewVisible()) {
                    const members = options.getMembers();
                    const nextIndex = Math.min(memberIndex, members.length - 1);
                    const nextMember = members[nextIndex];
                    const nextRemoveButton = nextMember === undefined
                        ? null
                        : memberList.querySelector(`button[data-user-id="${nextMember.id}"]`);
                    (nextRemoveButton ?? memberSelect).focus();
                }
            }
            options.report(`${member.name} removed from the project.`);
        }
        catch (error) {
            options.report(error instanceof Error ? error.message : 'Could not remove the project member.', true);
        }
        finally {
            removeButton.disabled = false;
        }
    }
    async function confirmRemoval() {
        const target = removalTarget;
        if (target === null)
            return;
        closeRemovalConfirmation();
        await removeMember(target.member, target.button);
    }
    async function load(projectId) {
        renderMembers();
        setReadOnly(options.isReadOnly());
        if (memberForm.hidden)
            return;
        memberAddControls.hidden = true;
        memberAddStatus.textContent = 'Loading available members…';
        memberAddStatus.hidden = false;
        memberSelect.replaceChildren();
        memberSelect.disabled = true;
        addMemberButton.disabled = true;
        try {
            const result = await options.api('/users');
            if (options.getProjectId() !== projectId || !options.isViewVisible())
                return;
            memberSelect.replaceChildren();
            const availableMembers = result.users.filter((user) => !options.getMembers().some((member) => member.id === user.id));
            if (availableMembers.length === 0) {
                memberAddStatus.textContent = 'There are no other workspace members available to add.';
                memberAddStatus.hidden = false;
                updatePanelTabIndex();
                return;
            }
            for (const candidate of availableMembers) {
                const option = doc.createElement('option');
                option.value = String(candidate.id);
                option.textContent = `${candidate.name} · ${candidate.email}`;
                memberSelect.append(option);
            }
            memberSelect.disabled = false;
            addMemberButton.disabled = false;
            memberAddStatus.hidden = true;
            memberAddControls.hidden = false;
            updatePanelTabIndex();
        }
        catch (error) {
            if (options.getProjectId() === projectId && options.isViewVisible()) {
                memberAddStatus.textContent = 'Could not load available members.';
                memberAddStatus.hidden = false;
            }
            options.report(error instanceof Error ? error.message : 'Could not load workspace users.', true);
        }
    }
    memberForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const projectId = options.getProjectId();
        if (projectId === null || memberSelect.value === '')
            return;
        try {
            await options.api(`/projects/${projectId}/members/${memberSelect.value}`, { method: 'PUT' });
            options.report('Member added to the project.');
            await options.onRefresh(projectId, 'members');
        }
        catch (error) {
            options.report(error instanceof Error ? error.message : 'Could not add member.', true);
        }
    }, { signal: listeners.signal });
    removalCancel.addEventListener('click', closeRemovalConfirmation, { signal: listeners.signal });
    removalConfirm.addEventListener('click', () => void confirmRemoval(), { signal: listeners.signal });
    removalDialog.addEventListener('close', () => {
        removalTarget = null;
        removalConfirm.disabled = false;
    }, { signal: listeners.signal });
    return {
        load,
        setReadOnly,
        hasOpenDialog: () => removalDialog.open,
        closeRemovalConfirmation,
        dispose: () => listeners.abort(),
    };
}
