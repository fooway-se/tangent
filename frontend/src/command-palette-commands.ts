import type { PaletteCommand } from './command-palette-ui.js';
import type { Issue, Project, User, Workspace } from './types.js';

export interface PaletteCommandActions {
  goToProjects: () => void;
  goToInbox: () => void;
  goToLounge: () => void;
  showShortcutHelp: () => void;
  toggleKeyboardHints: () => void;
  toggleProjectChat: () => void;
  goToRoadmap: () => void;
  switchWorkspace: (workspaceId?: number) => void;
  openWorkspaceAdmin: () => void;
  newProject: () => void;
  createWorkspace: () => void;
  generateSummary: () => void;
  previewGuestView: () => void;
  goToProjectIssues: () => void;
  focusProjectChat: () => void;
  goToProjectMembers: () => void;
  goToProjectNotes: () => void;
  beginCreateIssue: () => void;
  editSelectedIssue: () => void;
  focusSelectedIssueStatus: () => void;
  deleteIssue: (issue: Issue | null) => void;
  createIssueFromSelectedChatMessage: () => void;
  showDeletedIssues: (issueId?: number) => void;
  switchTheme: () => void;
  signOut: () => void;
}

export interface PaletteCommandContext {
  user: User | null;
  keyboardHintsVisible: boolean;
  workspaceVisible: boolean;
  activeWorkspaces: readonly Workspace[];
  projectsViewVisible: boolean;
  projectViewVisible: boolean;
  projectChatVisible: boolean;
  activeProject: Project | null;
  hasSelectedIssueInVisibleView: boolean;
  selectedIssueInVisibleView: Issue | null;
  hasLatestChatIssue: boolean;
  deletedProjectIssues: readonly Issue[];
  currentThemeLabel: string;
  nextThemeLabel: string;
  issueStatusLabel: (status: Issue['status']) => string;
  actions: PaletteCommandActions;
}

