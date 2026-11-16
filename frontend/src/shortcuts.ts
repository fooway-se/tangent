export type ShortcutAction =
  | 'command-palette'
  | 'shortcut-help'
  | 'await-projects-key'
  | 'projects'
  | 'next-project'
  | 'previous-project'
  | 'open-selected-project'
  | 'next'
  | 'previous'
  | 'open-selected'
  | 'create-issue'
  | 'edit-selected'
  | 'focus-status'
  | 'issue-from-latest-message'
  | 'dismiss';

export interface ShortcutEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export interface ShortcutContext {
  targetIsEditable: boolean;
  goPrefixPending: boolean;
  hasWorkspace: boolean;
  hasProject: boolean;
  projectListVisible: boolean;
  hasSelectedProject: boolean;
  issueListVisible: boolean;
  issueDetailVisible: boolean;
  hasSelectedIssue: boolean;
  hasLatestChatMessage: boolean;
  canDismiss: boolean;
}

export function resolveShortcut(event: ShortcutEvent, context: ShortcutContext): ShortcutAction | null {
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && !event.altKey && key === 'k') return 'command-palette';
  if (event.key === 'Escape' && context.canDismiss) return 'dismiss';
  if (event.altKey || event.ctrlKey || event.metaKey || context.targetIsEditable) return null;

  if (context.goPrefixPending) {
    return key === 'p' && context.hasWorkspace ? 'projects' : null;
  }
  if (event.key === '?') return 'shortcut-help';
  if (key === 'g' && context.hasWorkspace) return 'await-projects-key';

  if (context.projectListVisible) {
    if (key === 'j') return 'next-project';
    if (key === 'k') return 'previous-project';
    if (event.key === 'Enter' && context.hasSelectedProject) return 'open-selected-project';
  }
  if (context.issueListVisible || context.issueDetailVisible) {
    if (key === 'j') return 'next';
    if (key === 'k') return 'previous';
    if (event.key === 'Enter' && context.issueListVisible && context.hasSelectedIssue) return 'open-selected';
  }
  if (key === 'c' && context.hasProject) return 'create-issue';
  if (key === 'e' && context.hasSelectedIssue) return 'edit-selected';
  if (key === 's' && context.hasSelectedIssue) return 'focus-status';
  if (key === 'i' && context.hasLatestChatMessage) return 'issue-from-latest-message';
  return null;
}
