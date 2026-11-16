import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../../public/assets/app.css', import.meta.url), 'utf8');
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

test('the sidebar can switch workspaces and workspace admins can create one', () => {
  assert.match(html, /id="workspace-switcher"/);
  assert.match(html, /id="create-workspace-form"/);
});

test('workspace UI uses the warm shell, teal panels, and shared rounded controls', () => {
  assert.match(css, /--canvas:\s*#[0-9a-f]{6}/i);
  assert.match(css, /--deep-blue:\s*#[0-9a-f]{6}/i);
  assert.match(css, /--border:\s*rgba\(159,\s*178,\s*180,\s*0\.19\)/);
  assert.match(css, /--signal-stripe:\s*linear-gradient/);
  assert.match(css, /\.workspace-sidebar\s*\{[^}]*background:\s*var\(--canvas\)/s);
  assert.match(css, /\.panel\s*\{[^}]*border-radius:\s*var\(--radius-card\)/s);
});

test('project issues and chat occupy the center and right columns', () => {
  const projectStart = html.indexOf('id="project-view"', stageStart);
  const adminStart = html.indexOf('id="admin-view"', projectStart);
  assert.notEqual(projectStart, -1, 'project view exists');
  assert.notEqual(adminStart, -1, 'admin view follows project view');

  const projectView = html.slice(projectStart, adminStart);
  assert.match(projectView, /class="project-main"/);
  assert.match(projectView, /id="project-chat-column"/);
  assert.ok(projectView.indexOf('class="project-main"') < projectView.indexOf('id="project-chat-column"'));
  assert.doesNotMatch(projectView, /class="project-sidebar"/);
});
