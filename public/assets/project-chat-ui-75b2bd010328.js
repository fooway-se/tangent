import { ApiFailure, api, apiBaseUrl } from './api-c96a28d6bb6c.js';
import { ChatEventFeed, pollProjectChatEvents } from './chat-event-feed-9e7072b64597.js';
import { bindRealtimePolling, shouldUsePolling } from './realtime-polling-9539ddcb4474.js';
import { formatChatTimestamp } from './chat-time-257fc92db8bc.js';
import { applyPresenceState } from './presence-indicator-5e1c76e720b6.js';
import { filterMentionMembers, findMentionQuery, mentionEmptyMessage, replaceMentionQuery, } from './chat-mentions-ccd8a795416a.js';
import { handleMentionKeydown } from './chat-mentions-ui-9633c71badb4.js';
const PROJECT_PRESENCE_INTERVAL_MS = 15_000;
export function initProjectChatUi(options) {
    const doc = options.doc ?? document;
    const request = options.request ?? api;
    const fetcher = options.fetcher ?? fetch;
    const pollEvents = options.pollEvents ?? pollProjectChatEvents;
    let activeId = null;
    let chatProject = null;
    let chatMembers = [];
    let issueActionsEnabled = true;
    let pollTimer = null;
    const eventFeed = new ChatEventFeed();
    let etag = null;
    let pollDelay = 1000;
    let presenceTimer = null;
    let presenceRequestVersion = 0;
    let presenceIndicator = null;
    let latestButton = null;
    let followLatest = true;
    let messageListElement = null;
    let emptyState = null;
    let initialHistorySettled = false;
    let input = null;
    let mentionList = null;
    let mentionQuery = null;
    let mentionMatches = [];
    let mentionSelectedIndex = 0;
    let mentionDismissed = false;
    const messages = new Map();
    let replyHint = null;
    let cancelReply = null;
    let sendButton = null;
    let replyParent = null;
    function isReadOnly() {
        const status = (chatProject ?? options.getProject())?.status;
        return status === 'completed' || status === 'archived';
    }
    function currentProject() {
        return chatProject ?? options.getProject();
    }
    function activeProjectId() {
        return activeId;
    }
    function messageList() {
        return messageListElement;
    }
    function stop() {
        stopPresencePolling();
        activeId = null;
        chatProject = null;
        chatMembers = [];
        issueActionsEnabled = true;
        if (pollTimer !== null)
            window.clearTimeout(pollTimer);
        pollTimer = null;
        messageListElement = null;
        latestButton = null;
        emptyState = null;
        input = null;
        mentionList = null;
        mentionQuery = null;
        mentionMatches = [];
        mentionSelectedIndex = 0;
        mentionDismissed = false;
        replyHint = null;
        cancelReply = null;
        sendButton = null;
        replyParent = null;
        followLatest = true;
        messages.clear();
        eventFeed.reset();
        options.onClearSelection();
    }
    function schedulePoll(delay = pollDelay) {
        if (activeId === null)
            return;
        if (!shouldUsePolling(options.realtime)) {
            if (pollTimer !== null)
                window.clearTimeout(pollTimer);
            pollTimer = null;
            return;
        }
        if (pollTimer !== null)
            window.clearTimeout(pollTimer);
        pollTimer = window.setTimeout(() => {
            pollTimer = null;
            const projectId = activeId;
            if (projectId !== null)
                void pollChat(projectId);
        }, delay);
    }
    function stopPresencePolling() {
        if (presenceTimer !== null)
            window.clearTimeout(presenceTimer);
        presenceTimer = null;
        presenceRequestVersion += 1;
        presenceIndicator = null;
    }
    function schedulePresencePoll(delay = PROJECT_PRESENCE_INTERVAL_MS) {
        if (presenceTimer !== null)
            window.clearTimeout(presenceTimer);
        presenceTimer = null;
        const projectId = activeId;
        if (projectId === null || presenceIndicator === null)
            return;
        presenceTimer = window.setTimeout(() => {
            presenceTimer = null;
            const activeProjectId = activeId;
            if (activeProjectId !== null)
                void pollPresence(activeProjectId);
        }, delay);
    }
    async function pollPresence(projectId) {
        if (presenceTimer !== null)
            window.clearTimeout(presenceTimer);
        presenceTimer = null;
        if (activeId !== projectId || presenceIndicator === null)
            return;
        const requestVersion = ++presenceRequestVersion;
        if (options.isDocumentHidden()) {
            schedulePresencePoll();
            return;
        }
        try {
            const result = await request(`/projects/${projectId}/presence`, {
                method: 'POST',
                body: JSON.stringify({}),
            });
            if (requestVersion !== presenceRequestVersion || activeId !== projectId)
                return;
            setPresenceState(result.someone_else_viewing === true ? 'active' : 'alone');
        }
        catch (error) {
            if (requestVersion !== presenceRequestVersion || activeId !== projectId)
                return;
            if (error instanceof ApiFailure && error.status === 401) {
                options.onUnauthorized();
                return;
            }
            setPresenceState('unknown');
        }
        finally {
            if (requestVersion === presenceRequestVersion && activeId === projectId)
                schedulePresencePoll();
        }
    }
    function setPresenceState(state) {
        if (presenceIndicator === null)
            return;
        applyPresenceState(presenceIndicator, state);
        options.onPresenceChange?.(state);
    }
    async function pollChat(projectId) {
        if (activeId !== projectId)
            return;
        if (options.isDocumentHidden()) {
            pollDelay = Math.min(10_000, Math.max(5_000, pollDelay * 1.5));
            schedulePoll();
            return;
        }
        const cursor = eventFeed.requestQuery();
        try {
            const result = await pollEvents(fetcher, apiBaseUrl, projectId, cursor, etag, pollDelay);
            if (activeId !== projectId)
                return;
            if (!result.notModified && (result.status < 200 || result.status >= 300)) {
                throw new ApiFailure(result.errorMessage ?? 'Could not load project chat.', result.status);
            }
            pollDelay = result.nextDelay;
            if (!result.notModified) {
                etag = result.etag;
                const received = result.events;
                eventFeed.consume(received, projectId, (messageId) => messages.has(messageId), (event) => appendMessage(event, followLatest));
            }
            if (initialHistorySettled && messages.size === 0 && emptyState !== null) {
                emptyState.hidden = false;
                emptyState.textContent = 'No messages yet.';
            }
        }
        catch (error) {
            if (error instanceof ApiFailure && error.status === 401) {
                options.onUnauthorized();
                return;
            }
            if (initialHistorySettled && activeId === projectId && messages.size === 0 && emptyState !== null) {
                emptyState.hidden = false;
                emptyState.textContent = 'Could not load messages.';
            }
            options.report(error instanceof Error ? error.message : 'Could not load project chat.', true);
            pollDelay = Math.min(10_000, pollDelay * 1.5);
        }
        if (activeId === projectId)
            schedulePoll();
    }
    async function loadHistory(projectId) {
        try {
            const result = await request(`/projects/${projectId}/messages`);
            if (activeId !== projectId)
                return;
            initialHistorySettled = true;
            for (const message of result.messages)
                appendMessage(message);
            if (messages.size === 0 && emptyState !== null)
                emptyState.textContent = 'No messages yet.';
            if (followLatest)
                scrollToBottom();
            void pollChat(projectId);
        }
        catch (error) {
            if (error instanceof ApiFailure && error.status === 401) {
                options.onUnauthorized();
                return;
            }
            initialHistorySettled = true;
            if (activeId === projectId && messages.size === 0 && emptyState !== null) {
                emptyState.textContent = 'Could not load messages.';
            }
            options.report(error instanceof Error ? error.message : 'Could not load project chat.', true);
            schedulePoll();
        }
    }
    function appendMessage(message, scrollToBottom = false) {
        if (messageListElement === null)
            return;
        if (messageListElement.querySelector(`[data-message-id="${message.id}"]`)) {
            if (scrollToBottom)
                scrollLatest();
            return;
        }
        messages.set(message.id, message);
        if (message.parent_id !== null && message.id > 0) {
            const parent = messages.get(message.parent_id);
            if (parent !== undefined)
                updateMessageReplyCount(parent);
        }
        const item = doc.createElement('article');
        item.className = message.parent_id === null ? 'chat-message' : 'chat-message chat-reply';
        item.dataset.messageId = String(message.id);
        item.tabIndex = -1;
        item.setAttribute('aria-keyshortcuts', 'j k ArrowUp ArrowDown Home End PageUp PageDown Enter r i');
        item.addEventListener('focusin', () => options.selectMessage(message.id, false));
        item.addEventListener('click', (event) => {
            if (!(event.target instanceof HTMLElement) || event.target.closest('button') === null) {
                options.selectMessage(message.id);
            }
        });
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
        authorDetails.append(author);
        if (message.author_role === 'guest')
            authorDetails.append(chatMessageMarker('client'));
        if (message.is_client_visible)
            authorDetails.append(chatMessageMarker('visible'));
        authorDetails.append(time);
        const reply = doc.createElement('button');
        reply.className = 'button button-quiet chat-reply-button';
        reply.type = 'button';
        reply.textContent = 'Reply';
        reply.disabled = isReadOnly();
        reply.addEventListener('click', () => {
            options.selectMessage(message.id, false);
            setReplyParent(message);
        });
        const createIssue = doc.createElement('button');
        createIssue.className = 'button button-quiet chat-create-issue-button';
        createIssue.type = 'button';
        createIssue.textContent = 'Create issue';
        createIssue.disabled = isReadOnly();
        createIssue.hidden = !issueActionsEnabled;
        createIssue.addEventListener('click', () => {
            options.selectMessage(message.id, false);
            if (activeId === null || currentProject()?.id !== activeId || !issueActionsEnabled)
                return;
            options.onCreateIssue(message, createIssue, activeId);
        });
        const actions = doc.createElement('div');
        actions.className = 'chat-message-actions';
        actions.append(reply, createIssue);
        heading.append(avatar, authorDetails, actions);
        const body = doc.createElement('p');
        body.className = 'chat-message-body';
        body.textContent = message.body;
        item.append(heading);
        if (message.parent_id !== null) {
            const parentMessage = messages.get(message.parent_id);
            const parentAuthor = message.parent_author_name ?? parentMessage?.author_name ?? null;
            const parentBody = message.parent_body ?? parentMessage?.body ?? null;
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
        const followingMessage = scrollToBottom ? null : Array.from(messageListElement.children).find((child) => {
            const existingId = Number(child.dataset.messageId);
            return Number.isFinite(existingId) && existingId > message.id;
        });
        messageListElement.insertBefore(item, followingMessage ?? null);
        updateMessageReplyCount(message);
        if (emptyState !== null)
            emptyState.hidden = true;
        if (scrollToBottom)
            scrollLatest();
        else
            updateLatestButton();
    }
    function updateMessageReplyCount(message) {
        const item = messageListElement?.querySelector(`.chat-message[data-message-id="${message.id}"]`);
        if (item === null || item === undefined)
            return;
        const replies = Array.from(messages.values()).filter((candidate) => candidate.id > 0 && candidate.parent_id === message.id);
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
    function isNearBottom() {
        if (messageListElement === null)
            return true;
        return messageListElement.scrollHeight - messageListElement.scrollTop - messageListElement.clientHeight <= 24;
    }
    function updateLatestButton() {
        if (latestButton !== null)
            latestButton.hidden = isNearBottom();
    }
    function scrollToBottom() {
        followLatest = true;
        if (messageListElement !== null)
            messageListElement.scrollTop = messageListElement.scrollHeight;
        updateLatestButton();
    }
    function scrollLatest() {
        if (messageListElement !== null)
            messageListElement.scrollTop = messageListElement.scrollHeight;
        followLatest = true;
        updateLatestButton();
    }
    async function focusMessageById(messageId) {
        const projectId = activeId;
        if (projectId === null || currentProject()?.id !== projectId || !Number.isSafeInteger(messageId) || messageId < 1)
            return;
        let sourceMessage = messageListElement?.querySelector(`.chat-message[data-message-id="${messageId}"]`) ?? null;
        if (sourceMessage === null) {
            try {
                const result = await request(`/projects/${projectId}/messages?since=${messageId - 1}`);
                if (currentProject()?.id !== projectId || activeId !== projectId)
                    return;
                for (const message of result.messages)
                    appendMessage(message);
                sourceMessage = messageListElement?.querySelector(`.chat-message[data-message-id="${messageId}"]`) ?? null;
            }
            catch (error) {
                options.report(error instanceof Error ? error.message : 'Could not open the replied-to message.', true);
                return;
            }
        }
        if (sourceMessage === null) {
            options.report('The replied-to message is unavailable in this project chat.', true);
            return;
        }
        messageListElement?.querySelector('.is-chat-source')?.classList.remove('is-chat-source');
        sourceMessage.classList.add('is-chat-source');
        sourceMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
        options.selectMessage(messageId);
    }
    function chatMessageMarker(kind) {
        const namespace = 'http://www.w3.org/2000/svg';
        const label = kind === 'client' ? 'Client message' : 'Visible to client';
        const marker = doc.createElementNS(namespace, 'svg');
        marker.classList.add('chat-message-marker', `is-${kind}`);
        marker.setAttribute('viewBox', '0 0 16 16');
        marker.setAttribute('role', 'img');
        marker.setAttribute('aria-label', label);
        marker.setAttribute('title', label);
        const shapes = kind === 'client'
            ? [
                { tag: 'circle', attrs: { cx: '8', cy: '5', r: '2.25' } },
                { tag: 'path', attrs: { d: 'M3 14c.45-2.5 2.15-3.8 5-3.8s4.55 1.3 5 3.8' } },
            ]
            : [
                { tag: 'path', attrs: { d: 'M1.5 8s2.2-4 6.5-4 6.5 4 6.5 4-2.2 4-6.5 4-6.5-4-6.5-4Z' } },
                { tag: 'circle', attrs: { cx: '8', cy: '8', r: '1.7' } },
            ];
        for (const shape of shapes) {
            const element = doc.createElementNS(namespace, shape.tag);
            for (const [name, value] of Object.entries(shape.attrs))
                element.setAttribute(name, value);
            element.setAttribute('fill', 'none');
            element.setAttribute('stroke', 'currentColor');
            element.setAttribute('stroke-width', '1.35');
            element.setAttribute('stroke-linecap', 'round');
            element.setAttribute('stroke-linejoin', 'round');
            marker.append(element);
        }
        return marker;
    }
    function setReplyParent(message) {
        const clientVisible = message.is_client_visible === true;
        replyParent = { id: message.id, name: message.author_name, body: message.body };
        if (replyHint !== null) {
            const replyContext = `Replying to ${message.author_name}: ${options.compactMessage(message.body)}`;
            replyHint.textContent = clientVisible ? `${replyContext}. Your reply will be visible to the guest.` : replyContext;
            replyHint.classList.toggle('is-client-visible', clientVisible);
            replyHint.hidden = false;
        }
        if (cancelReply !== null)
            cancelReply.hidden = false;
        input?.focus();
    }
    function clearReplyParent() {
        replyParent = null;
        if (replyHint !== null) {
            replyHint.hidden = true;
            replyHint.classList.remove('is-client-visible');
        }
        if (cancelReply !== null)
            cancelReply.hidden = true;
    }
    function updateMentionSuggestions() {
        if (input === null || mentionList === null || mentionDismissed)
            return;
        const query = findMentionQuery(input.value, input.selectionStart);
        if (query === null) {
            hideMentionSuggestions();
            return;
        }
        const members = chatMembers;
        const matches = filterMentionMembers(members, query.query, options.getUser()?.id ?? null);
        if (matches.length === 0) {
            mentionQuery = query;
            mentionMatches = [];
            mentionSelectedIndex = 0;
            const empty = doc.createElement('div');
            empty.className = 'chat-mention-empty';
            empty.setAttribute('role', 'option');
            empty.setAttribute('aria-disabled', 'true');
            empty.setAttribute('aria-selected', 'false');
            empty.textContent = mentionEmptyMessage(members, query.query, options.getUser()?.id ?? null);
            mentionList.replaceChildren(empty);
            mentionList.hidden = false;
            input.setAttribute('aria-expanded', 'true');
            input.removeAttribute('aria-activedescendant');
            return;
        }
        mentionQuery = query;
        mentionMatches = matches;
        mentionSelectedIndex = Math.min(mentionSelectedIndex, matches.length - 1);
        mentionList.replaceChildren(...matches.map((member, index) => {
            const option = doc.createElement('button');
            option.type = 'button';
            option.id = `chat-mention-option-${index}`;
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
        mentionList.hidden = false;
        input.setAttribute('aria-expanded', 'true');
        input.setAttribute('aria-activedescendant', `chat-mention-option-${mentionSelectedIndex}`);
    }
    function hideMentionSuggestions() {
        mentionQuery = null;
        mentionMatches = [];
        mentionSelectedIndex = 0;
        if (mentionList !== null) {
            mentionList.hidden = true;
            mentionList.replaceChildren();
        }
        input?.setAttribute('aria-expanded', 'false');
        input?.removeAttribute('aria-activedescendant');
    }
    function selectMention(member) {
        if (input === null || mentionQuery === null)
            return;
        const insertion = replaceMentionQuery(input.value, mentionQuery, member.name);
        input.value = insertion.value;
        input.setSelectionRange(insertion.cursor, insertion.cursor);
        mentionDismissed = true;
        hideMentionSuggestions();
        input.focus();
    }
    function handleChatMentionKeydown(event) {
        if (mentionList === null || mentionList.hidden || input === null)
            return false;
        return handleMentionKeydown(event, input, mentionList, mentionMatches, mentionSelectedIndex, (index) => { mentionSelectedIndex = index; }, selectMention, () => {
            mentionDismissed = true;
            hideMentionSuggestions();
        });
    }
    function create(projectId, context) {
        if (activeId === null)
            stopPresencePolling();
        else
            stop();
        const project = context?.project ?? options.getProject();
        if (project === null || project.id !== projectId) {
            throw new Error('The project chat context does not match the selected project.');
        }
        chatProject = project;
        chatMembers = context?.members ?? options.getMembers();
        issueActionsEnabled = context?.allowIssueActions ?? true;
        const section = doc.createElement('section');
        section.className = 'project-chat';
        const heading = doc.createElement('h3');
        heading.className = 'chat-heading';
        heading.tabIndex = -1;
        const channelName = doc.createElement('span');
        channelName.className = 'chat-channel-name';
        const channelHash = doc.createElement('span');
        channelHash.className = 'chat-channel-hash';
        channelHash.textContent = '#';
        const channelSlug = doc.createElement('span');
        channelSlug.textContent = project.slug;
        channelName.append(channelHash, channelSlug);
        const memberCount = doc.createElement('span');
        const members = chatMembers;
        memberCount.className = 'chat-members-count';
        memberCount.textContent = `${members.length} ${members.length === 1 ? 'member' : 'members'}`;
        const activity = doc.createElement('span');
        activity.className = 'chat-heading-activity';
        const nextPresenceIndicator = doc.createElement('span');
        nextPresenceIndicator.className = 'chat-presence is-unknown';
        nextPresenceIndicator.setAttribute('role', 'status');
        nextPresenceIndicator.setAttribute('aria-label', 'Checking project viewer status');
        nextPresenceIndicator.title = 'Checking project viewer status';
        const presenceLight = doc.createElement('span');
        presenceLight.className = 'login-power-light chat-presence-light is-off';
        presenceLight.setAttribute('aria-hidden', 'true');
        nextPresenceIndicator.append(presenceLight);
        activity.append(memberCount, nextPresenceIndicator);
        heading.append(channelName, activity);
        followLatest = true;
        initialHistorySettled = false;
        const nextMessageList = doc.createElement('div');
        nextMessageList.className = 'chat-message-list';
        messageListElement = nextMessageList;
        const nextEmptyState = doc.createElement('p');
        nextEmptyState.className = 'chat-empty-state';
        nextEmptyState.setAttribute('role', 'status');
        nextEmptyState.setAttribute('aria-live', 'polite');
        nextEmptyState.textContent = 'Loading messages…';
        emptyState = nextEmptyState;
        nextMessageList.append(nextEmptyState);
        const nextLatestButton = doc.createElement('button');
        nextLatestButton.className = 'chat-latest-button button button-quiet';
        nextLatestButton.type = 'button';
        nextLatestButton.textContent = '↓ Latest';
        nextLatestButton.setAttribute('aria-label', 'Scroll to latest message');
        nextLatestButton.hidden = true;
        nextLatestButton.addEventListener('click', scrollToBottom);
        latestButton = nextLatestButton;
        nextMessageList.addEventListener('scroll', () => {
            if (messageListElement !== nextMessageList)
                return;
            followLatest = isNearBottom();
            updateLatestButton();
        });
        const form = doc.createElement('form');
        form.className = 'chat-composer form-stack';
        mentionList = doc.createElement('div');
        mentionList.id = `chat-mention-suggestions-${projectId}`;
        mentionList.className = 'chat-mention-suggestions';
        mentionList.setAttribute('role', 'listbox');
        mentionList.setAttribute('aria-label', 'Mention a project member');
        mentionList.hidden = true;
        const label = doc.createElement('label');
        label.textContent = 'Message';
        input = doc.createElement('textarea');
        input.name = 'body';
        input.rows = 2;
        input.maxLength = 10_000;
        input.required = true;
        input.disabled = isReadOnly();
        input.placeholder = `Message #${project.slug}…`;
        input.setAttribute('aria-label', 'Message');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-controls', mentionList.id);
        input.setAttribute('aria-expanded', 'false');
        input.addEventListener('input', () => {
            mentionDismissed = false;
            updateMentionSuggestions();
        });
        input.addEventListener('click', updateMentionSuggestions);
        input.addEventListener('select', updateMentionSuggestions);
        input.addEventListener('keyup', updateMentionSuggestions);
        input.addEventListener('blur', hideMentionSuggestions);
        input.addEventListener('keydown', (event) => {
            if (!handleChatMentionKeydown(event))
                options.submitFormOnEnter(event, form);
        });
        label.append(input);
        replyHint = doc.createElement('p');
        replyHint.className = 'chat-reply-hint';
        replyHint.hidden = true;
        const actions = doc.createElement('div');
        actions.className = 'chat-composer-actions';
        cancelReply = doc.createElement('button');
        cancelReply.className = 'button button-quiet';
        cancelReply.type = 'button';
        cancelReply.textContent = 'Cancel reply';
        cancelReply.hidden = true;
        cancelReply.addEventListener('click', clearReplyParent);
        const send = doc.createElement('button');
        send.className = 'button button-primary';
        send.type = 'submit';
        send.textContent = 'Send';
        send.disabled = isReadOnly();
        sendButton = send;
        actions.append(cancelReply, send);
        form.append(mentionList, label, replyHint, actions);
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const body = input?.value.trim() ?? '';
            if (body === '')
                return;
            const messageBody = { body };
            if (replyParent !== null)
                messageBody.parent_id = replyParent.id;
            const optimisticId = -Date.now();
            const user = options.getUser();
            const optimisticMessage = {
                id: optimisticId,
                channel_id: 0,
                parent_id: messageBody.parent_id ?? null,
                author_id: user?.id ?? 0,
                author_name: user?.name ?? 'You',
                parent_author_name: replyParent?.name ?? null,
                parent_body: replyParent?.body ?? null,
                body,
                created_at: new Date().toISOString(),
            };
            if (activeId === projectId)
                appendMessage(optimisticMessage, true);
            send.disabled = true;
            try {
                const result = await request(`/projects/${projectId}/messages`, {
                    method: 'POST',
                    body: JSON.stringify(messageBody),
                });
                if (activeId === projectId) {
                    messageListElement?.querySelector(`[data-message-id="${optimisticId}"]`)?.remove();
                    messages.delete(optimisticId);
                    appendMessage(result.message);
                    scrollToBottom();
                    options.selectMessage(result.message.id, false);
                    if (input !== null)
                        input.value = '';
                    mentionDismissed = false;
                    hideMentionSuggestions();
                    clearReplyParent();
                    etag = null;
                    pollDelay = 1000;
                    schedulePoll(0);
                }
            }
            catch (error) {
                if (activeId === projectId) {
                    messageListElement?.querySelector(`[data-message-id="${optimisticId}"]`)?.remove();
                    messages.delete(optimisticId);
                    options.report(error instanceof Error ? error.message : 'Could not send the message.', true);
                }
            }
            finally {
                send.disabled = false;
            }
        });
        section.append(heading, nextMessageList, nextLatestButton, form);
        activeId = projectId;
        presenceIndicator = nextPresenceIndicator;
        options.onPresenceChange?.('checking');
        eventFeed.reset();
        etag = null;
        pollDelay = 1000;
        void pollPresence(projectId);
        void loadHistory(projectId);
        return section;
    }
    function resume() {
        const projectId = activeId;
        if (projectId === null)
            return;
        pollDelay = 1000;
        if (options.realtime?.isConnected())
            void pollChat(projectId);
        else
            schedulePoll(0);
        void pollPresence(projectId);
    }
    function setReadOnly(readOnly) {
        if (input !== null)
            input.disabled = readOnly;
        if (sendButton !== null)
            sendButton.disabled = readOnly;
    }
    const unbindRealtime = bindRealtimePolling({
        realtime: options.realtime,
        isActive: () => activeId !== null,
        pausePolling: () => {
            if (pollTimer !== null)
                window.clearTimeout(pollTimer);
            pollTimer = null;
        },
        resumePolling: () => schedulePoll(0),
        refresh: () => {
            const projectId = activeId;
            if (projectId !== null)
                void pollChat(projectId);
        },
    });
    return {
        create,
        stop,
        resume,
        activeProjectId,
        messageList,
        messagesById: () => messages,
        focusComposer: () => input?.focus(),
        isComposer: (target) => target === input,
        hasReplyParent: () => replyParent !== null,
        setReplyParent,
        clearReplyParent,
        setFollowLatest: (value) => { followLatest = value; },
        appendMessage,
        setReadOnly,
        dispose: () => {
            unbindRealtime();
            stop();
        },
    };
}
