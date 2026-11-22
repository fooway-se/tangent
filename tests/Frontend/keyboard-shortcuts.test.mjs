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
  canSwitchWorkspace: true,
  canAdmin: false,
  canRoadmap: true,
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

test('t focuses the theme selector from any view and stays inactive while typing', () => {
  assert.equal(resolve('t', { hasWorkspace: false }), 'theme-selector');
  assert.equal(resolve('T', { hasWorkspace: true, projectListVisible: true }), 'theme-selector');
  assert.equal(resolve('t', { hasWorkspace: false, targetIsEditable: true }), null);
  assert.match(app, /case 'theme-selector':\s*focusThemeSelector\(\);/);
  assert.match(app, /function focusThemeSelector\(\)[\s\S]*closest\('\[hidden\]'\)[\s\S]*getClientRects\(\)\.length/);
  assert.equal((html.match(/class="theme-select" aria-label="Theme" aria-keyshortcuts="t"/g) ?? []).length, 3);
  assert.match(html, /<dt><kbd>t<\/kbd><\/dt><dd>Focus the theme selector<\/dd>/);
  assert.ok((html.match(/<kbd>t<\/kbd> Theme/g) ?? []).length >= 2);
});

test('workspace shortcuts are unavailable on the sign-in screen', () => {
  assert.equal(resolve('k', { hasWorkspace: false }, { ctrlKey: true }), null);
  assert.equal(resolve('?', { hasWorkspace: false }), null);
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
  assert.equal(resolve('r', { goPrefixPending: true, canRoadmap: true }), 'roadmap');
  assert.equal(resolve('r', { goPrefixPending: true, canRoadmap: false }), null);
  assert.equal(resolve('i', { ...project, goPrefixPending: true }), 'issues');
  assert.equal(resolve('c', { ...project, goPrefixPending: true }), 'chat');
  assert.equal(resolve('m', { ...project, goPrefixPending: true }), 'members');
  assert.equal(resolve('a', { goPrefixPending: true, canAdmin: true }), 'workspace-admin');
  assert.equal(resolve('a', { goPrefixPending: true, canAdmin: false }), null);
});

test('g then w focuses the workspace switcher', () => {
  assert.equal(resolve('w', { goPrefixPending: true, hasWorkspace: true }), 'workspace-switcher');
  assert.equal(resolve('w', { goPrefixPending: true, hasWorkspace: true, canSwitchWorkspace: false }), null);
});

