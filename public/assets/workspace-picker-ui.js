export function initWorkspacePickerUi(options) {
    const doc = options.doc ?? document;
    const workspaceSwitcher = required('#workspace-switcher');
    const workspaceSwitcherLabel = required('#workspace-switcher-label');
    const workspacePicker = required('#workspace-picker');
    const workspacePickerCancel = required('#workspace-picker-cancel');
    const workspacePickerConfirm = required('#workspace-picker-confirm');
    const workspacePickerDescription = required('#workspace-picker-description');
    const workspacePickerOptions = required('#workspace-picker-options');
    const workspaceSwitchHint = required('#workspace-switch-hint');
    const guestWorkspaceSwitcher = required('#guest-workspace-switcher');
    const guestWorkspaceSwitcherLabel = required('#guest-workspace-switcher-label');
    const listeners = new AbortController();
    let pendingId = null;
    let optionIndex = 0;
    function required(selector) {
        const element = doc.querySelector(selector);
        if (element === null)
            throw new Error(`Missing workspace picker element: ${selector}`);
        return element;
    }
    function isOpen() {
        return workspacePicker.open;
    }
    function renderSwitcher() {
        const workspaces = options.getWorkspaces();
        const currentName = workspaces.find((workspace) => workspace.id === options.getUser()?.workspace_id)?.name
            ?? 'Choose workspace';
        workspaceSwitcherLabel.textContent = currentName;
        workspaceSwitcher.setAttribute('aria-label', `Choose workspace. Current workspace: ${currentName}.`);
        workspaceSwitcher.disabled = workspaces.length < 2;
        guestWorkspaceSwitcherLabel.textContent = currentName;
        guestWorkspaceSwitcher.setAttribute('aria-label', `Choose workspace. Current workspace: ${currentName}.`);
        guestWorkspaceSwitcher.disabled = workspaces.length < 2;
        workspaceSwitchHint.hidden = workspaces.length < 2;
    }
    function resetPendingSwitch() {
        pendingId = null;
        if (workspacePicker.open)
            workspacePicker.close();
    }
    function resetSwitcher() {
        resetPendingSwitch();
        workspaceSwitcherLabel.textContent = 'Choose workspace';
        workspaceSwitcher.setAttribute('aria-label', 'Choose workspace');
        workspaceSwitcher.disabled = true;
        guestWorkspaceSwitcherLabel.textContent = 'Choose workspace';
        guestWorkspaceSwitcher.setAttribute('aria-label', 'Choose workspace');
        guestWorkspaceSwitcher.disabled = true;
        guestWorkspaceSwitcher.hidden = true;
        workspaceSwitchHint.hidden = true;
    }
    function setGuestVisible(visible) {
        guestWorkspaceSwitcher.hidden = !visible;
    }
    function setSwitching(switching, restoreFocus = false) {
        if (switching) {
            workspaceSwitcher.disabled = true;
            guestWorkspaceSwitcher.disabled = true;
            return;
        }
        renderSwitcher();
        if (!restoreFocus)
            return;
        const switcher = options.getUser()?.role === 'guest' ? guestWorkspaceSwitcher : workspaceSwitcher;
        if (!switcher.disabled)
            switcher.focus();
    }
    function updateSelection(index) {
        const workspaces = options.getWorkspaces();
        const workspace = workspaces[index];
        if (workspace === undefined)
            return;
        optionIndex = index;
        pendingId = workspace.id;
        const currentName = workspaces.find((candidate) => candidate.id === options.getUser()?.workspace_id)?.name ?? 'Current workspace';
        workspacePickerDescription.textContent = `Current: ${currentName}. Proposed: ${workspace.name}.`;
        workspacePickerConfirm.disabled = workspace.id === options.getUser()?.workspace_id;
        workspacePickerConfirm.textContent = workspacePickerConfirm.disabled ? 'Already in this workspace' : `Switch to ${workspace.name}`;
        const pickerOptions = Array.from(workspacePickerOptions.querySelectorAll('.workspace-picker-option'));
        pickerOptions.forEach((pickerOption, pickerOptionIndex) => {
            const active = pickerOptionIndex === index;
            pickerOption.classList.toggle('is-active', active);
            pickerOption.setAttribute('aria-selected', String(active));
            pickerOption.tabIndex = active ? 0 : -1;
        });
        pickerOptions[index]?.focus();
    }
    function stageSwitch(workspaceId) {
        const index = options.getWorkspaces().findIndex((workspace) => workspace.id === workspaceId);
        if (index >= 0)
            updateSelection(index);
    }
    function open(proposedWorkspaceId) {
        const user = options.getUser();
        const workspaces = options.getWorkspaces();
        if (user === null || workspaces.length < 2)
            return;
        if (workspacePicker.open) {
            resetPendingSwitch();
            return;
        }
        pendingId = user.workspace_id;
        optionIndex = 0;
        workspacePickerOptions.replaceChildren();
        workspaces.forEach((workspace, index) => {
            const option = doc.createElement('button');
            option.className = 'button workspace-picker-option';
            option.type = 'button';
            option.setAttribute('role', 'option');
            option.dataset.workspaceId = String(workspace.id);
            const name = doc.createElement('span');
            name.textContent = workspace.name;
            option.append(name);
            if (workspace.id === user.workspace_id) {
                const current = doc.createElement('span');
                current.className = 'workspace-picker-current';
                current.textContent = 'Current';
                option.append(current);
            }
            option.addEventListener('click', () => stageSwitch(workspace.id), { signal: listeners.signal });
            workspacePickerOptions.append(option);
            if (workspace.id === user.workspace_id)
                optionIndex = index;
        });
        const proposedIndex = workspaces.findIndex((workspace) => workspace.id === proposedWorkspaceId);
        if (proposedIndex >= 0)
            optionIndex = proposedIndex;
        workspacePicker.showModal();
        updateSelection(optionIndex);
    }
    function commit() {
        const workspaceId = pendingId;
        pendingId = null;
        if (workspacePicker.open)
            workspacePicker.close();
        const user = options.getUser();
        if (workspaceId === null || user === null || workspaceId === user.workspace_id)
            return;
        options.onSwitch(workspaceId);
    }
    workspaceSwitcher.addEventListener('click', () => open(), { signal: listeners.signal });
    guestWorkspaceSwitcher.addEventListener('click', () => open(), { signal: listeners.signal });
    workspacePickerCancel.addEventListener('click', resetPendingSwitch, { signal: listeners.signal });
    workspacePickerConfirm.addEventListener('click', commit, { signal: listeners.signal });
    workspacePicker.addEventListener('close', () => {
        pendingId = null;
        if (options.isCommandPaletteOpen() || options.isShortcutHelpOpen() || options.isIssueStatusPickerOpen())
            return;
        if (options.isGuestShellVisible() && !guestWorkspaceSwitcher.hidden && !guestWorkspaceSwitcher.disabled) {
            guestWorkspaceSwitcher.focus();
        }
        else if (options.isWorkspacePanelVisible() && !workspaceSwitcher.disabled) {
            workspaceSwitcher.focus();
        }
    }, { signal: listeners.signal });
    workspacePicker.addEventListener('keydown', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement) || !target.matches('.workspace-picker-option'))
            return;
        const keyboardEvent = event;
        if (keyboardEvent.key === 'ArrowDown' || keyboardEvent.key === 'ArrowUp') {
            keyboardEvent.preventDefault();
            keyboardEvent.stopPropagation();
            const offset = keyboardEvent.key === 'ArrowDown' ? 1 : -1;
            const index = Math.max(0, Math.min(options.getWorkspaces().length - 1, optionIndex + offset));
            updateSelection(index);
        }
        else if (keyboardEvent.key === 'Enter') {
            keyboardEvent.preventDefault();
            keyboardEvent.stopPropagation();
            commit();
        }
    }, { signal: listeners.signal });
    return {
        isOpen,
        hasPendingSwitch: () => pendingId !== null,
        pendingWorkspaceId: () => pendingId,
        renderSwitcher,
        resetPendingSwitch,
        resetSwitcher,
        setGuestVisible,
        setSwitching,
        updateSelection,
        open,
        commit,
        dispose: () => listeners.abort(),
    };
}
