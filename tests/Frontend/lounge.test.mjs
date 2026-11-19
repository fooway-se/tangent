import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { resolveShortcut } from '../../public/assets/shortcuts.js';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const shortcuts = await readFile(new URL('../../frontend/src/shortcuts.ts', import.meta.url), 'utf8');

test('Lounge is a fixed workspace destination between Inbox and workspace admin', () => {
  const projectsNav = html.indexOf('id="projects-nav"');
  const inboxNav = html.indexOf('id="inbox-nav"');
  const loungeNav = html.indexOf('id="lounge-nav"');
  const adminNav = html.indexOf('id="admin-nav"');

  assert.ok(projectsNav < inboxNav && inboxNav < loungeNav && loungeNav < adminNav);
  assert.match(html, /id="lounge-nav"[^>]*>Lounge<\/button>/);
  assert.match(html, /id="lounge-view"[^>]*hidden/);
  assert.match(app, /function goToLounge\(/);
  assert.match(app, /\/lounge\/messages/);
});

test('Lounge can be opened with the workspace g-l shortcut', () => {
  assert.match(shortcuts, /key === 'l' && context\.hasWorkspace\) return 'lounge'/);
  assert.equal(resolveShortcut({
    key: 'l', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
  }, {
    targetIsEditable: false,
    goPrefixPending: true,
    hasWorkspace: true,
    canSwitchWorkspace: false,
    canAdmin: false,
    hasProject: false,
    projectListVisible: false,
    inboxListVisible: false,
    hasSelectedInboxIssue: false,
    issueFilterFocused: false,
    hasSelectedProject: false,
    issueListVisible: false,
    issueDetailVisible: false,
    hasSelectedIssue: false,
    hasLatestChatMessage: false,
    chatMessagesFocused: false,
    hasSelectedChatMessage: false,
    issueDiscussionMessagesFocused: false,
    hasSelectedIssueDiscussionMessage: false,
    issueGroupFocused: false,
    statusHistoryFocused: false,
    textInputFocused: false,
    modalOpen: false,
    canDismiss: false,
  }), 'lounge');
});
