import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../../public/assets/app.css', import.meta.url), 'utf8');
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

test('the sidebar can switch workspaces and workspace admins can create one', () => {
  assert.match(html, /id="workspace-switcher"/);
  assert.match(html, /id="create-workspace-form"/);
});

test('workspace UI uses the beige case, dark screens and shared rounded controls', () => {
  assert.match(tokens, /--case-top:\s*#[0-9a-f]{6}/i);
  assert.match(tokens, /--screen:\s*#[0-9a-f]{6}/i);
  assert.match(tokens, /--screen-border:\s*#[0-9a-f]{6}/i);
  assert.match(tokens, /--signal-stripe:\s*linear-gradient/);
  assert.match(css, /\.workspace-screen, \.project-chat-column\s*\{[^}]*var\(--screen\)/s);
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
