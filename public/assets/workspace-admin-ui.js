import { api } from './api.js';
export function initWorkspaceAdminUi(options) {
    const doc = options.doc ?? document;
    const request = options.request ?? api;
    const tabs = required('#workspace-admin-tabs');
    const membersTab = required('#workspace-admin-members-tab');
    const invitesTab = required('#workspace-admin-invites-tab');
    const workspacesTab = required('#workspace-admin-workspaces-tab');
    const membersPanel = required('#workspace-admin-members-panel');
    const invitesPanel = required('#workspace-admin-invites-panel');
    const workspacesPanel = required('#workspace-admin-workspaces-panel');
    const membersList = required('#workspace-members-list');
    const membersEmpty = required('#workspace-members-empty');
    const invitesList = required('#workspace-invites-list');
    const invitesEmpty = required('#workspace-invites-empty');
    const inviteForm = required('#invite-form');
    const inviteRoleInput = required('#invite-role');
    const inviteProjectSelection = required('#invite-project-selection');
    const inviteProjectOptions = required('#invite-project-options');
    const deactivationDialog = required('#workspace-member-deactivation-dialog');
    const deactivationDescription = required('#workspace-member-deactivation-description');
    const deactivationCancel = required('#workspace-member-deactivation-cancel');
    const deactivationConfirm = required('#workspace-member-deactivation-confirm');
    const roleDialog = required('#workspace-member-role-confirmation-dialog');
    const roleHeading = required('#workspace-member-role-heading');
    const roleDescription = required('#workspace-member-role-description');
    const roleCancel = required('#workspace-member-role-cancel');
    const roleConfirm = required('#workspace-member-role-confirm');
    const guestProjectsDialog = required('#workspace-guest-projects-dialog');
    const guestProjectsDescription = required('#workspace-guest-projects-description');
    const guestProjectOptions = required('#workspace-guest-project-options');
    const guestProjectsEmpty = required('#workspace-guest-projects-empty');
    const guestProjectsStatus = required('#workspace-guest-projects-status');
    const guestProjectsCancel = required('#workspace-guest-projects-cancel');
    const guestProjectsSave = required('#workspace-guest-projects-save');
    const listeners = new AbortController();
    let workspaceAdminTab = 'members';
    let adminProjects = [];
    let deactivationTarget = null;
    let roleChangeTarget = null;
    let guestProjectsTarget = null;
    function required(selector) {
        const element = doc.querySelector(selector);
        if (element === null)
            throw new Error(`Missing workspace administration element: ${selector}`);
        return element;
    }
    function switchTab(tab) {
        workspaceAdminTab = tab;
        const states = [
            ['members', membersTab, membersPanel],
            ['invites', invitesTab, invitesPanel],
            ['workspaces', workspacesTab, workspacesPanel],
        ];
        for (const [name, button, panel] of states) {
            const selected = name === tab;
            button.setAttribute('aria-selected', String(selected));
            button.tabIndex = selected ? 0 : -1;
            button.classList.toggle('is-active', selected);
            panel.hidden = !selected;
        }
        updatePanelTabIndex();
    }
    function currentTab() {
        return workspaceAdminTab;
    }
    function focusSelectedTab() {
        tabs.querySelector('[role="tab"][aria-selected="true"]')?.focus();
    }
    function updatePanelTabIndex() {
        const panel = [membersPanel, invitesPanel, workspacesPanel].find((candidate) => !candidate.hidden);
        if (panel === undefined)
            return;
        const hasFocusableContent = Array.from(panel.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')).some((element) => element.tabIndex >= 0 && !element.matches(':disabled') && element.closest('[hidden]') === null);
        panel.tabIndex = hasFocusableContent ? -1 : 0;
    }
    async function load() {
        if (options.getUser()?.role !== 'admin')
            return;
        try {
            const [members, invites, projects] = await Promise.all([
                request('/users'),
                request('/users/invites'),
                request('/projects'),
            ]);
            if (!options.isVisible())
                return;
            adminProjects = projects.projects.filter((project) => project.status === 'active' || project.status === 'paused');
            renderMembers(members.users);
            renderInvites(invites.invites);
            renderInviteProjectOptions();
            updatePanelTabIndex();
        }
        catch (error) {
            options.report(error instanceof Error ? error.message : 'Could not load workspace administration.', true);
        }
    }
    function open() {
        switchTab(workspaceAdminTab);
        void load();
    }
    function renderMembers(members) {
        membersList.replaceChildren();
        membersEmpty.hidden = members.length > 0;
        const activeAdminCount = members.filter((member) => member.role === 'admin' && member.is_active).length;
        for (const member of members) {
            const item = doc.createElement('li');
            const label = doc.createElement('span');
            label.className = 'workspace-admin-member-identity';
            label.textContent = `${member.name} · ${member.email}${member.is_active ? '' : ' · inactive'}`;
            const roleControl = doc.createElement('div');
            roleControl.className = 'workspace-admin-role-control';
            const roleSelect = doc.createElement('select');
            roleSelect.setAttribute('aria-label', `Workspace role for ${member.name}`);
            roleSelect.dataset.memberId = String(member.id);
            roleSelect.dataset.memberAction = 'role';
            for (const role of ['admin', 'developer', 'guest']) {
                const option = doc.createElement('option');
                option.value = role;
                option.textContent = role[0].toUpperCase() + role.slice(1);
                roleSelect.append(option);
            }
            roleSelect.value = member.role;
            const roleSaveButton = doc.createElement('button');
            roleSaveButton.type = 'button';
            roleSaveButton.className = 'button button-quiet';
            roleSaveButton.textContent = 'Save role';
            roleSaveButton.dataset.memberId = String(member.id);
            roleSaveButton.dataset.memberAction = 'save-role';
            const isSelf = member.id === options.getUser()?.id;
            const isLastActiveAdmin = member.is_active && member.role === 'admin' && activeAdminCount <= 1;
            roleSelect.disabled = isSelf || isLastActiveAdmin;
            if (isSelf)
                roleSelect.title = 'Ask another workspace admin to change your role.';
            else if (isLastActiveAdmin)
                roleSelect.title = 'At least one active workspace admin must remain.';
            const updateRoleSaveButton = () => {
                roleSaveButton.disabled = roleSelect.disabled || roleSelect.value === member.role;
            };
            roleSelect.addEventListener('change', updateRoleSaveButton, { signal: listeners.signal });
            updateRoleSaveButton();
            roleSaveButton.addEventListener('click', () => {
                if (roleSaveButton.disabled)
                    return;
                const role = roleSelect.value;
                if (role !== member.role && (role === 'admin' || member.role === 'admin')) {
                    openRoleConfirmation(member, role, roleSelect, roleSaveButton);
                }
                else {
                    void setMemberRole(member, role, roleSelect);
                }
            }, { signal: listeners.signal });
            roleControl.append(roleSelect, roleSaveButton);
            item.classList.add('workspace-admin-member-row');
            const actions = doc.createElement('div');
            actions.className = 'workspace-admin-member-actions';
            const resetLinkButton = doc.createElement('button');
            resetLinkButton.type = 'button';
            resetLinkButton.className = 'button button-quiet';
            resetLinkButton.textContent = 'Send recovery email';
            resetLinkButton.setAttribute('aria-label', `Send password recovery email to ${member.name}`);
            resetLinkButton.disabled = !member.is_active;
            resetLinkButton.addEventListener('click', () => void sendPasswordRecoveryEmail(member), { signal: listeners.signal });
            if (member.role === 'guest') {
                const manageProjectsButton = doc.createElement('button');
                manageProjectsButton.type = 'button';
                manageProjectsButton.className = 'button button-quiet';
                manageProjectsButton.textContent = 'Manage projects';
                manageProjectsButton.dataset.memberId = String(member.id);
                manageProjectsButton.dataset.memberAction = 'projects';
                manageProjectsButton.setAttribute('aria-label', `Manage project access for ${member.name}`);
                manageProjectsButton.addEventListener('click', () => void openGuestProjectAccess(member, manageProjectsButton), { signal: listeners.signal });
                actions.append(manageProjectsButton);
            }
            const statusButton = doc.createElement('button');
            statusButton.type = 'button';
            statusButton.className = member.is_active ? 'button button-quiet button-danger' : 'button button-quiet';
            statusButton.textContent = member.is_active ? 'Deactivate' : 'Reactivate';
            statusButton.dataset.memberId = String(member.id);
            statusButton.dataset.memberAction = 'status';
            statusButton.setAttribute('aria-label', `${member.is_active ? 'Deactivate' : 'Reactivate'} ${member.name} in this workspace`);
            const isLastAdmin = member.is_active && member.role === 'admin' && activeAdminCount <= 1;
            statusButton.disabled = member.is_active && (isSelf || isLastAdmin);
            if (isSelf)
                statusButton.title = 'Ask another workspace admin to deactivate your membership.';
            else if (isLastAdmin)
                statusButton.title = 'At least one active workspace admin must remain.';
            statusButton.addEventListener('click', () => {
                if (member.is_active)
                    openDeactivationConfirmation(member, statusButton);
                else
                    void setMemberActive(member, true);
            }, { signal: listeners.signal });
            actions.append(resetLinkButton, statusButton);
            const memberTools = doc.createElement('div');
            memberTools.className = 'workspace-admin-member-tools';
            memberTools.append(roleControl, actions);
            item.append(label, memberTools);
            membersList.append(item);
        }
    }
    function openDeactivationConfirmation(member, button) {
        deactivationTarget = { member, button };
        deactivationDescription.textContent = `${member.name} will lose access to this workspace and its projects. Existing browser sessions and API tokens for this workspace will be revoked.`;
        deactivationDialog.showModal();
        deactivationCancel.focus();
    }
    function closeDeactivationConfirmation(restoreFocus = true) {
        if (deactivationDialog.open)
            deactivationDialog.close();
        const target = deactivationTarget;
        deactivationTarget = null;
        deactivationConfirm.disabled = false;
        if (restoreFocus && options.isVisible() && target?.button.isConnected && !target.button.disabled)
            target.button.focus();
    }
    async function setMemberActive(member, isActive) {
        try {
            await request(`/users/${member.id}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ is_active: isActive }),
            });
            options.report(isActive ? `${member.name} reactivated in this workspace.` : `${member.name} deactivated from this workspace.`);
            await load();
            membersList.querySelector(`button[data-member-id="${member.id}"][data-member-action="status"]`)?.focus();
        }
        catch (error) {
            options.report(error instanceof Error ? error.message : `Could not ${isActive ? 'reactivate' : 'deactivate'} the workspace member.`, true);
            if (options.isVisible())
                membersList.querySelector(`button[data-member-id="${member.id}"][data-member-action="status"]`)?.focus();
        }
    }
    function openRoleConfirmation(member, role, select, button) {
        roleChangeTarget = { member, role, select, button };
        const roleLabel = role[0].toUpperCase() + role.slice(1);
        if (role === 'admin') {
            roleHeading.textContent = 'Grant admin access?';
            roleDescription.textContent = `${member.name} will gain workspace-wide administration access.`;
            roleConfirm.textContent = 'Grant admin access';
        }
        else {
            roleHeading.textContent = 'Remove admin access?';
            roleDescription.textContent = `${member.name} will lose workspace administration access and become a ${roleLabel}.`;
            roleConfirm.textContent = 'Change role';
        }
        roleDialog.showModal();
        roleCancel.focus();
    }
    function closeRoleConfirmation(restoreFocus = true) {
        if (roleDialog.open)
            roleDialog.close();
        const target = roleChangeTarget;
        roleChangeTarget = null;
        roleConfirm.disabled = false;
        if (restoreFocus && options.isVisible() && target?.button.isConnected)
            target.button.focus();
    }
    async function setMemberRole(member, role, select) {
        try {
            await request(`/users/${member.id}/role`, {
                method: 'PATCH',
                body: JSON.stringify({ role }),
            });
            options.report(`${member.name}'s role changed to ${role}. They may need to reload to see their updated controls.`);
            await load();
            membersList.querySelector(`select[data-member-id="${member.id}"][data-member-action="role"]`)?.focus();
        }
        catch (error) {
            options.report(error instanceof Error ? error.message : `Could not change ${member.name}'s role.`, true);
            if (options.isVisible() && select.isConnected)
                select.focus();
        }
    }
    async function openGuestProjectAccess(member, button) {
        guestProjectsTarget = { member, button };
        guestProjectsDescription.textContent = `Choose active or paused projects ${member.name} can access. Existing access to completed or archived projects can be removed.`;
        guestProjectOptions.replaceChildren();
        guestProjectsEmpty.hidden = true;
        guestProjectsStatus.textContent = 'Loading project access…';
        guestProjectsSave.disabled = true;
        guestProjectsDialog.showModal();
        guestProjectsCancel.focus();
        try {
            const result = await request(`/users/${member.id}/projects`);
            if (!guestProjectsDialog.open || guestProjectsTarget?.member.id !== member.id)
                return;
            guestProjectOptions.replaceChildren();
            guestProjectsStatus.textContent = '';
            guestProjectsEmpty.hidden = result.projects.length > 0;
            if (result.projects.length === 0) {
                guestProjectsEmpty.textContent = 'There are no active or paused projects. This guest will have no project access.';
            }
            for (const project of result.projects) {
                const label = doc.createElement('label');
                label.className = 'admin-project-option';
                const checkbox = doc.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.name = 'guest_project_ids';
                checkbox.value = String(project.id);
                checkbox.checked = result.project_ids.includes(project.id);
                const readOnly = project.status === 'completed' || project.status === 'archived';
                const description = readOnly ? `${project.name} (${project.status}; remove access only)` : project.name;
                label.append(checkbox, doc.createTextNode(description));
                guestProjectOptions.append(label);
            }
            const firstProjectCheckbox = guestProjectOptions.querySelector('input[type="checkbox"]');
            if (firstProjectCheckbox !== null && doc.activeElement === guestProjectsCancel)
                firstProjectCheckbox.focus();
            guestProjectsSave.disabled = false;
        }
        catch (error) {
            if (!guestProjectsDialog.open || guestProjectsTarget?.member.id !== member.id)
                return;
            options.report(error instanceof Error ? error.message : `Could not load ${member.name}'s project access.`, true);
            closeGuestProjectAccess();
        }
    }
    function closeGuestProjectAccess(restoreFocus = true) {
        if (guestProjectsDialog.open)
            guestProjectsDialog.close();
        const target = guestProjectsTarget;
        guestProjectsTarget = null;
        guestProjectsSave.disabled = false;
        if (restoreFocus && options.isVisible() && target?.button.isConnected)
            target.button.focus();
    }
    async function saveGuestProjectAccess() {
        const target = guestProjectsTarget;
        if (target === null)
            return;
        const projectIds = Array.from(guestProjectOptions.querySelectorAll('input[name="guest_project_ids"]:checked')).map((checkbox) => Number(checkbox.value));
        guestProjectsSave.disabled = true;
        guestProjectsStatus.textContent = 'Saving project access…';
        try {
            await request(`/users/${target.member.id}/projects`, {
                method: 'PUT',
                body: JSON.stringify({ project_ids: projectIds }),
            });
            closeGuestProjectAccess(false);
            options.report(`${target.member.name}'s project access updated.`);
            if (options.isVisible() && target.button.isConnected)
                target.button.focus();
        }
        catch (error) {
            options.report(error instanceof Error ? error.message : `Could not update ${target.member.name}'s project access.`, true);
            guestProjectsStatus.textContent = 'The project access could not be saved. Review the selection and try again.';
            guestProjectsSave.disabled = false;
            guestProjectsSave.focus();
        }
    }
    function renderInvites(invites) {
        invitesList.replaceChildren();
        invitesEmpty.hidden = invites.length > 0;
        for (const invite of invites) {
            const item = doc.createElement('li');
            item.className = 'workspace-invite-row';
            const details = doc.createElement('span');
            details.className = 'workspace-invite-details';
            details.textContent = `${invite.name} · ${invite.email} · ${invite.role} · Expires ${new Date(`${invite.expires_at}Z`).toLocaleDateString()}`;
            const actions = doc.createElement('div');
            actions.className = 'workspace-invite-actions';
            const resend = doc.createElement('button');
            resend.type = 'button';
            resend.className = 'button button-quiet';
            resend.textContent = 'Resend invite';
            resend.dataset.inviteId = String(invite.id);
            resend.dataset.inviteAction = 'resend';
            resend.addEventListener('click', () => void resendInvite(invite.id), { signal: listeners.signal });
            const revoke = doc.createElement('button');
            revoke.type = 'button';
            revoke.className = 'button button-quiet button-danger';
            revoke.textContent = 'Revoke';
            revoke.dataset.inviteId = String(invite.id);
            revoke.dataset.inviteAction = 'revoke';
            revoke.addEventListener('click', () => void revokeInvite(invite.id), { signal: listeners.signal });
            actions.append(resend, revoke);
            item.append(details, actions);
            invitesList.append(item);
        }
    }
    function renderInviteProjectOptions() {
        inviteProjectOptions.replaceChildren();
        for (const project of adminProjects) {
            const label = doc.createElement('label');
            label.className = 'admin-project-option';
            const checkbox = doc.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.name = 'project_ids';
            checkbox.value = String(project.id);
            label.append(checkbox, doc.createTextNode(project.name));
            inviteProjectOptions.append(label);
        }
        inviteProjectSelection.hidden = inviteRoleInput.value !== 'guest';
        if (adminProjects.length === 0) {
            const empty = doc.createElement('p');
            empty.className = 'panel-description';
            empty.textContent = 'Create a project before inviting a guest.';
            inviteProjectOptions.append(empty);
        }
    }
    async function sendPasswordRecoveryEmail(member) {
        try {
            await request(`/users/${member.id}/password-reset`, {
                method: 'POST',
                body: JSON.stringify({}),
            });
            options.report(`Password recovery email sent to ${member.email}.`);
        }
        catch (error) {
            options.report(error instanceof Error ? error.message : 'Could not send the password recovery email.', true);
        }
    }
    async function resendInvite(inviteId) {
        try {
            const result = await request(`/users/invites/${inviteId}/resend`, {
                method: 'POST',
                body: JSON.stringify({}),
            });
            options.report(`Invite resent to ${result.invite.email}. The previous link no longer works.`);
            await load();
        }
        catch (error) {
            options.report(error instanceof Error ? error.message : 'Could not resend the invite.', true);
        }
    }
    async function revokeInvite(inviteId) {
        try {
            await request(`/users/invites/${inviteId}`, { method: 'DELETE' });
            options.report('Invite revoked.');
            await load();
            const nextAction = invitesList.querySelector('.workspace-invite-actions button')
                ?? inviteForm.querySelector('button[type="submit"]');
            nextAction?.focus();
        }
        catch (error) {
            options.report(error instanceof Error ? error.message : 'Could not revoke the invite.', true);
        }
    }
    function hasOpenDialog() {
        return deactivationDialog.open || roleDialog.open || guestProjectsDialog.open;
    }
    function closeOpenDialogs() {
        if (deactivationDialog.open)
            closeDeactivationConfirmation();
        if (roleDialog.open)
            closeRoleConfirmation();
        if (guestProjectsDialog.open)
            closeGuestProjectAccess();
    }
    function closeCurrentDialog() {
        if (deactivationDialog.open)
            closeDeactivationConfirmation();
        else if (roleDialog.open)
            closeRoleConfirmation();
        else if (guestProjectsDialog.open)
            closeGuestProjectAccess();
        else
            return false;
        return true;
    }
    membersTab.addEventListener('click', () => switchTab('members'), { signal: listeners.signal });
    invitesTab.addEventListener('click', () => switchTab('invites'), { signal: listeners.signal });
    workspacesTab.addEventListener('click', () => switchTab('workspaces'), { signal: listeners.signal });
    tabs.addEventListener('keydown', (event) => {
        const tabButtons = [membersTab, invitesTab, workspacesTab];
        const names = ['members', 'invites', 'workspaces'];
        const currentIndex = tabButtons.indexOf(event.target);
        if (currentIndex < 0 || event.altKey || event.ctrlKey || event.metaKey)
            return;
        let nextIndex;
        if (event.key === 'ArrowRight')
            nextIndex = (currentIndex + 1) % tabButtons.length;
        else if (event.key === 'ArrowLeft')
            nextIndex = (currentIndex - 1 + tabButtons.length) % tabButtons.length;
        else if (event.key === 'Home')
            nextIndex = 0;
        else if (event.key === 'End')
            nextIndex = tabButtons.length - 1;
        else
            return;
        event.preventDefault();
        event.stopPropagation();
        const nextTab = tabButtons[nextIndex];
        const nextName = names[nextIndex];
        if (nextTab !== undefined && nextName !== undefined) {
            switchTab(nextName);
            nextTab.focus();
        }
    }, { signal: listeners.signal });
    deactivationCancel.addEventListener('click', () => closeDeactivationConfirmation(), { signal: listeners.signal });
    deactivationDialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        closeDeactivationConfirmation();
    }, { signal: listeners.signal });
    deactivationConfirm.addEventListener('click', () => {
        const target = deactivationTarget;
        if (target === null)
            return;
        closeDeactivationConfirmation(false);
        void setMemberActive(target.member, false);
    }, { signal: listeners.signal });
    roleCancel.addEventListener('click', () => closeRoleConfirmation(), { signal: listeners.signal });
    roleDialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        closeRoleConfirmation();
    }, { signal: listeners.signal });
    roleConfirm.addEventListener('click', () => {
        const target = roleChangeTarget;
        if (target === null)
            return;
        closeRoleConfirmation(false);
        void setMemberRole(target.member, target.role, target.select);
    }, { signal: listeners.signal });
    guestProjectsCancel.addEventListener('click', () => closeGuestProjectAccess(), { signal: listeners.signal });
    guestProjectsDialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        closeGuestProjectAccess();
    }, { signal: listeners.signal });
    guestProjectsSave.addEventListener('click', () => void saveGuestProjectAccess(), { signal: listeners.signal });
    inviteRoleInput.addEventListener('change', () => {
        inviteProjectSelection.hidden = inviteRoleInput.value !== 'guest';
    }, { signal: listeners.signal });
    inviteForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const values = new FormData(inviteForm);
        const role = values.get('role') === 'guest' ? 'guest' : 'developer';
        const projectIds = values.getAll('project_ids').map(Number).filter(Number.isSafeInteger);
        if (role === 'guest' && projectIds.length === 0) {
            options.report('Choose at least one project for a guest invite.', true);
            inviteProjectOptions.querySelector('input')?.focus();
            return;
        }
        try {
            const result = await request('/users/invites', {
                method: 'POST',
                body: JSON.stringify({
                    name: values.get('name'),
                    email: values.get('email'),
                    role,
                    project_ids: role === 'guest' ? projectIds : [],
                }),
            });
            inviteForm.reset();
            inviteProjectSelection.hidden = true;
            options.report(`Invitation sent to ${result.invite.email}.`);
            await load();
        }
        catch (error) {
            options.report(error instanceof Error ? error.message : 'Could not send the invitation email.', true);
        }
    }, { signal: listeners.signal });
    return {
        open,
        load,
        switchTab,
        currentTab,
        focusSelectedTab,
        hasOpenDialog,
        closeOpenDialogs,
        closeCurrentDialog,
        dispose: () => listeners.abort(),
    };
}
