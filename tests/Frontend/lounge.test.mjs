import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { resolveShortcut } from '../../public/assets/shortcuts.js';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const loungeChatUi = await readFile(new URL('../../frontend/src/lounge-chat-ui.ts', import.meta.url), 'utf8');
const mentionsUi = await readFile(new URL('../../frontend/src/chat-mentions-ui.ts', import.meta.url), 'utf8');
const css = await readFile(new URL('../../public/assets/app.css', import.meta.url), 'utf8');
const shortcuts = await readFile(new URL('../../frontend/src/shortcuts.ts', import.meta.url), 'utf8');
const presence = await readFile(new URL('../../frontend/src/lounge-presence.ts', import.meta.url), 'utf8');

test('Lounge is a fixed workspace destination between Inbox and workspace admin', () => {
  const projectsNav = html.indexOf('id="projects-nav"');
  const inboxNav = html.indexOf('id="inbox-nav"');
  const loungeNav = html.indexOf('id="lounge-nav"');
  const adminNav = html.indexOf('id="admin-nav"');

  assert.ok(projectsNav < inboxNav && inboxNav < loungeNav && loungeNav < adminNav);
  assert.match(html, /id="lounge-nav"[^>]*>[\s\S]*Lounge[\s\S]*<\/button>/);
  assert.match(html, /id="lounge-nav-presence"/);
  assert.match(html, /id="lounge-view"[^>]*hidden/);
  assert.match(app, /function goToLounge\(/);
  assert.match(loungeChatUi, /\/lounge\/messages/);
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

test('Lounge composer uses the project chat mention autocomplete for workspace members', () => {
  assert.match(html, /id="lounge-mention-suggestions"[^>]*role="listbox"/);
  assert.match(loungeChatUi, /function updateMentionSuggestions\(/);
  assert.match(loungeChatUi, /request<\{ members: LoungeMentionMember\[\] \}>\('\/lounge\/members'\)/);
  assert.match(loungeChatUi, /filterMentionMembers\(members, query\.query/);
  assert.match(loungeChatUi, /replaceMentionQuery\(loungeInput\.value, mentionQuery, member\.name\)/);
  assert.match(loungeChatUi, /function handleMentionKeydown\(/);
  assert.match(loungeChatUi, /handleMentionKeydownUi\([\s\S]{0,100}event,\s*loungeInput,\s*loungeMentionList/);
  assert.match(app, /return handleMentionKeydown\([\s\S]{0,80}event,\s*chatInput,\s*chatMentionList/);
  assert.match(loungeChatUi, /splitMentions\(message\.body, members\)/);
  assert.match(loungeChatUi, /chat-message-mention/);
  assert.match(mentionsUi, /event\.key === 'ArrowDown'/);
});

test('Lounge shows the names of teammates who are currently present', () => {
  assert.match(html, /id="lounge-presence"[^>]*role="status"/);
  assert.match(presence, /function renderLoungePresence\(/);
  assert.match(presence, /className = 'lounge-presence-person'/);
  assert.match(presence, /request<\{ members: LoungePresenceMember\[\] \}>\('\/lounge\/presence'/);
  assert.match(presence, /const POLL_INTERVAL_MS = 15_000/);
  assert.match(app, /loungePresenceUi\.pollLoungePresence\(\)/);
});

test('Lounge messages use relative calendar days in their timestamps', () => {
  assert.match(loungeChatUi, /import \{ formatChatTimestamp \} from '\.\/chat-time\.js'/);
  assert.match(loungeChatUi, /time\.textContent = formatChatTimestamp\(message\.created_at\)/);
});

test('Lounge messages can be replied to and the selected parent is sent with the reply', () => {
  const append = loungeChatUi.slice(loungeChatUi.indexOf('function appendMessage('), loungeChatUi.indexOf('async function loadNow('));

  assert.match(append, /message\.parent_id === null \? 'chat-message' : 'chat-message chat-reply'/);
  assert.match(append, /textContent = 'Reply'/);
  assert.match(append, /setReplyParent\(message\)/);
  assert.match(append, /chat-reply-context/);
  assert.match(loungeChatUi, /function setReplyParent\(/);
  assert.match(loungeChatUi, /if \(replyParent !== null\) messageBody\.parent_id = replyParent\.id/);
  assert.match(loungeChatUi, /JSON\.stringify\(messageBody\)/);
  assert.match(html, /id="lounge-reply-hint"/);
  assert.match(html, /id="lounge-cancel-reply"/);
});

test('Lounge presence stays visible in navigation without adding the viewer to presence', () => {
  assert.match(presence, /async function pollWorkspacePresence\(/);
  assert.match(presence, /request<\{ members: LoungePresenceMember\[\] \}>\('\/lounge\/presence'\)/);
  assert.match(presence, /function renderNavigationPresence\(/);
  assert.match(presence, /loungeNavPresenceBadge/);
  assert.match(presence, /member\.id !== options\.getUser\(\)\?\.id/);
});

test('Lounge presence indicator matches the Lounge button label color', () => {
  assert.match(css, /\.lounge-nav-presence \{[^}]*color: var\(--case-ink\)/);
  assert.match(css, /\.lounge-nav-presence::before \{[^}]*background: currentColor; box-shadow: none/);
  assert.match(css, /#lounge-nav\.is-active #lounge-nav-presence \{ color: var\(--accent-ink\); \}/);
});
