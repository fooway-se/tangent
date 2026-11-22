import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const workspaceAdminUi = await readFile(new URL('../../frontend/src/workspace-admin-ui.ts', import.meta.url), 'utf8');
const types = await readFile(new URL('../../frontend/src/types.ts', import.meta.url), 'utf8');
const css = await readFile(new URL('../../public/assets/app.css', import.meta.url), 'utf8');
const openapi = await readFile(new URL('../../docs/openapi.yaml', import.meta.url), 'utf8');
const compose = await readFile(new URL('../../compose.yaml', import.meta.url), 'utf8');

test('workspace admin invites members without creating their passwords', () => {
  assert.match(html, /id="invite-form"/);
  assert.match(html, /id="workspace-members-list"/);
  assert.match(html, /id="workspace-invites-list"/);
  assert.ok(/id="workspace-admin-tabs"[^>]*role="tablist"/.test(html), 'Workspace admin tablist exists.');
  assert.ok(/id="workspace-admin-members-tab"[^>]*role="tab"/.test(html), 'Members tab exists.');
  assert.ok(/id="workspace-admin-invites-tab"[^>]*role="tab"/.test(html), 'Invites tab exists.');
  assert.ok(/id="workspace-admin-workspaces-tab"[^>]*role="tab"/.test(html), 'Workspaces tab exists.');
  assert.doesNotMatch(html, /id="generated-credential-link"/);
  assert.match(workspaceAdminUi, /checkbox\.name = 'project_ids'/);
  assert.doesNotMatch(html, /id="developer-form"/);
  assert.doesNotMatch(html, /Forgot password\?/);
  assert.match(workspaceAdminUi, /'\/users\/invites'/);
  assert.match(workspaceAdminUi, /\/users\/invites\/\$\{inviteId\}\/resend/);
  assert.match(workspaceAdminUi, /\/users\/invites\/\$\{inviteId\}/);
  assert.match(workspaceAdminUi, /\/users\/\$\{member\.id\}\/password-reset/);
  assert.match(html, /Send invite/);
  assert.match(workspaceAdminUi, /Invitation sent to/);
  assert.match(workspaceAdminUi, /Invite resent to/);
});

