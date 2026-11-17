import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const openapi = await readFile(new URL('../../docs/openapi.yaml', import.meta.url), 'utf8');

test('workspace admin invites members without creating their passwords', () => {
  assert.match(html, /id="invite-form"/);
  assert.match(html, /id="workspace-members-list"/);
  assert.match(html, /id="workspace-invites-list"/);
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

test('invite and password reset fragments are removed before public requests', () => {
  assert.match(html, /id="credential-flow"/);
  assert.match(html, /id="login-admin-help"[^>]*hidden/);
  assert.match(html, /Contact a workspace admin to generate a password reset link\./);
  assert.match(html, /autocomplete="new-password"/);
  assert.match(app, /function consumeCredentialFragment\(/);
  assert.match(app, /history\.replaceState\(null, '', location\.pathname \+ location\.search\)/);
  assert.match(app, /'\/auth\/invites\/inspect'/);
  assert.match(app, /'\/auth\/invites\/accept'/);
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

test('OpenAPI exposes public token completion and manual admin credential-link routes', () => {
  for (const path of [
    '/auth/invites/inspect', '/auth/invites/accept', '/auth/password-reset/complete',
    '/users/invites', '/users/invites/{id}/link', '/users/{id}/password-reset',
  ]) {
    assert.ok(openapi.includes(`  ${path}:`), `Missing ${path}`);
  }
  assert.doesNotMatch(openapi, /  \/auth\/password-reset:/);
  assert.match(openapi, /password: \{ type: string, minLength: 15, maxLength: 128/);
});