test('the AI prompt dialog participates in modal keyboard handling', () => {
  const context = app.slice(app.indexOf('function shortcutContext'), app.indexOf('function clearGoPrefix'));
  assert.match(context, /modalOpen:[\s\S]*issueAiPromptDialog\.open/);
  const dismiss = app.slice(app.indexOf('function dismissCurrentView'), app.indexOf('function focusIssueQuickAddReturnTarget'));
  assert.match(dismiss, /issueAiPromptDialog\.open[\s\S]*issueAiPromptDialog\.close\(\)/);
  assert.match(app, /issueAiPromptDialog\.addEventListener\('close'/);
  assert.match(app, /commandPalette\.open \|\| clientSummaryDialog\.open \|\| shortcutHelp\.open \|\| issueAiPromptDialog\.open/);
});

test('the generated summary dialog participates in modal keyboard handling', () => {
  const context = app.slice(app.indexOf('function shortcutContext'), app.indexOf('function clearGoPrefix'));
  assert.match(context, /modalOpen:[\s\S]*clientSummaryDialog\.open/);
  const dismiss = app.slice(app.indexOf('function dismissCurrentView'), app.indexOf('function focusIssueQuickAddReturnTarget'));
  assert.match(dismiss, /clientSummaryDialog\.open[\s\S]*closeClientSummaryDialog\(\)/);
  assert.match(app, /clientSummaryDialog\.addEventListener\('close'/);
});

test('Escape from a Workspace Admin field returns to its tab bar for section switching', () => {
  const blurHandler = app.slice(app.indexOf('function blurTextInput'), app.indexOf('function executeShortcut'));
  assert.match(blurHandler, /adminView\.contains\(focused\)/);
  assert.match(blurHandler, /workspaceAdminTabs\.querySelector[\s\S]{0,120}\.focus\(\)/);
  assert.match(app, /workspaceAdminTabs\.addEventListener\('keydown'/);
  assert.match(app, /function updateWorkspaceAdminPanelTabIndex\(/);
  assert.match(app, /panel\.tabIndex = hasFocusableContent \? -1 : 0/);
  assert.match(html, /Switch between My Work tabs and Inbox filters, Issues and Members in a project, or sections in Workspace Administration/);
  assert.match(html, /<kbd>Tab<\/kbd><\/dt><dd>Enter the selected tab's section/);
});

test('Inbox tabs use the same arrow and Home/End navigation as other tab bars', () => {
  const tabs = app.slice(app.indexOf('function renderInboxTabs'), app.indexOf('function selectInboxTab'));
  assert.match(tabs, /button\.tabIndex = tab\.id === inboxTab \? 0 : -1/);
  assert.match(app, /inboxTabsElement\.addEventListener\('keydown'/);
  assert.match(html, /<kbd>Home<\/kbd>\/<kbd>End<\/kbd>[\s\S]*My Work/);
  assert.match(html, /<kbd>←<\/kbd>\/<kbd>→<\/kbd>[\s\S]*My Work tabs and Inbox filters/);
});

test('Escape dismisses the milestone dialog before blurring its focused field', () => {
  assert.equal(resolve('Escape', { modalOpen: true, textInputFocused: true, canDismiss: true }), 'dismiss');
  const context = app.slice(app.indexOf('function shortcutContext'), app.indexOf('function clearGoPrefix'));
  assert.match(context, /modalOpen:[\s\S]*milestoneDeleteConfirmation\.open[\s\S]*milestoneManagerDialog\.open/);
  const dismiss = app.slice(app.indexOf('function dismissCurrentView'), app.indexOf('function handleKeyboardShortcut'));
  assert.ok(dismiss.indexOf('milestoneDeleteConfirmation.open') < dismiss.indexOf('milestoneManagerDialog.open'));
  const closeHandler = app.slice(
    app.indexOf("milestoneManagerDialog.addEventListener('close'"),
    app.indexOf("issuesTabButton.addEventListener('click'", app.indexOf("milestoneManagerDialog.addEventListener('close'")),
  );
  assert.match(closeHandler, /manageMilestonesButton\.focus\(\)/);
});

test('chat message selection supports navigation, reply, issue creation, and composer focus', () => {
  const chatSelection = { chatMessagesFocused: true, hasSelectedChatMessage: true };
  assert.equal(resolve('j', chatSelection), 'next-chat-message');
  assert.equal(resolve('k', chatSelection), 'previous-chat-message');
  assert.equal(resolve('r', chatSelection), 'reply-to-chat-message');
  assert.equal(resolve('i', chatSelection), 'issue-from-selected-chat-message');
  assert.equal(resolve('Enter', chatSelection), 'focus-chat-composer');
  assert.equal(resolve('r'), null);
  assert.match(app, /chatMessagesFocused:[\s\S]{0,100}target\.closest\('\.chat-message'\)/);
  assert.match(app, /item\.addEventListener\('focusin', \(\) => selectChatMessage\(message\.id, false\)\)/);
  assert.match(app, /aria-keyshortcuts', 'j k ArrowUp ArrowDown Home End PageUp PageDown Enter r i'/);
});

test('issue discussion messages use the chat navigation, reply, and composer shortcuts', () => {
  const discussionSelection = {
    issueDiscussionMessagesFocused: true,
    hasSelectedIssueDiscussionMessage: true,
    issueDetailVisible: true,
    hasSelectedIssue: true,
  };
  assert.equal(resolve('j', discussionSelection), 'next-issue-discussion-message');
  assert.equal(resolve('ArrowDown', discussionSelection), 'next-issue-discussion-message');
  assert.equal(resolve('k', discussionSelection), 'previous-issue-discussion-message');
  assert.equal(resolve('ArrowUp', discussionSelection), 'previous-issue-discussion-message');
  assert.equal(resolve('Home', discussionSelection), 'first-issue-discussion-message');
  assert.equal(resolve('End', discussionSelection), 'last-issue-discussion-message');
  assert.equal(resolve('PageUp', discussionSelection), 'page-up');
  assert.equal(resolve('PageDown', discussionSelection), 'page-down');
  assert.equal(resolve('Enter', discussionSelection), 'focus-issue-discussion-composer');
  assert.equal(resolve('r', discussionSelection), 'reply-to-issue-discussion-message');
  assert.match(app, /issueDiscussionMessagesFocused:[\s\S]{0,100}closest\('\.issue-discussion-message'\)/);
  assert.match(app, /case 'next-issue-discussion-message': moveIssueDiscussionSelection\(1\)/);
  assert.match(app, /function moveIssueDiscussionSelectionByPage\(/);
  assert.match(app, /function replyToSelectedIssueDiscussionMessage\(/);
  assert.match(app, /item\.addEventListener\('focusin', \(\) => selectIssueDiscussionMessage/);
  const blurHandler = app.slice(app.indexOf('function blurTextInput'), app.indexOf('function executeShortcut'));
  assert.match(blurHandler, /focused === issueDiscussionInput/);
  assert.match(blurHandler, /issueDiscussionHeading\.focus\(\)/);
  assert.match(html, /id="issue-discussion-heading"[^>]*tabindex="-1"/);
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
  assert.match(html, /Delete[\s\S]*Delete a milestone from Project milestones/);
  assert.equal((html.match(/<dt><kbd>Esc<\/kbd><\/dt>/g) ?? []).length, 1, 'Escape guidance has one authoritative entry');
  assert.doesNotMatch(html, /Move through selected chat messages/);
  assert.match(html, /admin-go-prefix-option/);
  assert.match(app, /goPrefixWorkspaceOption\.hidden = activeWorkspaces\.length < 2/);
  assert.match(app, /goPrefixProjectOptions\.hidden = activeProject === null \|\| projectView\.hidden/);
  assert.match(app, /adminGoPrefixOption\.hidden = activeUser\?\.role !== 'admin'/);
  assert.match(app, /workspaceSwitcher\.disabled = activeWorkspaces\.length < 2/);
  assert.match(app, /function openWorkspacePicker[\s\S]{0,120}activeWorkspaces\.length < 2/);
  const commands = app.slice(app.indexOf('function getPaletteCommands'), app.indexOf('function renderCommandResults'));
  assert.ok(commands.indexOf("label: 'Workspace admin'") < commands.indexOf('if (activeProject !== null)'), 'workspace admin command is available outside projects');
  assert.match(commands, /if \(activeWorkspaces\.length > 1\)/);
});