test('member deactivation explains permanent workspace credential revocation', () => {
  const deactivationDialog = html.slice(
    html.indexOf('id="workspace-member-deactivation-dialog"'),
    html.indexOf('id="workspace-member-role-confirmation-dialog"'),
  );
  assert.match(workspaceAdminUi, /existing browser sessions and API tokens for this workspace will be revoked/i);
  assert.match(deactivationDialog, /reactivating won't restore old credentials/i);
  const endpoint = openapi.slice(openapi.indexOf('  /users/{id}/status:'), openapi.indexOf('  /users/{id}/role:'));
  assert.match(endpoint, /Deactivation revokes the member's browser sessions and API tokens in this workspace/);
  assert.match(endpoint, /Reactivating the membership does not restore those credentials/);
});

test('pending invite details and actions fit narrow phone screens', () => {
  assert.match(workspaceAdminUi, /details\.className = 'workspace-invite-details'/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*\.workspace-invite-row\s*\{[^}]*flex-direction:\s*column/);
  assert.match(css, /\.workspace-invite-actions\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(css, /\.workspace-invite-actions \.button\s*\{[^}]*min-height:\s*44px/);
});

test('credential email links use the same host port as the development app', () => {
  assert.match(compose, /"\$\{TANGENT_HTTP_PORT:-8081\}:8080"/);
  assert.match(compose, /TANGENT_APP_URL:\s*"\$\{TANGENT_APP_URL:-http:\/\/localhost:\$\{TANGENT_HTTP_PORT:-8081\}\}"/);
});

test('invite and password reset fragments are removed before public requests', () => {
  assert.match(html, /id="credential-flow"/);
  assert.match(html, /name="verification_code"/);
  assert.match(html, /id="login-admin-help"[^>]*hidden/);
  assert.match(html, /Contact a workspace admin to request a password recovery email\./);
  assert.match(html, /autocomplete="new-password"/);
  assert.match(app, /function consumeCredentialFragment\(/);
  assert.match(app, /history\.replaceState\(null, '', location\.pathname \+ location\.search\)/);
  assert.match(app, /'\/auth\/invites\/inspect'/);
  assert.match(app, /'\/auth\/invites\/accept'/);
  assert.match(types, /workspace_name: string/);
  const inviteFlow = app.slice(
    app.indexOf("credentialFlowHeading.textContent = 'Accept workspace invite';"),
    app.indexOf("credentialCancel.addEventListener('click'"),
  );
  const inviteCopy = inviteFlow.slice(
    inviteFlow.indexOf('credentialFlowDescription.textContent = `You’re invited'),
    inviteFlow.indexOf('credentialPasswordFields.hidden = !result.invite.password_required'),
  );
  assert.match(inviteCopy, /result\.invite\.workspace_name/);
  assert.doesNotMatch(inviteCopy, /result\.invite\.email/);
  assert.match(inviteFlow, /inviteCredentialPresentation\([\s\S]*result\.invite\.password_setup_required[\s\S]*result\.invite\.email_verification_required/);
  assert.match(types, /password_setup_required: boolean/);
  assert.match(app, /verification_code: values\.get\('verification_code'\)/);
  assert.match(app, /api\('\/auth\/password-reset\/complete'/);
  assert.match(app, /const credentialState = consumeCredentialFragment\(\)/);
  const loginSubmit = app.slice(
    app.indexOf("loginForm.addEventListener('submit'"),
    app.indexOf("workspaceSwitcher.addEventListener('click'"),
  );
  const resetNoteIndex = loginSubmit.indexOf('loginAdminHelp.hidden = true;');
  const loginRequestIndex = loginSubmit.indexOf("api<LoginResponse>('/auth/login'");
  assert.ok(resetNoteIndex >= 0 && resetNoteIndex < loginRequestIndex, 'Clear the admin note before each login request.');
  assert.match(loginSubmit, /error instanceof ApiFailure && error\.status === 429\)[\s\S]{0,100}loginAdminHelp\.hidden = false/);
});

test('unusable invite links show one working action back to sign in', () => {
  const failurePath = app.slice(
    app.indexOf("credentialFlowDescription.textContent = 'This invite link cannot be used.';"),
    app.indexOf("\n  }\n}", app.indexOf("credentialFlowDescription.textContent = 'This invite link cannot be used.';")),
  );
  assert.match(failurePath, /credentialSubmit\.hidden = true/);
  assert.match(failurePath, /setCredentialCancelPrimary\(\)/);
  assert.match(failurePath, /credentialCancel\.focus\(\)/);

  const primaryAction = app.slice(app.indexOf('function setCredentialCancelPrimary('), app.indexOf('async function openCredentialFlow('));
  assert.match(primaryAction, /credentialCancel\.classList\.add\('button', 'button-primary'\)/);
  assert.match(primaryAction, /credentialCancel\.textContent = 'Back to sign in'/);

  const reset = app.slice(app.indexOf('function resetAuthForms('), app.indexOf('function showCredentialFlow('));
  assert.match(reset, /credentialSubmit\.hidden = false/);
  assert.match(reset, /setCredentialCancelSecondary\(\)/);
  assert.match(reset, /loginStatusMessage\.hidden = false/);
  assert.match(reset, /loginKeyboardHints\.hidden = false/);

  const cancelHandler = app.slice(app.indexOf("credentialCancel.addEventListener('click'"), app.indexOf("credentialForm.addEventListener('submit'"));
  assert.match(cancelHandler, /resetAuthForms\(\)/);
});

test('workspace administration renders member and invite data as text', () => {
  assert.match(workspaceAdminUi, /function renderMembers\(/);
  assert.match(workspaceAdminUi, /function renderInvites\(/);
  assert.match(workspaceAdminUi, /label\.textContent = `\$\{member\.name\}/);
  assert.match(workspaceAdminUi, /\/users\/invites/);
  assert.match(workspaceAdminUi, /sendPasswordRecoveryEmail/);
  assert.match(workspaceAdminUi, /await load\(\)/);
});

test('workspace admins can resend emailed invites without retrieving their secrets', () => {
  assert.doesNotMatch(html, /id="generated-credential-link"/);
  assert.match(workspaceAdminUi, /\/users\/invites\/\$\{inviteId\}\/resend/);
});

test('workspace administration has keyboard tabs and member activation controls', () => {
  assert.match(workspaceAdminUi, /function switchTab\(/);
  assert.match(workspaceAdminUi, /tabs\.addEventListener\('keydown'/);
  assert.match(workspaceAdminUi, /event\.key === 'ArrowRight'/);
  assert.match(workspaceAdminUi, /event\.key === 'ArrowLeft'/);
  assert.match(workspaceAdminUi, /member\.is_active \? 'Deactivate' : 'Reactivate'/);
  assert.match(workspaceAdminUi, /\/users\/\$\{member\.id\}\/status/);
});

test('workspace administrators can change member roles with confirmation for admin access', () => {
  assert.match(html, /id="workspace-member-role-confirmation-dialog"/);
  assert.match(html, /id="workspace-member-role-confirm"/);
  assert.match(workspaceAdminUi, /function openRoleConfirmation\(/);
  assert.match(workspaceAdminUi, /roleSelect\.addEventListener\('change'/);
  assert.match(workspaceAdminUi, /\/users\/\$\{member\.id\}\/role/);
  assert.match(workspaceAdminUi, /role !== member\.role && \(role === 'admin' \|\| member\.role === 'admin'\)/);
});

test('workspace administrators can manage guest member project access', () => {
  assert.match(html, /id="workspace-guest-projects-dialog"/);
  assert.match(html, /id="workspace-guest-project-options"/);
  assert.match(workspaceAdminUi, /manageProjectsButton\.textContent = 'Manage projects'/);
  assert.match(workspaceAdminUi, /function openGuestProjectAccess\(/);
  assert.match(workspaceAdminUi, /\/users\/\$\{member\.id\}\/projects/);
  assert.match(workspaceAdminUi, /function saveGuestProjectAccess\(/);
});

test('guest access editor shows existing read-only memberships so admins can revoke them', () => {
  const editor = workspaceAdminUi.slice(
    workspaceAdminUi.indexOf('async function openGuestProjectAccess('),
    workspaceAdminUi.indexOf('function closeGuestProjectAccess('),
  );
  assert.match(editor, /project_ids: number\[\];[\s\S]*projects: Array<Pick<Project, 'id' \| 'name' \| 'status'>>/);
  assert.match(editor, /for \(const project of result\.projects\)/);
  assert.match(editor, /project\.status === 'completed' \|\| project\.status === 'archived'/);
  assert.match(editor, /remove access only/);
});

test('guest project checkboxes have compact layout and visible keyboard focus', () => {
  assert.match(html, /workspace-guest-projects-keyboard-hint/);
  assert.match(html, /Tab between projects[\s\S]*Space toggles/);
  assert.match(css, /\.admin-project-option input\[type="checkbox"\]\s*\{[^}]*width:\s*16px[^}]*height:\s*16px/s);
  assert.match(css, /\.admin-project-option:focus-within\s*\{[^}]*outline:/s);
  assert.match(workspaceAdminUi, /firstProjectCheckbox\.focus\(\)/);
  assert.match(app, /commandPalette\.open.*workspaceAdminUi\.hasOpenDialog\(\).*&& event\.key !== 'Escape'/s);
});

test('workspace member rows give identity its own line and group role/actions below', () => {
  const renderer = workspaceAdminUi.slice(workspaceAdminUi.indexOf('function renderMembers('), workspaceAdminUi.indexOf('function openDeactivationConfirmation('));
  assert.match(renderer, /label\.className = 'workspace-admin-member-identity'/);
  assert.match(renderer, /memberTools\.className = 'workspace-admin-member-tools'/);
  assert.match(renderer, /memberTools\.append\(roleControl, actions\)/);
  assert.match(renderer, /item\.append\(label, memberTools\)/);
  assert.match(css, /\.workspace-admin-member-row\s*\{[^}]*display:\s*grid/s);
});

test('OpenAPI exposes public token completion and admin initiated email recovery', () => {
  for (const path of [
    '/auth/invites/inspect', '/auth/invites/accept', '/auth/password-reset/complete',
    '/users/invites', '/users/invites/{id}/resend', '/users/{id}/password-reset', '/users/{id}/status', '/users/{id}/role',
    '/users/{id}/projects',
  ]) {
    assert.ok(openapi.includes(`  ${path}:`), `Missing ${path}`);
  }
  assert.doesNotMatch(openapi, /  \/auth\/password-reset:/);
  assert.match(openapi, /password: \{ type: string, minLength: 15, maxLength: 128/);
  const resetDelivery = workspaceAdminUi.slice(
    workspaceAdminUi.indexOf('async function sendPasswordRecoveryEmail('),
    workspaceAdminUi.indexOf('async function resendInvite('),
  );
  assert.doesNotMatch(resetDelivery, /reset_url/);
  assert.match(resetDelivery, /Password recovery email sent to/);
  const resetContract = openapi.slice(openapi.indexOf('  \/users\/{id}\/password-reset:'), openapi.indexOf('  \/tokens:'));
  assert.match(resetContract, /email/);
  assert.doesNotMatch(resetContract, /required: \[reset_url, expires_at\]/);
  assert.match(resetContract, /'503':/);
});
