import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { resolveShortcut, shouldSendChatOnEnter } from '../../public/assets/shortcuts.js';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const baseContext = {
  targetIsEditable: false,
  goPrefixPending: false,
  hasWorkspace: true,
  canAdmin: false,
  hasProject: false,
  projectListVisible: false,
  inboxListVisible: false,
  hasSelectedInboxIssue: false,
  hasSelectedProject: false,
  issueListVisible: false,
  issueDetailVisible: false,
  hasSelectedIssue: false,
  hasLatestChatMessage: false,
  chatMessagesFocused: false,
  hasSelectedChatMessage: false,
  issueGroupFocused: false,
  canDismiss: false,
};

function resolve(key, overrides = {}, modifiers = {}) {
  return resolveShortcut({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...modifiers,
  }, { ...baseContext, ...overrides });
}

test('command palette works with Control or Meta even in an editable field', () => {
  const editable = { targetIsEditable: true };
  assert.equal(resolve('k', editable, { ctrlKey: true }), 'command-palette');
  assert.equal(resolve('k', editable, { metaKey: true }), 'command-palette');
});

test('single-key actions stay inactive while typing', () => {
  assert.equal(resolve('c', { hasProject: true, issueListVisible: true, targetIsEditable: true }), null);
  assert.equal(resolve('?', { targetIsEditable: true, shiftKey: true }), null);
});

test('issue navigation and actions depend on the current issue selection', () => {
  const issueList = { issueListVisible: true, hasSelectedIssue: true };
  assert.equal(resolve('j', issueList), 'next');
  assert.equal(resolve('k', issueList), 'previous');
  assert.equal(resolve('Enter', issueList), 'open-selected');
  assert.equal(resolve('e', issueList), 'edit-selected');
  assert.equal(resolve('s', issueList), 'focus-status');
  assert.equal(resolve('c', { hasProject: true, issueListVisible: true }), 'create-issue');
  assert.equal(resolve('j'), null);
  assert.equal(resolve('Enter', { issueListVisible: true }), null);
});

test('issue navigation continues from a focused group heading', () => {
  const group = { issueGroupFocused: true, issueListVisible: true, targetIsEditable: true };
  assert.equal(resolve('ArrowDown', group), 'next');
  assert.equal(resolve('j', group), 'next');
  assert.equal(resolve('ArrowUp', group), 'previous');
  assert.equal(resolve('k', group), 'previous');
  assert.match(app, /issueGroupFocused:\s*target instanceof HTMLElement && target\.closest\('\.issue-group > summary'\) !== null/);
  assert.match(app, /moveIssueSelectionFromGroup\(direction\)/);
  assert.match(app, /function moveIssueSelectionFromGroup\(direction: -1 \| 1\)/);
});

test('project list uses the same j, k, Enter navigation pattern', () => {
  const projects = { projectListVisible: true, hasSelectedProject: true };
  assert.equal(resolve('j', projects), 'next-project');
  assert.equal(resolve('k', projects), 'previous-project');
  assert.equal(resolve('Enter', projects), 'open-selected-project');
  assert.equal(resolve('Enter', { projectListVisible: true }), null);
});

test('Inbox navigation uses g then n and the shared issue-list keys', () => {
  const inbox = { inboxListVisible: true, hasSelectedInboxIssue: true };
  assert.equal(resolve('n', { goPrefixPending: true }), 'inbox');
  assert.equal(resolve('j', inbox), 'next');
  assert.equal(resolve('k', inbox), 'previous');
  assert.equal(resolve('Home', inbox), 'first-issue');
  assert.equal(resolve('End', inbox), 'last-issue');
  assert.equal(resolve('PageUp', inbox), 'page-up');
  assert.equal(resolve('PageDown', inbox), 'page-down');
  assert.equal(resolve('Enter', inbox), 'open-selected');
  assert.equal(resolve('Enter', { inboxListVisible: true }), null);
});

test('issue detail and chat shortcuts run only when their targets exist', () => {
  assert.equal(resolve('e', { issueDetailVisible: true, hasSelectedIssue: true }), 'edit-selected');
  assert.equal(resolve('s', { issueDetailVisible: true, hasSelectedIssue: true }), 'focus-status');
  assert.equal(resolve('i', { hasLatestChatMessage: true }), 'issue-from-latest-message');
  assert.equal(resolve('i'), null);
});

