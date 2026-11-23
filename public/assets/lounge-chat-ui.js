import { ApiFailure, api, apiBaseUrl } from './api.js';
import { filterMentionMembers, findMentionQuery, mentionEmptyMessage, replaceMentionQuery, splitMentions, } from './chat-mentions.js';
import { handleMentionKeydown as handleMentionKeydownUi } from './chat-mentions-ui.js';
import { formatChatTimestamp } from './chat-time.js';
export function initLoungeChatUi(options) {
    const doc = options.doc ?? document;
    const request = options.request ?? api;
    const fetcher = options.fetcher ?? fetch;
    const loungeView = required('#lounge-view');
    const loungeMessageList = required('#lounge-message-list');
    const loungeEmptyState = required('#lounge-empty-state');
    const loungeLatestButton = required('#lounge-latest-button');
    const loungeForm = required('#lounge-form');
    const loungeInput = required('#lounge-input');
    const loungeMentionList = required('#lounge-mention-suggestions');
    const loungeReplyHint = required('#lounge-reply-hint');
    const loungeCancelReply = required('#lounge-cancel-reply');
    const listeners = new AbortController();
    let active = false;
    let pollTimer = null;
    let cursor = 0;
    let etag = null;
    let pollDelay = 1000;
    let followLatest = true;
    let members = [];
    const messages = new Map();
    let replyParent = null;
    let mentionQuery = null;
    let mentionMatches = [];
    let mentionSelectedIndex = 0;
    let mentionDismissed = false;
    function required(selector) {
        const element = doc.querySelector(selector);
        if (element === null)
            throw new Error(`Missing Lounge element: ${selector}`);
        return element;
    }
    function isActive() {
        return active;
    }
    function stop() {
        active = false;
        options.onActiveChange(false);
        options.onSelectionCleared();
        if (pollTimer !== null)
            window.clearTimeout(pollTimer);
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
    function isNearLatestMessage() {
        return loungeMessageList.scrollHeight - loungeMessageList.scrollTop
            - loungeMessageList.clientHeight <= 24;
    }
    function updateLatestButton() {
        loungeLatestButton.hidden = isNearLatestMessage();
    }
    function scrollToLatest() {
        loungeMessageList.scrollTop = loungeMessageList.scrollHeight;
        followLatest = true;
        updateLatestButton();
    }
    function schedulePoll(delay = pollDelay) {
        if (!active)
            return;
        if (pollTimer !== null)
            window.clearTimeout(pollTimer);
        pollTimer = window.setTimeout(() => {
            pollTimer = null;
            if (active)
                void pollNow();
        }, delay);
    }
    function updateMentionSuggestions() {
        if (mentionDismissed)
            return;
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
    function hideMentionSuggestions() {
        mentionQuery = null;
        mentionMatches = [];
        mentionSelectedIndex = 0;
        loungeMentionList.hidden = true;
        loungeMentionList.replaceChildren();
        loungeInput.setAttribute('aria-expanded', 'false');
        loungeInput.removeAttribute('aria-activedescendant');
    }
    function selectMention(member) {
        if (mentionQuery === null)
            return;
        const insertion = replaceMentionQuery(loungeInput.value, mentionQuery, member.name);
        loungeInput.value = insertion.value;
        loungeInput.setSelectionRange(insertion.cursor, insertion.cursor);
        mentionDismissed = true;
        hideMentionSuggestions();
        loungeInput.focus();
    }
    function handleMentionKeydown(event) {
        return handleMentionKeydownUi(event, loungeInput, loungeMentionList, mentionMatches, mentionSelectedIndex, (index) => { mentionSelectedIndex = index; }, selectMention, () => {
            mentionDismissed = true;
            hideMentionSuggestions();
        });
    }
    function appendMessage(message, scrollToBottom = false) {
        if (loungeMessageList.querySelector(`[data-message-id="${message.id}"]`) !== null)
            return;
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
            if (parent !== undefined)
                updateMessageReplyCount(parent);
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
                body.append(doc.createTextNode(segment.text));
            }
            else {
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
            context.addEventListener('click', () => void focusMessageById(message.parent_id));
            item.append(context);
        }
        item.append(body);
        loungeMessageList.append(item);
        updateMessageReplyCount(message);
        loungeEmptyState.hidden = true;
        if (scrollToBottom)
            scrollToLatest();
        else
            updateLatestButton();
    }
    function updateMessageReplyCount(message) {
        const item = loungeMessageList.querySelector(`.chat-message[data-message-id="${message.id}"]`);
        if (item === null)
            return;
        const replies = Array.from(messages.values()).filter((candidate) => candidate.parent_id === message.id);
        const replyCount = Math.max(message.reply_count ?? 0, replies.length);
        const loadedFirstReplyId = replies.reduce((firstId, reply) => firstId === null || reply.id < firstId ? reply.id : firstId, null);
        const firstReplyId = message.first_reply_id === null || message.first_reply_id === undefined
            ? loadedFirstReplyId
            : loadedFirstReplyId === null ? message.first_reply_id : Math.min(message.first_reply_id, loadedFirstReplyId);
        message.reply_count = replyCount;
        message.first_reply_id = firstReplyId;
        const existing = item.querySelector('.chat-message-reply-count');
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
                if (Number.isSafeInteger(firstReplyId))
                    void focusMessageById(firstReplyId);
            });
            item.append(button);
        }
    }
    function setReplyParent(message) {
        replyParent = { id: message.id, name: message.author_name, body: message.body };
        loungeReplyHint.textContent = `Replying to ${message.author_name}: ${options.compactMessage(message.body)}`;
        loungeReplyHint.hidden = false;
        loungeCancelReply.hidden = false;
        loungeInput.focus();
    }
    function clearReplyParent() {
        replyParent = null;
        loungeReplyHint.hidden = true;
        loungeReplyHint.textContent = '';
        loungeCancelReply.hidden = true;
    }
    async function focusMessageById(messageId) {
        if (!Number.isSafeInteger(messageId) || messageId < 1)
            return;
        let sourceMessage = loungeMessageList.querySelector(`.chat-message[data-message-id="${messageId}"]`);
        if (sourceMessage === null) {
            try {
                const result = await request(`/lounge/messages?since=${messageId - 1}`);
                if (!active || !options.isVisible())
                    return;
                for (const message of result.messages)
                    appendMessage(message);
                sourceMessage = loungeMessageList.querySelector(`.chat-message[data-message-id="${messageId}"]`);
            }
            catch (error) {
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
    async function loadNow() {
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
                request('/lounge/messages'),
                request('/lounge/members'),
            ]);
            if (!active || !options.isVisible())
                return;
            members = membersResult.members;
            for (const message of result.messages) {
                cursor = Math.max(cursor, message.id);
                appendMessage(message);
            }
            if (messages.size === 0)
                loungeEmptyState.textContent = 'No messages yet.';
            scrollToLatest();
            void pollNow();
        }
        catch (error) {
            if (!active)
                return;
            if (error instanceof ApiFailure && error.status === 401) {
                options.onUnauthorized();
                return;
            }
            loungeEmptyState.textContent = 'Could not load messages.';
            options.report(error instanceof Error ? error.message : 'Could not load the Lounge.', true);
            schedulePoll(5000);
        }
    }
    async function pollNow() {
        if (!active || !options.isVisible())
            return;
        if (pollTimer !== null)
            window.clearTimeout(pollTimer);
        pollTimer = null;
        if (options.isDocumentHidden()) {
            pollDelay = Math.min(10_000, Math.max(5_000, pollDelay * 1.5));
            schedulePoll();
            return;
        }
        const headers = new Headers();
        if (etag !== null)
            headers.set('If-None-Match', etag);
        try {
            const response = await fetcher(`${apiBaseUrl}/lounge/messages?since=${cursor}`, {
                headers,
                credentials: 'same-origin',
            });
            if (!active)
                return;
            if (response.status === 304) {
                pollDelay = Math.min(10_000, pollDelay * 1.5);
            }
            else {
                const payload = await response.json();
                if (!active)
                    return;
                if (!response.ok)
                    throw new ApiFailure(payload.error?.message ?? 'Could not load the Lounge.', response.status);
                etag = response.headers.get('ETag');
                const received = payload.messages ?? [];
                for (const message of received) {
                    cursor = Math.max(cursor, message.id);
                    appendMessage(message, followLatest);
                }
                pollDelay = received.length > 0 ? 1000 : Math.min(10_000, pollDelay * 1.5);
            }
            if (messages.size === 0)
                loungeEmptyState.textContent = 'No messages yet.';
        }
        catch (error) {
            if (!active)
                return;
            if (error instanceof ApiFailure && error.status === 401) {
                options.onUnauthorized();
                return;
            }
            options.report(error instanceof Error ? error.message : 'Could not load the Lounge.', true);
            pollDelay = Math.min(10_000, pollDelay * 1.5);
        }
        if (active)
            schedulePoll();
    }
    async function sendMessage(event) {
        event.preventDefault();
        const body = loungeInput.value.trim();
        if (body === '')
            return;
        const sendButton = loungeForm.querySelector('button[type="submit"]');
        if (sendButton !== null)
            sendButton.disabled = true;
        try {
            const messageBody = { body };
            if (replyParent !== null)
                messageBody.parent_id = replyParent.id;
            const result = await request('/lounge/messages', {
                method: 'POST',
                body: JSON.stringify(messageBody),
            });
            if (!active)
                return;
            cursor = Math.max(cursor, result.message.id);
            appendMessage(result.message, true);
            loungeInput.value = '';
            clearReplyParent();
            mentionDismissed = false;
            hideMentionSuggestions();
            etag = null;
            pollDelay = 1000;
            schedulePoll(0);
        }
        catch (error) {
            if (error instanceof ApiFailure && error.status === 401) {
                options.onUnauthorized();
                return;
            }
            options.report(error instanceof Error ? error.message : 'Could not send the Lounge message.', true);
        }
        finally {
            if (sendButton !== null)
                sendButton.disabled = false;
        }
    }
    function resume() {
        if (!active)
            return;
        pollDelay = 1000;
        schedulePoll(0);
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
        if (!handleMentionKeydown(event))
            options.submitFormOnEnter(event, loungeForm);
    }, { signal: listeners.signal });
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
            listeners.abort();
            stop();
        },
    };
}
