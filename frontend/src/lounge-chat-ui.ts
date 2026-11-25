import { ApiFailure, api, apiBaseUrl } from './api.js';
import { bindRealtimePolling, shouldUsePolling } from './realtime-polling.js';
import type { RealtimeUpdates } from './realtime-transport.js';
import {
  filterMentionMembers,
  findMentionQuery,
  mentionEmptyMessage,
  replaceMentionQuery,
  splitMentions,
  type MentionMember,
  type MentionQuery,
} from './chat-mentions.js';
import { handleMentionKeydown as handleMentionKeydownUi } from './chat-mentions-ui.js';
import { splitChatSmilies, type ChatSmileyIcon } from './chat-smilies.js';
import { formatChatTimestamp } from './chat-time.js';
import type { LoungePresenceController } from './lounge-presence.js';
import type { ChatMessage, LoungeMentionMember } from './types.js';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

const smileyLabels: Readonly<Record<ChatSmileyIcon, string>> = {
  smile: 'smile',
  wink: 'wink',
  frown: 'frown',
  grin: 'grin',
  tongue: 'tongue out',
  neutral: 'neutral face',
  surprised: 'surprised face',
  uncertain: 'uncertain face',
  crying: 'crying face',
  angry: 'angry face',
  coffee: 'coffee',
  beer: 'beer mug',
  pizza: 'pizza slice',
  burger: 'burger',
};

