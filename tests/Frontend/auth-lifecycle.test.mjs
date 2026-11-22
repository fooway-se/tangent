import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
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
  assert.match(html, /id="generated-credential-link"/);
  assert.match(html, /id="copy-generated-credential-link"/);
  assert.match(app, /checkbox\.name = 'project_ids'/);
  assert.doesNotMatch(html, /id="developer-form"/);
  assert.doesNotMatch(html, /Forgot password\?/);
  assert.match(app, /'\/users\/invites'/);
  assert.match(app, /\/users\/invites\/\$\{inviteId\}\/link/);
  assert.match(app, /\/users\/invites\/\$\{inviteId\}/);
  assert.match(app, /\/users\/\$\{member\.id\}\/password-reset/);
  assert.match(app, /function showGeneratedCredentialLink\(/);
  assert.match(app, /If this creates a new account, Tangent emails a verification code to the invited address\./);
});

test('pending invite details and actions fit narrow phone screens', () => {
  assert.match(app, /details\.className = 'workspace-invite-details'/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*\.workspace-invite-row\s*\{[^}]*flex-direction:\s*column/);
  assert.match(css, /\.workspace-invite-actions\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(css, /\.workspace-invite-actions \.button\s*\{[^}]*min-height:\s*44px/);
});

test('generated credential links use the same host port as the development app', () => {
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
  assert.match(app, /workspace_name: string/);
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
  assert.match(inviteFlow, /inviteCredentialPresentation\(result\.invite\.email_verification_required\)/);
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
  assert.match(app, /function renderWorkspaceMembers\(/);
  assert.match(app, /function renderWorkspaceInvites\(/);
  assert.match(app, /label\.textContent = `\$\{member\.name\}/);
  assert.match(app, /\/users\/invites/);
  assert.match(app, /sendMemberPasswordRecoveryEmail/);
  assert.match(app, /await loadWorkspaceAdmin\(\)/);
});

test('generated credential links remain visible outside the hidden admin tabs', () => {
  assert.match(html, /id="workspace-admin-workspaces-panel"[\s\S]*?<\/section>\s*<section id="generated-credential-link"/);
});

test('workspace administration has keyboard tabs and member activation controls', () => {
  assert.ok(/function switchWorkspaceAdminTab\(/.test(app), 'Workspace admin tab switching is implemented.');
  assert.ok(/workspaceAdminTabs\.addEventListener\('keydown'/.test(app), 'Workspace admin tabs support keyboard navigation.');
  assert.ok(/event\.key === 'ArrowRight'/.test(app));
  assert.ok(/event\.key === 'ArrowLeft'/.test(app));
  assert.ok(/member\.is_active \? 'Deactivate' : 'Reactivate'/.test(app), 'Members can be deactivated or reactivated.');
  assert.ok(/\/users\/\$\{member\.id\}\/status/.test(app), 'Member activation calls the status endpoint.');
});

test('workspace administrators can change member roles with confirmation for admin access', () => {
  assert.match(html, /id="workspace-member-role-confirmation-dialog"/);
  assert.match(html, /id="workspace-member-role-confirm"/);
  assert.match(app, /function openWorkspaceMemberRoleConfirmation\(/);
  assert.match(app, /roleSelect.addEventListener\('change'/);
  assert.match(app, /\/users\/\$\{member.id\}\/role/);
  assert.match(app, /role !== member.role && \(role === 'admin' \|\| member.role === 'admin'\)/);
});

test('workspace administrators can manage a guest member project access', () => {
  assert.match(html, /id="workspace-guest-projects-dialog"/);
  assert.match(html, /id="workspace-guest-project-options"/);
  assert.match(app, /manageProjectsButton\.textContent = 'Manage projects'/);
  assert.match(app, /function openWorkspaceGuestProjectAccess\(/);
  assert.match(app, /\/users\/\$\{member\.id\}\/projects/);
  assert.match(app, /function saveWorkspaceGuestProjectAccess\(/);
});

test('guest access editor shows existing read-only memberships so admins can revoke them', () => {
  const editor = app.slice(
    app.indexOf('async function openWorkspaceGuestProjectAccess('),
    app.indexOf('function closeWorkspaceGuestProjectAccess('),
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
  assert.match(app, /firstProjectCheckbox\.focus\(\)/);
  assert.match(app, /if \(\(commandPalette\.open.*workspaceGuestProjectsDialog\.open.*\)\s*\n\s*&& event\.key !== 'Escape'/);
});

test('workspace member rows give identity its own line and group role/actions below', () => {
  const renderer = app.slice(app.indexOf('function renderWorkspaceMembers('), app.indexOf('function openWorkspaceMemberDeactivationConfirmation('));
  assert.match(renderer, /label\.className = 'workspace-admin-member-identity'/);
  assert.match(renderer, /memberTools\.className = 'workspace-admin-member-tools'/);
  assert.match(renderer, /memberTools\.append\(roleControl, actions\)/);
  assert.match(renderer, /item\.append\(label, memberTools\)/);
  assert.match(css, /\.workspace-admin-member-row\s*\{[^}]*display:\s*grid/s);
});

test('OpenAPI exposes public token completion and admin initiated email recovery', () => {
  for (const path of [
    '/auth/invites/inspect', '/auth/invites/accept', '/auth/password-reset/complete',
    '/users/invites', '/users/invites/{id}/link', '/users/{id}/password-reset', '/users/{id}/status', '/users/{id}/role',
    '/users/{id}/projects',
  ]) {
    assert.ok(openapi.includes(`  ${path}:`), `Missing ${path}`);
  }
  assert.doesNotMatch(openapi, /  \/auth\/password-reset:/);
  assert.match(openapi, /password: \{ type: string, minLength: 15, maxLength: 128/);
  const resetDelivery = app.slice(
    app.indexOf('async function sendMemberPasswordRecoveryEmail('),
    app.indexOf('async function generateNewInviteLink('),
  );
  assert.doesNotMatch(resetDelivery, /reset_url/);
  assert.match(resetDelivery, /Password recovery email sent to/);
  const resetContract = openapi.slice(openapi.indexOf('  \/users\/{id}\/password-reset:'), openapi.indexOf('  \/tokens:'));
  assert.match(resetContract, /email/);
  assert.doesNotMatch(resetContract, /required: \[reset_url, expires_at\]/);
  assert.match(resetContract, /'503':/);
});
