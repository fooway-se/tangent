import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
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