test('the g then p sequence returns to the project list and Escape dismisses transient views', () => {
  assert.equal(resolve('g', { hasWorkspace: true }), 'await-projects-key');
  assert.equal(resolve('p', { goPrefixPending: true }), 'projects');
  assert.equal(resolve('g', { hasWorkspace: false }), null);
  assert.equal(resolve('Escape', { canDismiss: true }), 'dismiss');
  assert.equal(resolve('Escape'), null);
});

test('Escape collapses focused issue status history before leaving issue detail', () => {
  assert.equal(resolve('Escape', { statusHistoryFocused: true, canDismiss: true }), 'collapse-status-history');
  assert.equal(resolve('Escape', { statusHistoryFocused: false, canDismiss: true }), 'dismiss');
  assert.match(app, /statusHistoryFocused:\s*issueStatusHistory\.open\s*&&\s*issueStatusHistory\.contains\(document\.activeElement\)/);
  assert.match(app, /case 'collapse-status-history':\s*issueStatusHistory\.open = false;/);
});

test('g sequences switch between available project features', () => {
  const project = { hasProject: true };
  assert.equal(resolve('i', { ...project, goPrefixPending: true }), 'issues');
  assert.equal(resolve('c', { ...project, goPrefixPending: true }), 'chat');
  assert.equal(resolve('m', { ...project, goPrefixPending: true }), 'members');
  assert.equal(resolve('a', { goPrefixPending: true, canAdmin: true }), 'workspace-admin');
  assert.equal(resolve('a', { goPrefixPending: true, canAdmin: false }), null);
});

test('g then w focuses the workspace switcher', () => {
  assert.equal(resolve('w', { goPrefixPending: true, hasWorkspace: true }), 'workspace-switcher');
});

test('Escape from a Workspace Admin field returns to its tab bar for section switching', () => {
  const blurHandler = app.slice(app.indexOf('function blurTextInput'), app.indexOf('function executeShortcut'));
  assert.match(blurHandler, /adminView\.contains\(focused\)/);
  assert.match(blurHandler, /workspaceAdminTabs\.querySelector[\s\S]{0,120}\.focus\(\)/);
  assert.match(app, /workspaceAdminTabs\.addEventListener\('keydown'/);
  assert.match(app, /function updateWorkspaceAdminPanelTabIndex\(/);
  assert.match(app, /panel\.tabIndex = hasFocusableContent \? -1 : 0/);
  assert.match(html, /Switch between Issues and Members in a project, or sections in Workspace Administration/);
  assert.match(html, /<kbd>Tab<\/kbd><\/dt><dd>Enter the selected tab's section/);
});

test('chat message selection supports navigation, reply, issue creation, and composer focus', () => {
  const chatSelection = { chatMessagesFocused: true, hasSelectedChatMessage: true };
  assert.equal(resolve('j', chatSelection), 'next-chat-message');
  assert.equal(resolve('k', chatSelection), 'previous-chat-message');
  assert.equal(resolve('r', chatSelection), 'reply-to-chat-message');
  assert.equal(resolve('i', chatSelection), 'issue-from-selected-chat-message');
  assert.equal(resolve('Enter', chatSelection), 'focus-chat-composer');
  assert.equal(resolve('r'), null);
});

test('Enter sends chat unless Shift is held or an IME composition is active', () => {
  assert.equal(shouldSendChatOnEnter('Enter', false, false), true);
  assert.equal(shouldSendChatOnEnter('Enter', true, false), false);
  assert.equal(shouldSendChatOnEnter('Enter', false, true), false);
  assert.equal(shouldSendChatOnEnter('a', false, false), false);
});

test('command palette, shortcut help, and contextual hints are present in the workspace UI', () => {
  for (const id of ['command-palette', 'command-search', 'command-results', 'shortcut-help', 'keyboard-hints', 'project-keyboard-hints', 'inbox-view']) {
    assert.ok(html.includes(`id="${id}"`), `${id} is present`);
  }
});
