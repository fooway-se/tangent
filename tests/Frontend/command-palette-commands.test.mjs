import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPaletteCommands } from '../../public/assets/command-palette-commands.js';

const actions = Object.fromEntries([
  'goToProjects', 'goToInbox', 'goToLounge', 'showShortcutHelp', 'toggleKeyboardHints',
  'goToRoadmap', 'switchWorkspace', 'openWorkspaceAdmin', 'newProject', 'createWorkspace',
  'generateSummary', 'previewGuestView', 'goToProjectIssues', 'focusProjectChat',
  'toggleProjectChat',
  'goToProjectMembers', 'goToProjectNotes', 'beginCreateIssue', 'editSelectedIssue',
  'focusSelectedIssueStatus', 'deleteIssue', 'createIssueFromSelectedChatMessage',
  'showDeletedIssues', 'switchTheme', 'signOut',
].map((name) => [name, (...args) => calls.push([name, ...args])]));
const calls = [];

function baseOptions(overrides = {}) {
  return {
    user: { id: 1, workspace_id: 1, name: 'Admin', email: 'admin@example.com', role: 'admin' },
    keyboardHintsVisible: false,
    workspaceVisible: true,
    activeWorkspaces: [],
    projectsViewVisible: false,
    projectViewVisible: false,
    projectChatVisible: true,
    activeProject: null,
    hasSelectedIssueInVisibleView: false,
    selectedIssueInVisibleView: null,
    hasLatestChatIssue: false,
    deletedProjectIssues: [],
    currentThemeLabel: 'Light',
    nextThemeLabel: 'Dark',
    issueStatusLabel: (status) => status,
    actions,
    ...overrides,
  };
}

test('palette command builder hides authenticated commands when signed out', () => {
  assert.deepEqual(buildPaletteCommands(baseOptions({ user: null })), []);
});

test('palette command builder applies role, workspace, and project context', () => {
  const project = { id: 7, name: 'Tangent', status: 'active' };
  const selectedIssue = { id: 42, title: 'Ship it', status: 'doing' };
  const deletedIssue = { id: 9, title: 'Old work', status: 'done' };
  const commands = buildPaletteCommands(baseOptions({
    activeWorkspaces: [
      { id: 1, name: 'Current', role: 'admin' },
      { id: 2, name: 'Studio', role: 'developer' },
    ],
    projectsViewVisible: true,
    projectViewVisible: true,
    activeProject: project,
    hasSelectedIssueInVisibleView: true,
    selectedIssueInVisibleView: selectedIssue,
    hasLatestChatIssue: true,
    deletedProjectIssues: [deletedIssue],
  }));
  const labels = commands.map(({ label }) => label);
  const command = (label) => commands.find((item) => item.label === label);

  assert.ok(labels.includes('Open Roadmap'));
  assert.ok(labels.includes('New project'));
  assert.ok(labels.includes('Workspace admin'));
  assert.ok(labels.includes('Create workspace'));
  assert.ok(labels.includes('Switch to Studio'));
  assert.ok(labels.includes('Generate summary'));
  assert.ok(labels.includes('Preview guest view'));
  assert.ok(labels.includes('New issue'));
  assert.ok(labels.includes('Edit selected issue'));
  assert.ok(labels.includes('Delete issue'));
  assert.ok(labels.includes('Create issue from selected chat message'));
  assert.ok(labels.includes('Hide project chat'));
  assert.ok(labels.includes('Restore issue: Old work'));
  assert.match(command('Delete issue').detail, /Ship it.*doing/);
  assert.match(command('Switch theme').detail, /Now Light; next Dark/);

  calls.length = 0;
  command('Switch to Studio').run();
  command('Delete issue').run();
  command('Restore issue: Old work').run();
  command('Hide project chat').run();
  assert.deepEqual(calls, [
    ['switchWorkspace', 2],
    ['deleteIssue', selectedIssue],
    ['showDeletedIssues', deletedIssue.id],
    ['toggleProjectChat'],
  ]);
});

test('project chat palette command reflects whether the panel is visible', () => {
  const project = { id: 7, name: 'Tangent', status: 'active' };
  const shownCommands = buildPaletteCommands(baseOptions({
    projectViewVisible: true,
    activeProject: project,
    projectChatVisible: true,
  }));
  const hiddenCommands = buildPaletteCommands(baseOptions({
    projectViewVisible: true,
    activeProject: project,
    projectChatVisible: false,
  }));
  assert.equal(shownCommands.find(({ label }) => label === 'Hide project chat')?.shortcut, 'b');
  assert.equal(hiddenCommands.find(({ label }) => label === 'Show project chat')?.shortcut, 'b');
  assert.ok(!buildPaletteCommands(baseOptions({ activeProject: project }))
    .some(({ label }) => label.includes('project chat')));
});

test('guest palette only offers actions available in the guest shell', () => {
  const commands = buildPaletteCommands(baseOptions({
    user: { id: 3, workspace_id: 1, name: 'Guest', email: 'guest@example.com', role: 'guest' },
    activeWorkspaces: [
      { id: 1, name: 'Current', role: 'guest' },
      { id: 2, name: 'Next', role: 'guest' },
    ],
    activeProject: { id: 8, name: 'Client project' },
  }));
  const labels = commands.map(({ label }) => label);

  assert.ok(labels.includes('Switch workspace'));
  assert.ok(labels.includes('Switch theme'));
  assert.ok(labels.includes('Sign out'));
  assert.ok(!labels.includes('Go to Projects'));
  assert.ok(!labels.includes('Open My Work'));
  assert.ok(!labels.includes('Open Lounge'));
  assert.ok(!labels.includes('Show keyboard shortcuts'));
  assert.ok(!labels.includes('Show keyboard hints'));
  assert.ok(!labels.includes('Open Roadmap'));
  assert.ok(!labels.includes('Workspace admin'));
});

test('workspace members can open Roadmap from the command palette', () => {
  const commands = buildPaletteCommands(baseOptions({
    user: { id: 5, workspace_id: 1, name: 'Morgan', email: 'morgan@example.com', role: 'developer' },
  }));
  const roadmap = commands.find(({ label }) => label === 'Open Roadmap');

  assert.equal(roadmap?.shortcut, 'g r');
});
