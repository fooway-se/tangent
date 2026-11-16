import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { resolveShortcut } from '../../public/assets/shortcuts.js';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const baseContext = {
  targetIsEditable: false,
  goPrefixPending: false,
  hasWorkspace: true,
  hasProject: false,
  projectListVisible: false,
  hasSelectedProject: false,
  issueListVisible: false,
  issueDetailVisible: false,
  hasSelectedIssue: false,
  hasLatestChatMessage: false,
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

test('project list uses the same j, k, Enter navigation pattern', () => {
  const projects = { projectListVisible: true, hasSelectedProject: true };
  assert.equal(resolve('j', projects), 'next-project');
  assert.equal(resolve('k', projects), 'previous-project');
  assert.equal(resolve('Enter', projects), 'open-selected-project');
  assert.equal(resolve('Enter', { projectListVisible: true }), null);
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

test('command palette, shortcut help, and contextual hints are present in the workspace UI', () => {
  for (const id of ['command-palette', 'command-search', 'command-results', 'shortcut-help', 'keyboard-hints', 'project-keyboard-hints']) {
    assert.ok(html.includes(`id="${id}"`), `${id} is present`);
  }
});
