import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { switchWorkspaceMembership } from '../../public/assets/workspace-switch.js';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../../public/assets/app.css', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const guestUi = await readFile(new URL('../../frontend/src/guest-ui.ts', import.meta.url), 'utf8');
const workspacePickerUi = await readFile(new URL('../../frontend/src/workspace-picker-ui.ts', import.meta.url), 'utf8');
const tokens = await readFile(new URL('../../public/assets/tokens.css', import.meta.url), 'utf8');
const workspaceStart = html.indexOf('id="workspace-panel"');
const sidebarStart = html.indexOf('class="workspace-sidebar"', workspaceStart);
const stageStart = html.indexOf('class="workspace-stage"', workspaceStart);

test('workspace navigation is a persistent left rail beside the main stage', () => {
  assert.notEqual(workspaceStart, -1, 'workspace panel exists');
  assert.notEqual(sidebarStart, -1, 'workspace sidebar exists');
  assert.notEqual(stageStart, -1, 'workspace stage exists');
  assert.ok(sidebarStart < stageStart, 'sidebar precedes the main stage');

  const sidebar = html.slice(sidebarStart, stageStart);
  assert.match(sidebar, /id="workspace-nav"/);
  assert.match(sidebar, /id="project-sidebar-list"/);
  assert.match(sidebar, /id="account-bar"/);
});

test('workspace notifications attach to the active page heading without shifting its content', () => {
  assert.match(app, /function moveWorkspaceStatusToCurrentHeading\([\s\S]*?querySelector<HTMLElement>\('\.page-heading'\)[\s\S]*?append\(statusMessage\)/);
  assert.match(app, /function showWorkspaceView\([\s\S]*?moveWorkspaceStatusToCurrentHeading\(\)/);
  assert.match(app, /function report\([\s\S]*?moveWorkspaceStatusToCurrentHeading\(\)/);
  assert.match(css, /\.page-heading\s*\{[^}]*position:\s*relative/);
  assert.match(css, /#status-message\s*\{[^}]*position:\s*absolute[^}]*top:\s*0[^}]*right:\s*0/);
});

test('the sidebar can switch workspaces and workspace admins can create one', () => {
  assert.match(html, /id="workspace-switcher"/);
  assert.match(html, /id="create-workspace-form"/);
});

test('guest view can switch workspaces through the shared picker and return to an internal role', () => {
  const guestShell = html.slice(html.indexOf('id="guest-shell"'), html.indexOf('id="workspace-panel"'));
  assert.match(guestShell, /id="guest-workspace-switcher"/);
  assert.match(workspacePickerUi, /guestWorkspaceSwitcher\.addEventListener\('click', \(\) => open\(\)/);
  assert.match(app, /switchWorkspaceMembership\(/);
  assert.match(app, /if \(user\.role === 'guest'\) \{\s*void guestUi\.showGuestShell\(user\)/);
  assert.match(guestUi, /await loadGuestProjects\(guestModeVersion\)/);
  assert.match(workspacePickerUi, /workspacePicker\.addEventListener\('close',[\s\S]*guestWorkspaceSwitcher\.focus\(\)/);
});

test('workspace selector round trip loads role-scoped views from each switch response', async () => {
  const internalUser = { id: 14, role: 'admin', workspace_id: 3 };
  const guestUser = { id: 27, role: 'guest', workspace_id: 8 };
  let activeUser = internalUser;
  const events = [];
  const request = async (workspaceId) => {
    events.push(`request:${workspaceId}`);
    if (workspaceId === guestUser.workspace_id) return { user: guestUser, workspace: { id: 8, name: 'Client' } };
    assert.equal(workspaceId, internalUser.workspace_id);
    return { user: internalUser, workspace: { id: 3, name: 'Internal' } };
  };
  const showSignedIn = (user) => {
    activeUser = user;
    events.push(`view:${user.role}`);
  };
  const loadWorkspaces = async () => events.push(`workspaces:${activeUser.role}`);
  const loadProjects = async () => events.push(`projects:${activeUser.role}`);

  await switchWorkspaceMembership(activeUser, guestUser.workspace_id, request, showSignedIn, loadWorkspaces, loadProjects);
  assert.equal(activeUser, guestUser);
  await switchWorkspaceMembership(activeUser, internalUser.workspace_id, request, showSignedIn, loadWorkspaces, loadProjects);
  assert.equal(activeUser, internalUser);
  assert.deepEqual(events, [
    'request:8', 'view:guest', 'workspaces:guest',
    'request:3', 'view:admin', 'workspaces:admin', 'projects:admin',
  ]);
});

test('workspace UI uses the beige case, dark screens and shared rounded controls', () => {
  assert.match(tokens, /--case-top:\s*#[0-9a-f]{6}/i);
  assert.match(tokens, /--screen:\s*#[0-9a-f]{6}/i);
  assert.match(tokens, /--screen-border:\s*#[0-9a-f]{6}/i);
  assert.match(tokens, /--signal-stripe:\s*linear-gradient/);
  assert.match(css, /\.workspace-screen, \.project-chat-column\s*\{[^}]*background: var\(--screen-surface\)/s);
  assert.match(tokens, /--screen-surface:\s*[^;]*var\(--screen\)/);
  assert.match(css, /\.panel\s*\{[^}]*border-radius:\s*var\(--radius-panel\)/s);
});

test('issues and chat are two separate screens side by side', () => {
  const projectStart = html.indexOf('id="project-view"', stageStart);
  const adminStart = html.indexOf('id="admin-view"', projectStart);
  const chatStart = html.indexOf('id="project-chat-column"', stageStart);
  assert.notEqual(projectStart, -1, 'project view exists');
  assert.notEqual(adminStart, -1, 'admin view follows project view');
  assert.notEqual(chatStart, -1, 'chat screen exists');

  const projectView = html.slice(projectStart, adminStart);
  assert.match(projectView, /class="project-main"/);
  assert.doesNotMatch(projectView, /id="project-chat-column"/, 'chat is its own screen, not part of the project view');
  assert.doesNotMatch(projectView, /class="project-sidebar"/);
  assert.ok(html.indexOf('class="workspace-screen"', stageStart) < projectStart, 'issues live in the main screen');
  assert.ok(adminStart < chatStart, 'the chat screen follows the main screen');
  assert.match(html.slice(chatStart), /^id="project-chat-column"[^>]*>\s*<div id="chat-view"/, 'the chat screen hosts the chat');
});

test('the keyboard strip sits under both screens and the sidebar', () => {
  const chatStart = html.indexOf('id="project-chat-column"', stageStart);
  const footerStart = html.indexOf('id="keyboard-hints"', stageStart);
  assert.ok(footerStart > chatStart, 'the strip comes after the chat screen');
  assert.match(css, /\.keyboard-hints\s*\{[^}]*grid-column:\s*1 \/ -1/s, 'the strip spans every column');
});
