import { api } from './api-c96a28d6bb6c.js';
export function initWorkspaceAdminUi(options) {
    const doc = options.doc ?? document;
    const request = options.request ?? api;
    const tabs = required('#workspace-admin-tabs');
    const membersTab = required('#workspace-admin-members-tab');
    const invitesTab = required('#workspace-admin-invites-tab');
    const agentsTab = required('#workspace-admin-agents-tab');
    const workspacesTab = required('#workspace-admin-workspaces-tab');
    const membersPanel = required('#workspace-admin-members-panel');
    const invitesPanel = required('#workspace-admin-invites-panel');
    const agentsPanel = required('#workspace-admin-agents-panel');
    const workspacesPanel = required('#workspace-admin-workspaces-panel');
    const membersList = required('#workspace-members-list');
    const membersEmpty = required('#workspace-members-empty');
    const invitesList = required('#workspace-invites-list');
    const invitesEmpty = required('#workspace-invites-empty');
    const inviteForm = required('#invite-form');
    const agentsList = required('#workspace-agents-list');
    const agentsEmpty = required('#workspace-agents-empty');
    const agentForm = required('#agent-form');
    const agentProjectOptions = required('#agent-project-options');
    const agentExpiresInDays = required('#agent-expires-in-days');
    const agentTokenDialog = required('#workspace-agent-token-dialog');
    const agentTokenValue = required('#workspace-agent-token-value');
    const agentTokenCopy = required('#workspace-agent-token-copy');
    const agentTokenClose = required('#workspace-agent-token-close');
    const agentRevokeDialog = required('#workspace-agent-revoke-dialog');
    const agentRevokeDescription = required('#workspace-agent-revoke-description');
    const agentRevokeCancel = required('#workspace-agent-revoke-cancel');
    const agentRevokeConfirm = required('#workspace-agent-revoke-confirm');
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
    let agentRevokeTarget = null;
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
            ['agents', agentsTab, agentsPanel],
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
        const panel = [membersPanel, invitesPanel, agentsPanel, workspacesPanel].find((candidate) => !candidate.hidden);
        if (panel === undefined)
            return;
        const hasFocusableContent = Array.from(panel.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')).some((element) => element.tabIndex >= 0 && !element.matches(':disabled') && element.closest('[hidden]') === null);
        panel.tabIndex = hasFocusableContent ? -1 : 0;
    }
    async function load() {
        if (options.getUser()?.role !== 'admin')
            return;
        membersList.replaceChildren();
        invitesList.replaceChildren();
        agentsList.replaceChildren();
        membersEmpty.textContent = 'Loading members…';
        invitesEmpty.textContent = 'Loading invitations…';
        agentsEmpty.textContent = 'Loading agents…';
        membersEmpty.hidden = false;
        invitesEmpty.hidden = false;
        agentsEmpty.hidden = false;
        try {
            const [members, invites, projects, agents] = await Promise.all([
                request('/users'),
                request('/users/invites'),
                request('/projects'),
                request('/agents'),
            ]);
            if (!options.isVisible())
                return;
            adminProjects = projects.projects.filter((project) => project.status === 'active' || project.status === 'paused');
            renderMembers(members.users);
            renderInvites(invites.invites);
            renderInviteProjectOptions();
            renderAgentProjectOptions();
            renderAgents(agents.agents);
            updatePanelTabIndex();
        }
        catch (error) {
            membersEmpty.textContent = 'Could not load workspace members.';
            invitesEmpty.textContent = 'Could not load invitations.';
            agentsEmpty.textContent = 'Could not load agents.';
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
        membersEmpty.textContent = 'No members yet.';
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
        invitesEmpty.textContent = 'No pending invites.';
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
    function renderAgentProjectOptions() {
        agentProjectOptions.replaceChildren();
        for (const project of adminProjects) {
            const label = doc.createElement('label');
            label.className = 'admin-project-option';
            const checkbox = doc.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.name = 'project_ids';
            checkbox.value = String(project.id);
            label.append(checkbox, doc.createTextNode(project.name));
            agentProjectOptions.append(label);
        }
        if (adminProjects.length === 0) {
            const empty = doc.createElement('p');
            empty.className = 'panel-description';
            empty.textContent = 'Create an active or paused project before adding an agent.';
            agentProjectOptions.append(empty);
        }
    }
    function renderAgents(agents) {
        agentsList.replaceChildren();
        agentsEmpty.hidden = agents.length > 0;
        agentsEmpty.textContent = 'No agents yet.';
        for (const agent of agents) {
            const item = doc.createElement('li');
            item.className = 'workspace-agent-row';
            const identity = doc.createElement('span');
            identity.className = 'workspace-admin-member-identity';
            identity.textContent = `${agent.name} · ${agent.is_active ? 'Active' : 'Revoked'}`;
            const grants = doc.createElement('span');
            grants.className = 'workspace-agent-grants';
            const projectNames = agent.project_ids.map((id) => adminProjects.find((project) => project.id === id)?.name ?? `Project ${id}`);
            const capabilityNames = {
                'issues.read': 'Read issues',
                'issues.comment': 'Post comments',
                'issues.status.update': 'Update status',
            };
            const capabilities = agent.capabilities.map((capability) => capabilityNames[capability]);
            grants.textContent = `Projects: ${projectNames.join(', ')} · Access: ${capabilities.join(', ')}`;
            const tokenInfo = doc.createElement('span');
            tokenInfo.className = 'workspace-agent-token-info';
            const expires = agent.token_expires_at ?? 'unknown';
            const lastUsed = agent.token_last_used_at ?? 'Never used';
            tokenInfo.textContent = `Token expires ${expires} · Last used ${lastUsed}`;
            item.append(identity, grants, tokenInfo);
            if (agent.is_active) {
                const actions = doc.createElement('div');
                actions.className = 'workspace-admin-member-actions';
                const rotate = doc.createElement('button');
                rotate.type = 'button';
                rotate.className = 'button button-quiet';
                rotate.textContent = 'Rotate token';
                rotate.addEventListener('click', () => void rotateAgentToken(agent), { signal: listeners.signal });
                const revoke = doc.createElement('button');
                revoke.type = 'button';
                revoke.className = 'button button-quiet button-danger';
                revoke.textContent = 'Revoke agent';
                revoke.addEventListener('click', () => openAgentRevokeConfirmation(agent, revoke), { signal: listeners.signal });
                actions.append(rotate, revoke);
                item.append(actions);
            }
            agentsList.append(item);
        }
    }
    function showAgentToken(token) {
        agentTokenValue.textContent = token;
        agentTokenDialog.showModal();
        agentTokenClose.focus();
    }
    function closeAgentTokenDialog() {
        if (agentTokenDialog.open)
            agentTokenDialog.close();
        agentTokenValue.textContent = '';
    }
    function openAgentRevokeConfirmation(agent, button) {
        agentRevokeTarget = { agent, button };
        agentRevokeDescription.textContent = `Revoke ${agent.name}? Its current token will stop working immediately. Create a replacement if this agent needs access again.`;
        agentRevokeDialog.showModal();
        agentRevokeCancel.focus();
    }
    function closeAgentRevokeConfirmation(restoreFocus = true) {
        if (agentRevokeDialog.open)
            agentRevokeDialog.close();
        const target = agentRevokeTarget;
        agentRevokeTarget = null;
        if (restoreFocus && options.isVisible() && target?.button.isConnected)
            target.button.focus();
    }
    async function createAgent(event) {
        event.preventDefault();
        const values = new FormData(agentForm);
        const name = String(values.get('name') ?? '').trim();
        const projectIds = values.getAll('project_ids').map(Number).filter((id) => Number.isSafeInteger(id) && id > 0);
        const capabilities = values.getAll('capabilities').map(String);
        const expiresInDays = Number(values.get('expires_in_days') ?? 90);
        if (name.length < 2 || name.length > 120) {
            options.report('Agent name must be between 2 and 120 characters.', true);
            return;
        }
        if (projectIds.length === 0) {
            options.report('Choose at least one project for this agent.', true);
            agentProjectOptions.querySelector('input')?.focus();
            return;
        }
        const allowedCapabilities = ['issues.read', 'issues.comment', 'issues.status.update'];
        if (capabilities.length === 0 || capabilities.some((capability) => !allowedCapabilities.includes(capability))) {
            options.report('Choose one or more supported agent capabilities.', true);
            return;
        }
        if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 365) {
            options.report('Token lifetime must be between 1 and 365 days.', true);
            return;
        }
        try {
            const result = await request('/agents', {
                method: 'POST',
                body: JSON.stringify({ name, project_ids: projectIds, capabilities, expires_in_days: expiresInDays }),
            });
            agentForm.reset();
            showAgentToken(result.token);
            options.report('Agent created. Copy its token now; Tangent will not show it again.');
            await load();
        }
        catch (error) {
            options.report(error instanceof Error ? error.message : 'Could not create the agent.', true);
        }
    }
    async function rotateAgentToken(agent) {
        const expiresInDays = Number(agentExpiresInDays.value || 90);
        if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 365) {
            options.report('Token lifetime must be between 1 and 365 days.', true);
            agentExpiresInDays.focus();
            return;
        }
        try {
            const result = await request(`/agents/${agent.id}/tokens`, {
                method: 'POST',
                body: JSON.stringify({ expires_in_days: expiresInDays }),
            });
            showAgentToken(result.token);
            options.report(`Token rotated for ${agent.name}. Copy it now; Tangent will not show it again.`);
            await load();
        }
        catch (error) {
            options.report(error instanceof Error ? error.message : `Could not rotate ${agent.name}'s token.`, true);
        }
    }
    async function revokeAgent() {
        const target = agentRevokeTarget;
        if (target === null)
            return;
        closeAgentRevokeConfirmation(false);
        try {
            await request(`/agents/${target.agent.id}`, { method: 'DELETE' });
            options.report(`${target.agent.name} revoked.`);
            await load();
            agentForm.querySelector('input')?.focus();
        }
        catch (error) {
            options.report(error instanceof Error ? error.message : `Could not revoke ${target.agent.name}.`, true);
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
        return deactivationDialog.open || roleDialog.open || guestProjectsDialog.open
            || agentTokenDialog.open || agentRevokeDialog.open;
    }
    function closeOpenDialogs() {
        if (deactivationDialog.open)
            closeDeactivationConfirmation();
        if (roleDialog.open)
            closeRoleConfirmation();
        if (guestProjectsDialog.open)
            closeGuestProjectAccess();
        if (agentTokenDialog.open)
            closeAgentTokenDialog();
        if (agentRevokeDialog.open)
            closeAgentRevokeConfirmation();
    }
    function closeCurrentDialog() {
        if (deactivationDialog.open)
            closeDeactivationConfirmation();
        else if (roleDialog.open)
            closeRoleConfirmation();
        else if (guestProjectsDialog.open)
            closeGuestProjectAccess();
        else if (agentTokenDialog.open)
            closeAgentTokenDialog();
        else if (agentRevokeDialog.open)
            closeAgentRevokeConfirmation();
        else
            return false;
        return true;
    }
    membersTab.addEventListener('click', () => switchTab('members'), { signal: listeners.signal });
    invitesTab.addEventListener('click', () => switchTab('invites'), { signal: listeners.signal });
    agentsTab.addEventListener('click', () => switchTab('agents'), { signal: listeners.signal });
    workspacesTab.addEventListener('click', () => switchTab('workspaces'), { signal: listeners.signal });
    tabs.addEventListener('keydown', (event) => {
        const tabButtons = [membersTab, invitesTab, agentsTab, workspacesTab];
        const names = ['members', 'invites', 'agents', 'workspaces'];
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
    agentTokenClose.addEventListener('click', closeAgentTokenDialog, { signal: listeners.signal });
    agentTokenDialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        closeAgentTokenDialog();
    }, { signal: listeners.signal });
    agentTokenCopy.addEventListener('click', async () => {
        try {
            if (navigator.clipboard === undefined)
                throw new Error('Clipboard access is unavailable in this browser.');
            await navigator.clipboard.writeText(agentTokenValue.textContent ?? '');
            options.report('Agent token copied.');
        }
        catch (error) {
            options.report(error instanceof Error ? error.message : 'Could not copy the agent token.', true);
        }
    }, { signal: listeners.signal });
    agentRevokeCancel.addEventListener('click', () => closeAgentRevokeConfirmation(), { signal: listeners.signal });
    agentRevokeDialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        closeAgentRevokeConfirmation();
    }, { signal: listeners.signal });
    agentRevokeConfirm.addEventListener('click', () => void revokeAgent(), { signal: listeners.signal });
    agentForm.addEventListener('submit', (event) => void createAgent(event), { signal: listeners.signal });
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