export function buildPaletteCommands(context: PaletteCommandContext): PaletteCommand[] {
  const { user, actions } = context;
  if (user === null) return [];

  if (user.role === 'guest') {
    const guestCommands: PaletteCommand[] = [];
    if (context.activeWorkspaces.length > 1) {
      guestCommands.push({
        label: 'Switch workspace',
        detail: 'Choose a workspace; Enter switches, Escape cancels',
        shortcut: 'g w',
        run: () => actions.switchWorkspace(),
      });
    }
    guestCommands.push(
      {
        label: 'Switch theme',
        detail: `Now ${context.currentThemeLabel}; next ${context.nextThemeLabel}`,
        shortcut: '',
        run: actions.switchTheme,
      },
      {
        label: 'Sign out',
        detail: 'Sign out of Tangent',
        shortcut: '',
        run: actions.signOut,
      },
    );
    return guestCommands;
  }

  const commands: PaletteCommand[] = [
    { label: 'Go to Projects', detail: 'Open the project list', shortcut: 'g p', run: actions.goToProjects },
    { label: 'Open My Work', detail: 'Review inbox updates and tasks assigned to you', shortcut: 'g n', run: actions.goToInbox },
    { label: 'Open Lounge', detail: 'Open the workspace-wide Lounge chat', shortcut: 'g l', run: actions.goToLounge },
    { label: 'Show keyboard shortcuts', detail: 'View key bindings', shortcut: '?', run: actions.showShortcutHelp },
  ];
  if (context.workspaceVisible) {
    commands.push({
      label: context.keyboardHintsVisible ? 'Hide keyboard hints' : 'Show keyboard hints',
      detail: context.keyboardHintsVisible
        ? 'Hide the shortcut hints along the bottom of the workspace'
        : 'Show the shortcut hints along the bottom of the workspace',
      shortcut: 'h',
      run: actions.toggleKeyboardHints,
    });
  }
  commands.splice(1, 0, {
    label: 'Open Roadmap',
    detail: 'Review milestones across your projects',
    shortcut: 'g r',
    run: actions.goToRoadmap,
  });
  if (context.activeWorkspaces.length > 1) {
    commands.splice(2, 0, {
      label: 'Switch workspace',
      detail: 'Choose a workspace; Enter switches, Escape cancels',
      shortcut: 'g w',
      run: () => actions.switchWorkspace(),
    });
    for (const workspace of context.activeWorkspaces) {
      if (workspace.id === user.workspace_id) continue;
      commands.splice(1, 0, {
        label: `Switch to ${workspace.name}`,
        detail: `Review and confirm switching to ${workspace.name}`,
        shortcut: '',
        run: () => actions.switchWorkspace(workspace.id),
      });
    }
  }
  if (user.role === 'admin' && context.projectsViewVisible) {
    commands.unshift({
      label: 'New project',
      detail: 'Create a project in this workspace',
      shortcut: '',
      run: actions.newProject,
    });
  }
  if (user.role === 'admin') {
    commands.unshift({
      label: 'Workspace admin',
      detail: 'Open workspace administration',
      shortcut: 'g a',
      run: actions.openWorkspaceAdmin,
    });
    commands.unshift({
      label: 'Create workspace',
      detail: 'Create a workspace for a separate organization',
      shortcut: '',
      run: actions.createWorkspace,
    });
  }
  if (context.activeProject !== null && user.role === 'admin' && context.projectViewVisible) {
    commands.splice(1, 0, {
      label: 'Generate summary',
      detail: `Prepare a client-safe summary for ${context.activeProject.name}`,
      shortcut: '',
      run: actions.generateSummary,
    }, {
      label: 'Preview guest view',
      detail: `Preview the client portal for ${context.activeProject.name}`,
      shortcut: '',
      run: actions.previewGuestView,
    });
  }
  if (context.activeProject !== null) {
    if (context.projectViewVisible) {
      commands.splice(1, 0, {
        label: context.projectChatVisible ? 'Hide project chat' : 'Show project chat',
        detail: context.projectChatVisible ? 'Hide the project chat panel' : 'Show the project chat panel',
        shortcut: 'b',
        run: actions.toggleProjectChat,
      });
    }
    commands.splice(1, 0,
      {
        label: 'Project issues',
        detail: `Focus issues in ${context.activeProject.name}`,
        shortcut: 'g i',
        run: actions.goToProjectIssues,
      },
      {
        label: 'Project chat',
        detail: 'Focus the latest project chat message or composer',
        shortcut: 'g c',
        run: actions.focusProjectChat,
      },
      {
        label: 'Project members',
        detail: `Focus members in ${context.activeProject.name}`,
        shortcut: 'g m',
        run: actions.goToProjectMembers,
      },
      {
        label: 'Project notes',
        detail: `Open notes for ${context.activeProject.name}`,
        shortcut: '',
        run: actions.goToProjectNotes,
      },
    );
    commands.splice(1, 0, {
      label: 'New issue',
      detail: `Create an issue in ${context.activeProject.name}`,
      shortcut: 'c',
      run: actions.beginCreateIssue,
    });
    if (context.hasSelectedIssueInVisibleView) {
      const issue = context.selectedIssueInVisibleView;
      commands.splice(2, 0, {
        label: 'Edit selected issue',
        detail: 'Edit the title and description',
        shortcut: 'e',
        run: actions.editSelectedIssue,
      }, {
        label: 'Change issue status',
        detail: 'Choose a status, then save or cancel',
        shortcut: 's',
        run: actions.focusSelectedIssueStatus,
      }, {
        label: 'Delete issue',
        detail: issue === null
          ? 'Move the selected issue to Deleted issues; it can be restored later'
          : `Move “${issue.title}” (${context.issueStatusLabel(issue.status)}) to Deleted issues; it can be restored later`,
        shortcut: '',
        run: () => actions.deleteIssue(issue),
      });
    }
    if (context.hasLatestChatIssue) {
      commands.splice(1, 0, {
        label: 'Create issue from selected chat message',
        detail: 'Use the selected message, or the latest message',
        shortcut: 'i',
        run: actions.createIssueFromSelectedChatMessage,
      });
    }
    if (context.deletedProjectIssues.length > 0) {
      commands.push({
        label: 'Show deleted issues',
        detail: `Jump to ${context.deletedProjectIssues.length} deleted issue${context.deletedProjectIssues.length === 1 ? '' : 's'} in ${context.activeProject.name}`,
        shortcut: '',
        run: () => actions.showDeletedIssues(),
      });
      for (const issue of context.deletedProjectIssues) {
        commands.push({
          label: `Restore issue: ${issue.title}`,
          detail: `Restore it with its previous status (${context.issueStatusLabel(issue.status)})`,
          shortcut: '',
          run: () => actions.showDeletedIssues(issue.id),
        });
      }
    }
  }
  commands.push({
    label: 'Switch theme',
    detail: `Now ${context.currentThemeLabel}; next ${context.nextThemeLabel}`,
    shortcut: '',
    run: actions.switchTheme,
  });
  commands.push({
    label: 'Sign out',
    detail: 'Sign out of Tangent',
    shortcut: '',
    run: actions.signOut,
  });
  return commands;
}