const smileyShapes: Readonly<Record<ChatSmileyIcon, readonly {
  tag: 'circle' | 'path';
  attributes: Readonly<Record<string, string>>;
}[]>> = {
  smile: [
    { tag: 'circle', attributes: { cx: '12', cy: '12', r: '10.5', class: 'chat-smiley-outline' } },
    { tag: 'circle', attributes: { cx: '8.3', cy: '9', r: '1.35', class: 'chat-smiley-dot' } },
    { tag: 'circle', attributes: { cx: '15.7', cy: '9', r: '1.35', class: 'chat-smiley-dot' } },
    { tag: 'path', attributes: { d: 'M7 14.5 Q12 19.5 17 14.5', class: 'chat-smiley-feature' } },
  ],
  wink: [
    { tag: 'circle', attributes: { cx: '12', cy: '12', r: '10.5', class: 'chat-smiley-outline' } },
    { tag: 'path', attributes: { d: 'M7 9h3', class: 'chat-smiley-feature' } },
    { tag: 'circle', attributes: { cx: '15.7', cy: '9', r: '1.35', class: 'chat-smiley-dot' } },
    { tag: 'path', attributes: { d: 'M7 14.5 Q12 19.5 17 14.5', class: 'chat-smiley-feature' } },
  ],
  frown: [
    { tag: 'circle', attributes: { cx: '12', cy: '12', r: '10.5', class: 'chat-smiley-outline' } },
    { tag: 'circle', attributes: { cx: '8.3', cy: '9', r: '1.35', class: 'chat-smiley-dot' } },
    { tag: 'circle', attributes: { cx: '15.7', cy: '9', r: '1.35', class: 'chat-smiley-dot' } },
    { tag: 'path', attributes: { d: 'M7 17.5 Q12 12.5 17 17.5', class: 'chat-smiley-feature' } },
  ],
  grin: [
    { tag: 'circle', attributes: { cx: '12', cy: '12', r: '10.5', class: 'chat-smiley-outline' } },
    { tag: 'circle', attributes: { cx: '8.3', cy: '9', r: '1.35', class: 'chat-smiley-dot' } },
    { tag: 'circle', attributes: { cx: '15.7', cy: '9', r: '1.35', class: 'chat-smiley-dot' } },
    { tag: 'path', attributes: { d: 'M6.5 13.8h11v1.7a5.5 5.5 0 0 1-11 0z', class: 'chat-smiley-mouth' } },
  ],
  tongue: [
    { tag: 'circle', attributes: { cx: '12', cy: '12', r: '10.5', class: 'chat-smiley-outline' } },
    { tag: 'circle', attributes: { cx: '8.3', cy: '9', r: '1.35', class: 'chat-smiley-dot' } },
    { tag: 'circle', attributes: { cx: '15.7', cy: '9', r: '1.35', class: 'chat-smiley-dot' } },
    { tag: 'path', attributes: { d: 'M6.5 13.8h11v1.6a5.5 5.5 0 0 1-11 0z', class: 'chat-smiley-mouth' } },
    { tag: 'path', attributes: { d: 'M10 15.4h4v3.6a2 2 0 0 1-4 0z', class: 'chat-smiley-tongue' } },
  ],
  neutral: [
    { tag: 'circle', attributes: { cx: '12', cy: '12', r: '10.5', class: 'chat-smiley-outline' } },
    { tag: 'circle', attributes: { cx: '8.3', cy: '9', r: '1.35', class: 'chat-smiley-dot' } },
    { tag: 'circle', attributes: { cx: '15.7', cy: '9', r: '1.35', class: 'chat-smiley-dot' } },
    { tag: 'path', attributes: { d: 'M7.5 15.5h9', class: 'chat-smiley-feature' } },
  ],
  surprised: [
    { tag: 'circle', attributes: { cx: '12', cy: '12', r: '10.5', class: 'chat-smiley-outline' } },
    { tag: 'circle', attributes: { cx: '8.3', cy: '9', r: '1.45', class: 'chat-smiley-dot' } },
    { tag: 'circle', attributes: { cx: '15.7', cy: '9', r: '1.45', class: 'chat-smiley-dot' } },
    { tag: 'circle', attributes: { cx: '12', cy: '15.5', r: '2', class: 'chat-smiley-mouth' } },
  ],
  uncertain: [
    { tag: 'circle', attributes: { cx: '12', cy: '12', r: '10.5', class: 'chat-smiley-outline' } },
    { tag: 'circle', attributes: { cx: '8.3', cy: '9', r: '1.35', class: 'chat-smiley-dot' } },
    { tag: 'circle', attributes: { cx: '15.7', cy: '9', r: '1.35', class: 'chat-smiley-dot' } },
    { tag: 'path', attributes: { d: 'M7 15.2 Q11 13.8 17 15.8', class: 'chat-smiley-feature' } },
  ],
  crying: [
    { tag: 'circle', attributes: { cx: '12', cy: '12', r: '10.5', class: 'chat-smiley-outline' } },
    { tag: 'circle', attributes: { cx: '8.3', cy: '9', r: '1.35', class: 'chat-smiley-dot' } },
    { tag: 'circle', attributes: { cx: '15.7', cy: '9', r: '1.35', class: 'chat-smiley-dot' } },
    { tag: 'path', attributes: { d: 'M7 17.5 Q12 12.5 17 17.5', class: 'chat-smiley-feature' } },
    { tag: 'path', attributes: { d: 'M15.7 11.2c-1 1.4-1.7 2.1-1.7 3.1a1.7 1.7 0 0 0 3.4 0c0-1-.7-1.7-1.7-3.1z', class: 'chat-smiley-tear' } },
  ],
  angry: [
    { tag: 'circle', attributes: { cx: '12', cy: '12', r: '10.5', class: 'chat-smiley-outline' } },
    { tag: 'path', attributes: { d: 'M6.8 7.5 10 9m7.2-1.5L14 9', class: 'chat-smiley-feature' } },
    { tag: 'circle', attributes: { cx: '8.5', cy: '10.5', r: '1.3', class: 'chat-smiley-dot' } },
    { tag: 'circle', attributes: { cx: '15.5', cy: '10.5', r: '1.3', class: 'chat-smiley-dot' } },
    { tag: 'path', attributes: { d: 'M7 17.5 Q12 13 17 17.5', class: 'chat-smiley-feature' } },
  ],
  coffee: [
    { tag: 'path', attributes: { d: 'M7 2.5c-1.7 1.6 1.7 2.2 0 4m5-4c-1.7 1.6 1.7 2.2 0 4m5-4c-1.7 1.6 1.7 2.2 0 4', class: 'chat-smiley-icon-detail' } },
    { tag: 'path', attributes: { d: 'M4 8h13v9.5a2.5 2.5 0 0 1-2.5 2.5h-8A2.5 2.5 0 0 1 4 17.5z', class: 'chat-smiley-icon-line' } },
    { tag: 'path', attributes: { d: 'M5.3 9.2h10.4v2H5.3z', class: 'chat-smiley-coffee-surface' } },
    { tag: 'path', attributes: { d: 'M17 10h1.2a2.7 2.7 0 0 1 0 5.4H17', class: 'chat-smiley-icon-line' } },
    { tag: 'path', attributes: { d: 'M2.5 21h19', class: 'chat-smiley-icon-detail' } },
  ],
  beer: [
    { tag: 'path', attributes: { d: 'M4 7.5h13.5v12A2.5 2.5 0 0 1 15 22H6.5A2.5 2.5 0 0 1 4 19.5z', class: 'chat-smiley-icon-line' } },
    { tag: 'path', attributes: { d: 'M5.4 12h10.7v7.2H5.4z', class: 'chat-smiley-beer-fill' } },
    { tag: 'path', attributes: { d: 'M4 8c-1.5-.4-1.4-2.3.1-2.6.5-2.5 3.8-2.9 5.1-.7 1.2-2 4.2-1.8 5.1.4 2-1.6 4.2-.5 4.2 1.4 1.5.4 1.2 2.3-.2 2.6H5.2C4.6 9.1 4.2 8.7 4 8z', class: 'chat-smiley-foam' } },
    { tag: 'path', attributes: { d: 'M17.5 10h1.2a2.8 2.8 0 0 1 0 5.6h-1.2', class: 'chat-smiley-icon-line' } },
    { tag: 'path', attributes: { d: 'M7 13v5m4-5v5', class: 'chat-smiley-icon-detail' } },
  ],
  pizza: [
    { tag: 'path', attributes: { d: 'M3 21 9 2.5 21 21z', class: 'chat-smiley-icon-line' } },
    { tag: 'path', attributes: { d: 'M4.2 17.4 6.2 18.5 19.1 18.5 20.1 17.3 21 21H3z', class: 'chat-smiley-pizza-crust' } },
    { tag: 'circle', attributes: { cx: '10.2', cy: '9.4', r: '1.8', class: 'chat-smiley-pizza-topping' } },
    { tag: 'circle', attributes: { cx: '14.7', cy: '14.8', r: '1.8', class: 'chat-smiley-pizza-topping' } },
    { tag: 'circle', attributes: { cx: '8', cy: '14.3', r: '1.5', class: 'chat-smiley-pizza-topping' } },
  ],
  burger: [
    { tag: 'path', attributes: { d: 'M3 10a9 7 0 0 1 18 0v1H3z', class: 'chat-smiley-icon-line' } },
    { tag: 'path', attributes: { d: 'M7.4 6.4l1 .6m2.7-2 .2 1.3m3.1-.5.9.8', class: 'chat-smiley-icon-detail' } },
    { tag: 'path', attributes: { d: 'M3 11.5h18l-1.2 1.4 1.2 1.5-1.3 1.4H4.3L3 14.4l1.2-1.5z', class: 'chat-smiley-lettuce' } },
    { tag: 'path', attributes: { d: 'M4 15.4h16v2H4z', class: 'chat-smiley-tomato' } },
    { tag: 'path', attributes: { d: 'M4 17.3h16v.6a3.2 3.2 0 0 1-3.2 3.2H7.2A3.2 3.2 0 0 1 4 17.9z', class: 'chat-smiley-icon-line' } },
  ],
};

