export type ShortcutAction =
  | 'command-palette'
  | 'shortcut-help'
  | 'await-projects-key'
  | 'projects'
  | 'workspace-switcher'
  | 'issues'
  | 'chat'
  | 'members'
  | 'workspace-admin'
  | 'next-project'
  | 'previous-project'
  | 'first-project'
  | 'last-project'
  | 'open-selected-project'
  | 'first-chat-message'
  | 'last-chat-message'
  | 'page-up'
  | 'page-down'
  | 'next-chat-message'
  | 'previous-chat-message'
  | 'focus-chat-composer'
  | 'reply-to-chat-message'
  | 'issue-from-selected-chat-message'
  | 'next'
  | 'previous'
  | 'first-issue'
  | 'last-issue'
  | 'focus-issue-filter'
  | 'open-selected'
  | 'create-issue'
  | 'edit-selected'
  | 'focus-status'
  | 'issue-from-latest-message'
  | 'blur-text-input'
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
  canAdmin: boolean;
  hasProject: boolean;
  projectListVisible: boolean;
  issueFilterFocused: boolean;
  hasSelectedProject: boolean;
  issueListVisible: boolean;
  issueDetailVisible: boolean;
  hasSelectedIssue: boolean;
  hasLatestChatMessage: boolean;
  chatMessagesFocused: boolean;
  hasSelectedChatMessage: boolean;
  textInputFocused: boolean;
  modalOpen: boolean;
  canDismiss: boolean;
}

export function shouldSubmitOnEnter(key: string, shiftKey: boolean, isComposing: boolean): boolean {
  return key === 'Enter' && !shiftKey && !isComposing;
}

export const shouldSendChatOnEnter = shouldSubmitOnEnter;

export function resolveShortcut(event: ShortcutEvent, context: ShortcutContext): ShortcutAction | null {
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && !event.altKey && key === 'k') return 'command-palette';
  if (event.key === 'Escape') {
    if (context.modalOpen) return 'dismiss';
    if (context.textInputFocused) return 'blur-text-input';
    if (context.canDismiss) return 'dismiss';
  }
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  if (context.issueFilterFocused && context.issueListVisible) {
    if (key === 'arrowdown') return 'first-issue';
    if (key === 'arrowup') return 'last-issue';
  }
  if (context.targetIsEditable) return null;

  if (context.goPrefixPending) {
    if (key === 'p' && context.hasWorkspace) return 'projects';
    if (key === 'w' && context.hasWorkspace) return 'workspace-switcher';
    if (key === 'i' && context.hasProject) return 'issues';
    if (key === 'c' && context.hasProject) return 'chat';
    if (key === 'm' && context.hasProject) return 'members';
    if (key === 'a' && context.canAdmin) return 'workspace-admin';
    return null;
  }
  if (event.key === '?') return 'shortcut-help';
  if (key === 'g' && context.hasWorkspace) return 'await-projects-key';

  if (context.chatMessagesFocused && context.hasSelectedChatMessage) {
    if (key === 'home') return 'first-chat-message';
    if (key === 'end') return 'last-chat-message';
    if (key === 'pageup') return 'page-up';
    if (key === 'pagedown') return 'page-down';
    if (key === 'j' || key === 'arrowdown') return 'next-chat-message';
    if (key === 'k' || key === 'arrowup') return 'previous-chat-message';
    if (event.key === 'Enter') return 'focus-chat-composer';
    if (key === 'r') return 'reply-to-chat-message';
    if (key === 'i') return 'issue-from-selected-chat-message';
  }

  if (context.projectListVisible) {
    if (key === 'home') return 'first-project';
    if (key === 'end') return 'last-project';
    if (key === 'pageup') return 'page-up';
    if (key === 'pagedown') return 'page-down';
    if (key === 'j' || key === 'arrowdown') return 'next-project';
    if (key === 'k' || key === 'arrowup') return 'previous-project';
    if (event.key === 'Enter' && context.hasSelectedProject) return 'open-selected-project';
  }
  if (context.issueListVisible || context.issueDetailVisible) {
    if (!context.chatMessagesFocused && key === 'home') return 'first-issue';
    if (!context.chatMessagesFocused && key === 'end') return 'last-issue';
    if (context.issueListVisible && key === '/') return 'focus-issue-filter';
    if (context.issueListVisible && key === 'pageup') return 'page-up';
    if (context.issueListVisible && key === 'pagedown') return 'page-down';
    if (key === 'j' || key === 'arrowdown') return 'next';
    if (key === 'k' || key === 'arrowup') return 'previous';
    if (event.key === 'Enter' && context.issueListVisible && context.hasSelectedIssue) return 'open-selected';
  }
  if (key === 'c' && context.hasProject) return 'create-issue';
  if (key === 'e' && context.hasSelectedIssue) return 'edit-selected';
  if (key === 's' && context.hasSelectedIssue) return 'focus-status';
  if (key === 'i' && context.hasLatestChatMessage) return 'issue-from-latest-message';
  return null;
}
