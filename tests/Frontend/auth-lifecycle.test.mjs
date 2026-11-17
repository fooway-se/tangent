import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
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
});

test('generated credential links use the same host port as the development app', () => {
  assert.match(compose, /"\$\{TANGENT_HTTP_PORT:-8081\}:8080"/);
  assert.match(compose, /TANGENT_APP_URL:\s*"http:\/\/localhost:\$\{TANGENT_HTTP_PORT:-8081\}"/);
});

test('invite and password reset fragments are removed before public requests', () => {
  assert.match(html, /id="credential-flow"/);
  assert.match(html, /id="login-admin-help"[^>]*hidden/);
  assert.match(html, /Contact a workspace admin to generate a password reset link\./);
  assert.match(html, /autocomplete="new-password"/);
  assert.match(app, /function consumeCredentialFragment\(/);
  assert.match(app, /history\.replaceState\(null, '', location\.pathname \+ location\.search\)/);
  assert.match(app, /'\/auth\/invites\/inspect'/);
  assert.match(app, /'\/auth\/invites\/accept'/);
  assert.match(app, /workspace_name: string/);
  const inviteCopy = app.slice(
    app.indexOf('credentialFlowDescription.textContent ='),
    app.indexOf('credentialPasswordFields.hidden = !result.invite.password_required'),
  );
  assert.match(inviteCopy, /result\.invite\.workspace_name/);
  assert.doesNotMatch(inviteCopy, /result\.invite\.email/);
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

test('workspace administration renders member and invite data as text', () => {
  assert.match(app, /function renderWorkspaceMembers\(/);
  assert.match(app, /function renderWorkspaceInvites\(/);
  assert.match(app, /label\.textContent = `\$\{member\.name\}/);
  assert.match(app, /\/users\/invites/);
  assert.match(app, /reset_url/);
  assert.match(app, /await loadWorkspaceAdmin\(\)/);
});

test('workspace administration has keyboard tabs and member activation controls', () => {
  assert.ok(/function switchWorkspaceAdminTab\(/.test(app), 'Workspace admin tab switching is implemented.');
  assert.ok(/workspaceAdminTabs\.addEventListener\('keydown'/.test(app), 'Workspace admin tabs support keyboard navigation.');
  assert.ok(/event\.key === 'ArrowRight'/.test(app));
  assert.ok(/event\.key === 'ArrowLeft'/.test(app));
  assert.ok(/member\.is_active \? 'Deactivate' : 'Reactivate'/.test(app), 'Members can be deactivated or reactivated.');
  assert.ok(/\/users\/\$\{member\.id\}\/status/.test(app), 'Member activation calls the status endpoint.');
});

test('OpenAPI exposes public token completion and manual admin credential-link routes', () => {
  for (const path of [
    '/auth/invites/inspect', '/auth/invites/accept', '/auth/password-reset/complete',
    '/users/invites', '/users/invites/{id}/link', '/users/{id}/password-reset', '/users/{id}/status',
  ]) {
    assert.ok(openapi.includes(`  ${path}:`), `Missing ${path}`);
  }
  assert.doesNotMatch(openapi, /  \/auth\/password-reset:/);
  assert.match(openapi, /password: \{ type: string, minLength: 15, maxLength: 128/);
});