function createChatSmiley(doc: Document, icon: ChatSmileyIcon, shortcut: string): HTMLSpanElement {
  const wrapper = doc.createElement('span');
  wrapper.className = 'chat-smiley';
  wrapper.setAttribute('role', 'img');
  wrapper.setAttribute('aria-label', smileyLabels[icon]);
  wrapper.dataset.shortcut = shortcut;

  const svg = doc.createElementNS(SVG_NAMESPACE, 'svg');
  svg.classList.add('chat-smiley-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const shape of smileyShapes[icon]) {
    const element = doc.createElementNS(SVG_NAMESPACE, shape.tag);
    for (const [name, value] of Object.entries(shape.attributes)) element.setAttribute(name, value);
    svg.append(element);
  }
  wrapper.append(svg);
  return wrapper;
}

export interface LoungeChatUiController {
  isActive(): boolean;
  load(): void;
  stop(): void;
  resume(): void;
  hasReplyParent(): boolean;
  setReplyParent(message: ChatMessage): void;
  clearReplyParent(): void;
  messagesById(): Map<number, ChatMessage>;
  focusComposer(): void;
  setFollowLatest(value: boolean): void;
  isComposer(target: EventTarget | null): boolean;
  dispose(): void;
}

export function initLoungeChatUi(options: {
  isVisible: () => boolean;
  isDocumentHidden: () => boolean;
  getUserId: () => number | null;
  onActiveChange: (active: boolean) => void;
  onSelectionCleared: () => void;
  selectMessage: (id: number, focus?: boolean) => void;
  onUnauthorized: () => void;
  report: (message: string, isError?: boolean) => void;
  presence: Pick<LoungePresenceController,
    'pollLoungePresence' | 'stopLoungePolling' | 'resetLoungeStatus' | 'setLoungePresenceStatus'>;
  avatarInitials: (name: string) => string;
  compactMessage: (body: string) => string;
  submitFormOnEnter: (event: KeyboardEvent, form: HTMLFormElement) => void;
  request?: typeof api;
  fetcher?: typeof fetch;
  realtime?: RealtimeUpdates;
  doc?: Document;
}): LoungeChatUiController {
  const doc = options.doc ?? document;
  const request = options.request ?? api;
  const fetcher = options.fetcher ?? fetch;
  const loungeView = required<HTMLElement>('#lounge-view');
  const loungeMessageList = required<HTMLElement>('#lounge-message-list');
  const loungeEmptyState = required<HTMLElement>('#lounge-empty-state');
  const loungeLatestButton = required<HTMLButtonElement>('#lounge-latest-button');
  const loungeForm = required<HTMLFormElement>('#lounge-form');
  const loungeInput = required<HTMLTextAreaElement>('#lounge-input');
  const loungeMentionList = required<HTMLDivElement>('#lounge-mention-suggestions');
  const loungeReplyHint = required<HTMLElement>('#lounge-reply-hint');
  const loungeCancelReply = required<HTMLButtonElement>('#lounge-cancel-reply');
  const listeners = new AbortController();

  let active = false;
  let pollTimer: number | null = null;
  let cursor = 0;
  let etag: string | null = null;
  let pollDelay = 1000;
  let followLatest = true;
  let members: LoungeMentionMember[] = [];
  const messages = new Map<number, ChatMessage>();
  let replyParent: { id: number; name: string; body: string } | null = null;
  let mentionQuery: MentionQuery | null = null;
  let mentionMatches: LoungeMentionMember[] = [];
  let mentionSelectedIndex = 0;
  let mentionDismissed = false;

  function required<T extends Element>(selector: string): T {
    const element = doc.querySelector<T>(selector);
    if (element === null) throw new Error(`Missing Lounge element: ${selector}`);
    return element;
  }

  function isActive(): boolean {
    return active;
  }

  function stop(): void {
    active = false;
    options.onActiveChange(false);
    options.onSelectionCleared();
    if (pollTimer !== null) window.clearTimeout(pollTimer);
    pollTimer = null;
    options.presence.stopLoungePolling();
    members = [];
    mentionDismissed = false;
    clearReplyParent();
    messages.clear();
    hideMentionSuggestions();
    loungeMessageList.replaceChildren(loungeEmptyState);
    loungeEmptyState.hidden = false;
    loungeLatestButton.hidden = true;
  }

  function isNearLatestMessage(): boolean {
    return loungeMessageList.scrollHeight - loungeMessageList.scrollTop
      - loungeMessageList.clientHeight <= 24;
  }

  function updateLatestButton(): void {
    loungeLatestButton.hidden = isNearLatestMessage();
  }

  function scrollToLatest(): void {
    loungeMessageList.scrollTop = loungeMessageList.scrollHeight;
    followLatest = true;
    updateLatestButton();
  }

  function schedulePoll(delay = pollDelay): void {
    if (!active) return;
    if (!shouldUsePolling(options.realtime)) {
      if (pollTimer !== null) window.clearTimeout(pollTimer);
      pollTimer = null;
      return;
    }
    if (pollTimer !== null) window.clearTimeout(pollTimer);
    pollTimer = window.setTimeout(() => {
      pollTimer = null;
      if (active) void pollNow();
    }, delay);
  }

  function updateMentionSuggestions(): void {
    if (mentionDismissed) return;
    const query = findMentionQuery(loungeInput.value, loungeInput.selectionStart);
    if (query === null) {
      hideMentionSuggestions();
      return;
    }
    const matchingMembers = filterMentionMembers(members, query.query, options.getUserId());
    if (matchingMembers.length === 0) {
      mentionQuery = query;
      mentionMatches = [];
      mentionSelectedIndex = 0;
      const empty = doc.createElement('div');
      empty.className = 'chat-mention-empty';
      empty.setAttribute('role', 'option');
      empty.setAttribute('aria-disabled', 'true');
      empty.setAttribute('aria-selected', 'false');
      empty.textContent = mentionEmptyMessage(members, query.query, options.getUserId(), 'workspace');
      loungeMentionList.replaceChildren(empty);
      loungeMentionList.hidden = false;
      loungeInput.setAttribute('aria-expanded', 'true');
      loungeInput.removeAttribute('aria-activedescendant');
      return;
    }

    mentionQuery = query;
    mentionMatches = matchingMembers;
    mentionSelectedIndex = Math.min(mentionSelectedIndex, matchingMembers.length - 1);
    loungeMentionList.replaceChildren(...matchingMembers.map((member, index) => {
      const option = doc.createElement('button');
      option.type = 'button';
      option.id = `lounge-mention-option-${index}`;
      option.className = 'chat-mention-option';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(index === mentionSelectedIndex));
      const name = doc.createElement('strong');
      name.textContent = member.name;
      const email = doc.createElement('span');
      email.textContent = member.email;
      option.append(name, email);
      option.addEventListener('mousedown', (event) => event.preventDefault());
      option.addEventListener('click', () => selectMention(member));
      return option;
    }));
    loungeMentionList.hidden = false;
    loungeInput.setAttribute('aria-expanded', 'true');
    loungeInput.setAttribute('aria-activedescendant', `lounge-mention-option-${mentionSelectedIndex}`);
  }

  function hideMentionSuggestions(): void {
    mentionQuery = null;
    mentionMatches = [];
    mentionSelectedIndex = 0;
    loungeMentionList.hidden = true;
    loungeMentionList.replaceChildren();
    loungeInput.setAttribute('aria-expanded', 'false');
    loungeInput.removeAttribute('aria-activedescendant');
  }

  function selectMention(member: MentionMember): void {
    if (mentionQuery === null) return;
    const insertion = replaceMentionQuery(loungeInput.value, mentionQuery, member.name);
    loungeInput.value = insertion.value;
    loungeInput.setSelectionRange(insertion.cursor, insertion.cursor);
    mentionDismissed = true;
    hideMentionSuggestions();
    loungeInput.focus();
  }

  function handleMentionKeydown(event: KeyboardEvent): boolean {
    return handleMentionKeydownUi(
      event,
      loungeInput,
      loungeMentionList,
      mentionMatches,
      mentionSelectedIndex,
      (index) => { mentionSelectedIndex = index; },
      selectMention,
      () => {
        mentionDismissed = true;
        hideMentionSuggestions();
      },
    );
  }

  function appendMessage(message: ChatMessage, scrollToBottom = false): void {
    if (loungeMessageList.querySelector(`[data-message-id="${message.id}"]`) !== null) return;
    const item = doc.createElement('article');
    item.className = message.parent_id === null ? 'chat-message' : 'chat-message chat-reply';
    item.dataset.messageId = String(message.id);
    item.tabIndex = -1;
    item.setAttribute('aria-keyshortcuts', 'j k ArrowUp ArrowDown Home End PageUp PageDown Enter r');
    item.addEventListener('focusin', () => options.selectMessage(message.id, false));
    item.addEventListener('click', (event) => {
      if (!(event.target instanceof HTMLElement) || event.target.closest('button') === null) {
        options.selectMessage(message.id);
      }
    });
    messages.set(message.id, message);
    if (message.parent_id !== null) {
      const parent = messages.get(message.parent_id);
      if (parent !== undefined) updateMessageReplyCount(parent);
    }

    const heading = doc.createElement('div');
    heading.className = 'chat-message-heading';
    const avatar = doc.createElement('span');
    avatar.className = 'chat-message-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = options.avatarInitials(message.author_name);
    const authorDetails = doc.createElement('span');
    authorDetails.className = 'chat-message-author';
    const author = doc.createElement('strong');
    author.textContent = message.author_name;
    const time = doc.createElement('time');
    time.className = 'chat-message-time';
    time.dateTime = message.created_at;
    time.textContent = formatChatTimestamp(message.created_at);
    authorDetails.append(author, time);
    const actions = doc.createElement('div');
    actions.className = 'chat-message-actions';
    const reply = doc.createElement('button');
    reply.className = 'button button-quiet chat-reply-button';
    reply.type = 'button';
    reply.textContent = 'Reply';
    reply.setAttribute('aria-label', `Reply to ${message.author_name}`);
    reply.addEventListener('click', () => setReplyParent(message));
    actions.append(reply);
    heading.append(avatar, authorDetails, actions);

    const body = doc.createElement('p');
    body.className = 'chat-message-body';
    for (const segment of splitMentions(message.body, members)) {
      if (segment.memberId === null) {
        for (const textSegment of splitChatSmilies(segment.text)) {
          if (textSegment.icon === null) body.append(doc.createTextNode(textSegment.text));
          else body.append(createChatSmiley(doc, textSegment.icon, textSegment.text));
        }
      } else {
        const mention = doc.createElement('mark');
        mention.className = 'chat-message-mention';
        mention.dataset.memberId = String(segment.memberId);
        mention.textContent = segment.text;
        body.append(mention);
      }
    }
    item.append(heading);
    if (message.parent_id !== null) {
      const parentAuthor = message.parent_author_name ?? messages.get(message.parent_id)?.author_name ?? null;
      const parentBody = message.parent_body ?? messages.get(message.parent_id)?.body ?? null;
      const parentExcerpt = parentBody === null ? '' : options.compactMessage(parentBody);
      const parentLabel = parentAuthor === null
        ? parentExcerpt || `Message #${message.parent_id}`
        : parentExcerpt === '' ? parentAuthor : `${parentAuthor}: ${parentExcerpt}`;
      const context = doc.createElement('button');
      context.className = 'chat-reply-context';
      context.type = 'button';
      context.textContent = `↳ ${parentLabel}`;
      context.title = `Reply to ${parentLabel}`;
      context.setAttribute('aria-label', `Jump to message #${message.parent_id}: ${parentLabel}`);
      context.addEventListener('click', () => void focusMessageById(message.parent_id!));
      item.append(context);
    }
    item.append(body);
    loungeMessageList.append(item);
    updateMessageReplyCount(message);
    loungeEmptyState.hidden = true;
    if (scrollToBottom) scrollToLatest();
    else updateLatestButton();
  }

  function updateMessageReplyCount(message: ChatMessage): void {
    const item = loungeMessageList.querySelector<HTMLElement>(`.chat-message[data-message-id="${message.id}"]`);
    if (item === null) return;
    const replies = Array.from(messages.values()).filter((candidate) => candidate.parent_id === message.id);
    const replyCount = Math.max(message.reply_count ?? 0, replies.length);
    const loadedFirstReplyId = replies.reduce<number | null>((firstId, reply) =>
      firstId === null || reply.id < firstId ? reply.id : firstId, null);
    const firstReplyId = message.first_reply_id === null || message.first_reply_id === undefined
      ? loadedFirstReplyId
      : loadedFirstReplyId === null ? message.first_reply_id : Math.min(message.first_reply_id, loadedFirstReplyId);
    message.reply_count = replyCount;
    message.first_reply_id = firstReplyId;
    const existing = item.querySelector<HTMLButtonElement>('.chat-message-reply-count');
    if (replyCount === 0 || firstReplyId === null) {
      existing?.remove();
      return;
    }
    const button = existing ?? doc.createElement('button');
    button.className = 'chat-message-reply-count';
    button.type = 'button';
    button.dataset.firstReplyId = String(firstReplyId);
    const label = `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`;
    button.textContent = label;
    button.title = `Show ${label} to ${message.author_name}'s message`;
    button.setAttribute('aria-label', `Jump to the first of ${label} to ${message.author_name}'s message`);
    if (existing === null) {
      button.addEventListener('click', () => {
        const firstReplyId = Number(button.dataset.firstReplyId);
        if (Number.isSafeInteger(firstReplyId)) void focusMessageById(firstReplyId);
      });
      item.append(button);
    }
  }

  function setReplyParent(message: ChatMessage): void {
    replyParent = { id: message.id, name: message.author_name, body: message.body };
    loungeReplyHint.textContent = `Replying to ${message.author_name}: ${options.compactMessage(message.body)}`;
    loungeReplyHint.hidden = false;
    loungeCancelReply.hidden = false;
    loungeInput.focus();
  }

  function clearReplyParent(): void {
    replyParent = null;
    loungeReplyHint.hidden = true;
    loungeReplyHint.textContent = '';
    loungeCancelReply.hidden = true;
  }

  async function focusMessageById(messageId: number): Promise<void> {
    if (!Number.isSafeInteger(messageId) || messageId < 1) return;
    let sourceMessage = loungeMessageList.querySelector<HTMLElement>(`.chat-message[data-message-id="${messageId}"]`);
    if (sourceMessage === null) {
      try {
        const result = await request<{ messages: ChatMessage[] }>(`/lounge/messages?since=${messageId - 1}`);
        if (!active || !options.isVisible()) return;
        for (const message of result.messages) appendMessage(message);
        sourceMessage = loungeMessageList.querySelector<HTMLElement>(`.chat-message[data-message-id="${messageId}"]`);
      } catch (error) {
        options.report(error instanceof Error ? error.message : 'Could not open the replied-to Lounge message.', true);
        return;
      }
    }
    if (sourceMessage === null) {
      options.report('The replied-to message is unavailable in the Lounge.', true);
      return;
    }
    loungeMessageList.querySelector('.is-chat-source')?.classList.remove('is-chat-source');
    sourceMessage.classList.add('is-chat-source');
    sourceMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    sourceMessage.focus();
  }

  async function loadNow(): Promise<void> {
    stop();
    active = true;
    options.onActiveChange(true);
    options.presence.resetLoungeStatus();
    options.presence.setLoungePresenceStatus('Checking who’s here…', 'checking');
    void options.presence.pollLoungePresence();
    cursor = 0;
    etag = null;
    pollDelay = 1000;
    followLatest = true;
    loungeMessageList.replaceChildren(loungeEmptyState);
    loungeEmptyState.hidden = false;
    loungeEmptyState.textContent = 'Loading messages…';
    loungeLatestButton.hidden = true;
    try {
      const [result, membersResult] = await Promise.all([
        request<{ messages: ChatMessage[] }>('/lounge/messages'),
        request<{ members: LoungeMentionMember[] }>('/lounge/members'),
      ]);
      if (!active || !options.isVisible()) return;
      members = membersResult.members;
      for (const message of result.messages) {
        cursor = Math.max(cursor, message.id);
        appendMessage(message);
      }
      if (messages.size === 0) loungeEmptyState.textContent = 'No messages yet.';
      scrollToLatest();
      void pollNow();
    } catch (error) {
      if (!active) return;
      if (error instanceof ApiFailure && error.status === 401) {
        options.onUnauthorized();
        return;
      }
      loungeEmptyState.textContent = 'Could not load messages.';
      options.report(error instanceof Error ? error.message : 'Could not load the Lounge.', true);
      schedulePoll(5000);
    }
  }

  async function pollNow(): Promise<void> {
    if (!active || !options.isVisible()) return;
    if (pollTimer !== null) window.clearTimeout(pollTimer);
    pollTimer = null;
    if (options.isDocumentHidden()) {
      pollDelay = Math.min(10_000, Math.max(5_000, pollDelay * 1.5));
      schedulePoll();
      return;
    }
    const headers = new Headers();
    if (etag !== null) headers.set('If-None-Match', etag);
    try {
      const response = await fetcher(`${apiBaseUrl}/lounge/messages?since=${cursor}`, {
        headers,
        credentials: 'same-origin',
      });
      if (!active) return;
      if (response.status === 304) {
        pollDelay = Math.min(10_000, pollDelay * 1.5);
      } else {
        const payload = await response.json() as { messages?: ChatMessage[]; error?: { message?: string } };
        if (!active) return;
        if (!response.ok) throw new ApiFailure(payload.error?.message ?? 'Could not load the Lounge.', response.status);
        etag = response.headers.get('ETag');
        const received = payload.messages ?? [];
        for (const message of received) {
          cursor = Math.max(cursor, message.id);
          appendMessage(message, followLatest);
        }
        pollDelay = received.length > 0 ? 1000 : Math.min(10_000, pollDelay * 1.5);
      }
      if (messages.size === 0) loungeEmptyState.textContent = 'No messages yet.';
    } catch (error) {
      if (!active) return;
      if (error instanceof ApiFailure && error.status === 401) {
        options.onUnauthorized();
        return;
      }
      options.report(error instanceof Error ? error.message : 'Could not load the Lounge.', true);
      pollDelay = Math.min(10_000, pollDelay * 1.5);
    }
    if (active) schedulePoll();
  }

  async function sendMessage(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const body = loungeInput.value.trim();
    if (body === '') return;
    const sendButton = loungeForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (sendButton !== null) sendButton.disabled = true;
    try {
      const messageBody: { body: string; parent_id?: number } = { body };
      if (replyParent !== null) messageBody.parent_id = replyParent.id;
      const result = await request<{ message: ChatMessage }>('/lounge/messages', {
        method: 'POST',
        body: JSON.stringify(messageBody),
      });
      if (!active) return;
      cursor = Math.max(cursor, result.message.id);
      appendMessage(result.message, true);
      loungeInput.value = '';
      clearReplyParent();
      mentionDismissed = false;
      hideMentionSuggestions();
      etag = null;
      pollDelay = 1000;
      schedulePoll(0);
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 401) {
        options.onUnauthorized();
        return;
      }
      options.report(error instanceof Error ? error.message : 'Could not send the Lounge message.', true);
    } finally {
      if (sendButton !== null) sendButton.disabled = false;
    }
  }

  function resume(): void {
    if (!active) return;
    pollDelay = 1000;
    if (options.realtime?.isConnected()) void pollNow();
    else schedulePoll(0);
  }

  loungeMessageList.addEventListener('scroll', () => {
    followLatest = isNearLatestMessage();
    updateLatestButton();
  }, { signal: listeners.signal });
  loungeLatestButton.addEventListener('click', scrollToLatest, { signal: listeners.signal });
  loungeForm.addEventListener('submit', (event) => void sendMessage(event), { signal: listeners.signal });
  loungeCancelReply.addEventListener('click', clearReplyParent, { signal: listeners.signal });
  loungeInput.addEventListener('input', () => {
    mentionDismissed = false;
    updateMentionSuggestions();
  }, { signal: listeners.signal });
  loungeInput.addEventListener('click', updateMentionSuggestions, { signal: listeners.signal });
  loungeInput.addEventListener('select', updateMentionSuggestions, { signal: listeners.signal });
  loungeInput.addEventListener('keyup', updateMentionSuggestions, { signal: listeners.signal });
  loungeInput.addEventListener('blur', hideMentionSuggestions, { signal: listeners.signal });
  loungeInput.addEventListener('keydown', (event) => {
    if (!handleMentionKeydown(event)) options.submitFormOnEnter(event, loungeForm);
  }, { signal: listeners.signal });

  const unbindRealtime = bindRealtimePolling({
    realtime: options.realtime,
    isActive: () => active && options.isVisible(),
    pausePolling: () => {
      if (pollTimer !== null) window.clearTimeout(pollTimer);
      pollTimer = null;
    },
    resumePolling: () => schedulePoll(0),
    refresh: () => { void pollNow(); },
  });

  return {
    isActive,
    load: () => { void loadNow(); },
    stop,
    resume,
    hasReplyParent: () => replyParent !== null,
    setReplyParent,
    clearReplyParent,
    messagesById: () => messages,
    focusComposer: () => loungeInput.focus(),
    setFollowLatest: (value) => { followLatest = value; },
    isComposer: (target) => target === loungeInput,
    dispose: () => {
      unbindRealtime();
      listeners.abort();
      stop();
    },
  };

}
