import { ApiFailure, api } from './api.js';
import { bindRealtimePolling, shouldUsePolling } from './realtime-polling.js';
import { shouldSubmitOnEnter } from './shortcuts.js';
export function initIssueDiscussionUi(options) {
    const doc = options.doc ?? document;
    const request = options.request ?? api;
    const issueDiscussionHeading = required('#issue-discussion-heading');
    const issueDiscussionCount = required('#issue-discussion-count');
    const issueDiscussionStatus = required('#issue-discussion-status');
    const issueDiscussionEmpty = required('#issue-discussion-empty');
    const issueDiscussionList = required('#issue-discussion-list');
    const issueDiscussionForm = required('#issue-discussion-form');
    const issueDiscussionInput = required('#issue-discussion-input');
    const issueDiscussionSubmit = required('#issue-discussion-submit');
    const issueDiscussionReplyContext = required('#issue-discussion-reply-context');
    const issueDiscussionReplyLabel = required('#issue-discussion-reply-label');
    const issueDiscussionReplyCancel = required('#issue-discussion-reply-cancel');
    const listeners = new AbortController();
    let issueDiscussionRequestVersion = 0;
    let issueDiscussionPollTimer = null;
    let issueDiscussionMessages = [];
    let selectedIssueDiscussionMessageId = null;
    let issueDiscussionParent = null;
    let editingIssueDiscussionMessageId = null;
    let confirmingIssueDiscussionDeleteId = null;
    function required(selector) {
        const element = doc.querySelector(selector);
        if (element === null)
            throw new Error(`Missing issue discussion element: ${selector}`);
        return element;
    }
    function stopIssueDiscussionPolling() {
        if (issueDiscussionPollTimer !== null)
            window.clearTimeout(issueDiscussionPollTimer);
        issueDiscussionPollTimer = null;
        issueDiscussionRequestVersion += 1;
    }
    function clearIssueDiscussion() {
        stopIssueDiscussionPolling();
        issueDiscussionMessages = [];
        selectedIssueDiscussionMessageId = null;
        editingIssueDiscussionMessageId = null;
        confirmingIssueDiscussionDeleteId = null;
        issueDiscussionList.replaceChildren();
        issueDiscussionInput.value = '';
        issueDiscussionStatus.textContent = '';
        clearIssueDiscussionReply();
        renderIssueDiscussion();
    }
    function scheduleIssueDiscussionPoll(issueId, delay = 5_000) {
        if (issueDiscussionPollTimer !== null)
            window.clearTimeout(issueDiscussionPollTimer);
        issueDiscussionPollTimer = null;
        if (options.getIssue()?.id !== issueId || !options.isDetailVisible())
            return;
        if (!shouldUsePolling(options.realtime))
            return;
        issueDiscussionPollTimer = window.setTimeout(() => {
            issueDiscussionPollTimer = null;
            void loadIssueDiscussion(issueId, false);
        }, delay);
    }
    async function loadIssueDiscussion(issueId, showLoading = true) {
        const requestVersion = ++issueDiscussionRequestVersion;
        if (showLoading)
            issueDiscussionStatus.textContent = 'Loading discussion…';
        try {
            const result = await request(`/issues/${issueId}/discussion`);
            if (requestVersion !== issueDiscussionRequestVersion || options.getIssue()?.id !== issueId)
                return;
            const changed = result.messages.length !== issueDiscussionMessages.length
                || result.messages.some((message, index) => {
                    const current = issueDiscussionMessages[index];
                    return current === undefined || current.id !== message.id || current.body !== message.body
                        || current.parent_id !== message.parent_id;
                });
            issueDiscussionMessages = result.messages;
            issueDiscussionStatus.textContent = '';
            options.onDiscussionCountChanged(issueId, result.messages.length);
            if (changed)
                renderIssueDiscussion();
        }
        catch (error) {
            if (requestVersion !== issueDiscussionRequestVersion || options.getIssue()?.id !== issueId)
                return;
            if (error instanceof ApiFailure && error.status === 401) {
                options.onUnauthorized();
                return;
            }
            issueDiscussionStatus.textContent = error instanceof Error ? error.message : 'Could not load the discussion.';
        }
        finally {
            scheduleIssueDiscussionPoll(issueId);
        }
    }
    function renderIssueDiscussion() {
        issueDiscussionCount.textContent = String(issueDiscussionMessages.length);
        issueDiscussionEmpty.hidden = issueDiscussionMessages.length > 0;
        const existing = new Map(Array.from(issueDiscussionList.querySelectorAll('.issue-discussion-message'))
            .map((item) => [Number(item.dataset.messageId), item]));
        for (const message of issueDiscussionMessages) {
            const canEdit = canEditIssueDiscussionMessage(message);
            const isEditing = canEdit && editingIssueDiscussionMessageId === message.id;
            const isConfirmingDelete = canEdit && confirmingIssueDiscussionDeleteId === message.id;
            const signature = JSON.stringify([message, canEdit, isEditing, isConfirmingDelete]);
            const current = existing.get(message.id);
            if (current?.dataset.renderSignature === signature) {
                existing.delete(message.id);
                continue;
            }
            const item = createIssueDiscussionMessage(message, canEdit, isEditing, isConfirmingDelete);
            item.dataset.renderSignature = signature;
            if (current !== undefined) {
                const oldEditInput = current.querySelector('[data-discussion-edit-input]');
                const newEditInput = item.querySelector('[data-discussion-edit-input]');
                if (oldEditInput !== null && newEditInput !== null && isEditing)
                    newEditInput.value = oldEditInput.value;
                current.replaceWith(item);
                existing.delete(message.id);
            }
            else {
                issueDiscussionList.append(item);
            }
        }
        existing.forEach((item) => item.remove());
    }
    function canEditIssueDiscussionMessage(message) {
        const user = options.getUser();
        const project = options.getProject();
        return user !== null
            && message.author_id === user.id
            && (message.author_agent_id === undefined || message.author_agent_id === null)
            && issueDiscussionMessages.at(-1)?.id === message.id
            && project !== null
            && !options.isProjectReadOnly(project);
    }
    function issueDiscussionMessageElements() {
        return Array.from(issueDiscussionList.querySelectorAll('.issue-discussion-message'));
    }
    function selectIssueDiscussionMessage(id, focus = true) {
        const item = issueDiscussionList.querySelector(`.issue-discussion-message[data-message-id="${id}"]`);
        if (item === null)
            return;
        selectedIssueDiscussionMessageId = id;
        issueDiscussionMessageElements().forEach((message) => {
            message.classList.toggle('is-keyboard-selected', message === item);
        });
        if (focus)
            item.focus();
    }
    function moveIssueDiscussionSelection(direction) {
        const messages = issueDiscussionMessageElements();
        if (messages.length === 0) {
            issueDiscussionInput.focus();
            return;
        }
        const currentIndex = messages.findIndex((message) => Number(message.dataset.messageId) === selectedIssueDiscussionMessageId);
        const nextIndex = currentIndex < 0
            ? direction > 0 ? 0 : messages.length - 1
            : Math.max(0, Math.min(messages.length - 1, currentIndex + direction));
        const next = messages[nextIndex];
        if (next !== undefined)
            selectIssueDiscussionMessage(Number(next.dataset.messageId));
    }
    function moveIssueDiscussionSelectionToBoundary(edge) {
        const messages = issueDiscussionMessageElements();
        const target = messages[edge === 'first' ? 0 : messages.length - 1];
        if (target !== undefined)
            selectIssueDiscussionMessage(Number(target.dataset.messageId));
    }
    function moveIssueDiscussionSelectionByPage(direction) {
        const messages = issueDiscussionMessageElements();
        if (messages.length === 0) {
            issueDiscussionInput.focus();
            return;
        }
        const currentIndex = messages.findIndex((message) => Number(message.dataset.messageId) === selectedIssueDiscussionMessageId);
        const pageSize = Math.max(1, options.getPageSize(messages) - 1);
        const baseIndex = currentIndex < 0
            ? direction > 0 ? 0 : Math.min(pageSize, messages.length - 1)
            : currentIndex;
        const targetIndex = Math.max(0, Math.min(messages.length - 1, baseIndex + direction * pageSize));
        const target = messages[targetIndex];
        if (target !== undefined)
            selectIssueDiscussionMessage(Number(target.dataset.messageId));
    }
    function replyToSelectedIssueDiscussionMessage() {
        if (selectedIssueDiscussionMessageId === null)
            return;
        const message = issueDiscussionMessages.find((candidate) => candidate.id === selectedIssueDiscussionMessageId);
        if (message !== undefined)
            setIssueDiscussionReply(message);
    }
    function createIssueDiscussionMessage(message, canEdit, isEditing, isConfirmingDelete) {
        const item = doc.createElement('li');
        item.className = `issue-discussion-message${message.parent_id === null ? '' : ' is-reply'}`;
        item.dataset.messageId = String(message.id);
        item.tabIndex = -1;
        item.setAttribute('aria-keyshortcuts', 'j k ArrowUp ArrowDown Home End PageUp PageDown Enter r');
        item.addEventListener('focusin', () => selectIssueDiscussionMessage(message.id, false));
        item.addEventListener('click', (event) => {
            if (!(event.target instanceof HTMLElement) || event.target.closest('button') === null) {
                selectIssueDiscussionMessage(message.id);
            }
        });
        const avatar = doc.createElement('span');
        avatar.className = 'chat-message-avatar';
        avatar.setAttribute('aria-hidden', 'true');
        avatar.textContent = options.avatarInitials(message.author_name);
        item.append(avatar);
        if (message.parent_id !== null && message.parent_body !== null) {
            const parent = doc.createElement('button');
            parent.type = 'button';
            parent.className = 'button button-quiet issue-discussion-parent';
            parent.textContent = `↳ ${message.parent_author_name ?? 'Earlier message'}: ${message.parent_body.slice(0, 100)}`;
            parent.addEventListener('click', () => {
                const parentMessage = issueDiscussionList.querySelector(`[data-message-id="${message.parent_id}"]`);
                parentMessage?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                parentMessage?.focus();
            });
            item.append(parent);
        }
        const heading = doc.createElement('header');
        heading.className = 'issue-discussion-message-heading';
        if (message.author_agent_id !== undefined && message.author_agent_id !== null) {
            const agentMarker = doc.createElement('span');
            agentMarker.className = 'issue-discussion-agent-marker';
            agentMarker.setAttribute('role', 'img');
            agentMarker.setAttribute('aria-label', 'Coding agent');
            agentMarker.title = 'Coding agent';
            heading.append(agentMarker);
        }
        const author = doc.createElement('span');
        author.className = 'issue-discussion-author';
        author.textContent = message.author_name;
        const time = doc.createElement('time');
        time.dateTime = message.created_at.replace(' ', 'T');
        const parsedDate = new Date(message.created_at.replace(' ', 'T'));
        time.textContent = Number.isNaN(parsedDate.getTime())
            ? message.created_at
            : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(parsedDate);
        const reply = doc.createElement('button');
        reply.type = 'button';
        reply.className = 'button button-quiet issue-discussion-reply-button';
        reply.textContent = 'Reply';
        const project = options.getProject();
        reply.disabled = project !== null && options.isProjectReadOnly(project);
        reply.setAttribute('aria-label', `Reply to ${message.author_name}`);
        reply.addEventListener('click', () => setIssueDiscussionReply(message));
        const actions = doc.createElement('div');
        actions.className = 'issue-discussion-actions';
        actions.append(reply);
        if (canEdit && isEditing) {
            reply.hidden = true;
        }
        else if (canEdit && isConfirmingDelete) {
            const prompt = doc.createElement('span');
            prompt.className = 'issue-discussion-delete-prompt';
            prompt.textContent = 'Delete this message?';
            const confirm = doc.createElement('button');
            confirm.type = 'button';
            confirm.className = 'button button-quiet issue-discussion-delete-confirm';
            confirm.textContent = 'Delete';
            confirm.dataset.discussionDelete = '';
            confirm.addEventListener('click', () => void deleteIssueDiscussionMessage(message.id, confirm));
            const cancel = doc.createElement('button');
            cancel.type = 'button';
            cancel.className = 'button button-quiet issue-discussion-action';
            cancel.textContent = 'Cancel';
            cancel.addEventListener('click', () => {
                confirmingIssueDiscussionDeleteId = null;
                renderIssueDiscussion();
                issueDiscussionList.querySelector(`[data-message-id="${message.id}"] [data-discussion-delete-begin]`)?.focus();
            });
            actions.append(prompt, confirm, cancel);
        }
        else if (canEdit) {
            const edit = doc.createElement('button');
            edit.type = 'button';
            edit.className = 'button button-quiet issue-discussion-action';
            edit.textContent = 'Edit';
            edit.dataset.discussionEdit = '';
            edit.setAttribute('aria-label', `Edit your message from ${message.author_name}`);
            edit.addEventListener('click', () => {
                editingIssueDiscussionMessageId = message.id;
                confirmingIssueDiscussionDeleteId = null;
                renderIssueDiscussion();
                issueDiscussionList.querySelector(`[data-message-id="${message.id}"] [data-discussion-edit-input]`)?.focus();
            });
            const remove = doc.createElement('button');
            remove.type = 'button';
            remove.className = 'button button-quiet issue-discussion-action';
            remove.textContent = 'Delete';
            remove.dataset.discussionDeleteBegin = '';
            remove.setAttribute('aria-label', `Delete your message from ${message.author_name}`);
            remove.addEventListener('click', () => {
                confirmingIssueDiscussionDeleteId = message.id;
                editingIssueDiscussionMessageId = null;
                renderIssueDiscussion();
                issueDiscussionList.querySelector(`[data-message-id="${message.id}"] [data-discussion-delete]`)?.focus();
            });
            actions.append(edit, remove);
        }
        heading.append(author, time, actions);
        if (canEdit && isEditing) {
            const form = doc.createElement('form');
            form.className = 'issue-discussion-edit-form';
            const label = doc.createElement('label');
            const inputId = `issue-discussion-edit-input-${message.id}`;
            label.htmlFor = inputId;
            label.textContent = 'Edit message';
            const input = doc.createElement('textarea');
            input.id = inputId;
            input.rows = 3;
            input.maxLength = 10_000;
            input.required = true;
            input.value = message.body;
            input.dataset.discussionEditInput = '';
            const formActions = doc.createElement('div');
            formActions.className = 'form-actions';
            const cancel = doc.createElement('button');
            cancel.type = 'button';
            cancel.className = 'button button-quiet';
            cancel.textContent = 'Cancel';
            cancel.addEventListener('click', () => {
                editingIssueDiscussionMessageId = null;
                renderIssueDiscussion();
                issueDiscussionList.querySelector(`[data-message-id="${message.id}"] [data-discussion-edit]`)?.focus();
            });
            const save = doc.createElement('button');
            save.type = 'submit';
            save.className = 'button button-primary';
            save.textContent = 'Save';
            formActions.append(cancel, save);
            form.append(label, input, formActions);
            form.addEventListener('submit', (event) => {
                event.preventDefault();
                void saveIssueDiscussionMessage(message.id, input.value, save);
            });
            item.append(heading, form);
        }
        else {
            const body = doc.createElement('p');
            body.className = 'issue-discussion-body';
            body.textContent = message.body;
            item.append(heading, body);
        }
        return item;
    }
    async function saveIssueDiscussionMessage(messageId, body, button) {
        const issueId = options.getIssue()?.id;
        if (issueId === undefined || body.trim() === '')
            return;
        button.disabled = true;
        try {
            const result = await request(`/issues/${issueId}/discussion/${messageId}`, {
                method: 'PATCH',
                body: JSON.stringify({ body }),
            });
            if (options.getIssue()?.id !== issueId)
                return;
            issueDiscussionMessages = issueDiscussionMessages.map((message) => message.id === messageId ? result.message : message);
            editingIssueDiscussionMessageId = null;
            issueDiscussionStatus.textContent = 'Message updated.';
            renderIssueDiscussion();
            issueDiscussionList.querySelector(`[data-message-id="${messageId}"] [data-discussion-edit]`)?.focus();
        }
        catch (error) {
            issueDiscussionStatus.textContent = error instanceof Error ? error.message : 'Could not update the message.';
        }
        finally {
            button.disabled = false;
        }
    }
    async function deleteIssueDiscussionMessage(messageId, button) {
        const issueId = options.getIssue()?.id;
        if (issueId === undefined)
            return;
        button.disabled = true;
        try {
            await request(`/issues/${issueId}/discussion/${messageId}`, { method: 'DELETE' });
            if (options.getIssue()?.id !== issueId)
                return;
            issueDiscussionMessages = issueDiscussionMessages.filter((message) => message.id !== messageId);
            confirmingIssueDiscussionDeleteId = null;
            options.onDiscussionCountChanged(issueId, issueDiscussionMessages.length);
            issueDiscussionStatus.textContent = 'Message deleted.';
            renderIssueDiscussion();
            const latest = issueDiscussionMessages.at(-1);
            if (latest === undefined)
                issueDiscussionHeading.focus();
            else
                selectIssueDiscussionMessage(latest.id);
        }
        catch (error) {
            issueDiscussionStatus.textContent = error instanceof Error ? error.message : 'Could not delete the message.';
        }
        finally {
            button.disabled = false;
        }
    }
    function setIssueDiscussionReply(message) {
        selectIssueDiscussionMessage(message.id, false);
        issueDiscussionParent = message;
        const excerpt = message.body.length > 100 ? `${message.body.slice(0, 100)}…` : message.body;
        issueDiscussionReplyLabel.textContent = `Replying to ${message.author_name}: ${excerpt}`;
        issueDiscussionReplyContext.hidden = false;
        issueDiscussionInput.focus();
    }
    function clearIssueDiscussionReply() {
        issueDiscussionParent = null;
        issueDiscussionReplyLabel.textContent = '';
        issueDiscussionReplyContext.hidden = true;
    }
    async function postIssueDiscussionMessage(event) {
        event.preventDefault();
        const issueId = options.getIssue()?.id;
        const body = issueDiscussionInput.value.trim();
        if (issueId === undefined || body === '')
            return;
        const parentId = issueDiscussionParent?.id ?? null;
        issueDiscussionSubmit.disabled = true;
        issueDiscussionStatus.textContent = '';
        try {
            const result = await request(`/issues/${issueId}/discussion`, {
                method: 'POST',
                body: JSON.stringify({ body, parent_id: parentId }),
            });
            if (options.getIssue()?.id !== issueId)
                return;
            issueDiscussionMessages.push(result.message);
            editingIssueDiscussionMessageId = null;
            confirmingIssueDiscussionDeleteId = null;
            options.onDiscussionCountChanged(issueId, issueDiscussionMessages.length);
            renderIssueDiscussion();
            if (issueDiscussionInput.value.trim() === body)
                issueDiscussionInput.value = '';
            if (issueDiscussionParent?.id === parentId)
                clearIssueDiscussionReply();
            issueDiscussionList.querySelector(`[data-message-id="${result.message.id}"]`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            issueDiscussionInput.focus();
        }
        catch (error) {
            if (error instanceof ApiFailure && error.status === 401) {
                options.onUnauthorized();
                return;
            }
            issueDiscussionStatus.textContent = error instanceof Error ? error.message : 'Could not send the message.';
        }
        finally {
            issueDiscussionSubmit.disabled = false;
        }
    }
    issueDiscussionInput.addEventListener('keydown', (event) => {
        if (!shouldSubmitOnEnter(event.key, event.shiftKey, event.isComposing))
            return;
        event.preventDefault();
        issueDiscussionForm.requestSubmit();
    }, { signal: listeners.signal });
    issueDiscussionForm.addEventListener('submit', (event) => void postIssueDiscussionMessage(event), { signal: listeners.signal });
    issueDiscussionReplyCancel.addEventListener('click', clearIssueDiscussionReply, { signal: listeners.signal });
    const unbindRealtime = bindRealtimePolling({
        realtime: options.realtime,
        isActive: () => options.getIssue() !== null && options.isDetailVisible(),
        pausePolling: stopIssueDiscussionPolling,
        resumePolling: () => {
            const issueId = options.getIssue()?.id;
            if (issueId !== undefined)
                scheduleIssueDiscussionPoll(issueId, 0);
        },
        refresh: () => {
            const issueId = options.getIssue()?.id;
            if (issueId !== undefined)
                void loadIssueDiscussion(issueId, false);
        },
    });
    return {
        stopPolling: stopIssueDiscussionPolling,
        clear: clearIssueDiscussion,
        schedulePoll: scheduleIssueDiscussionPoll,
        load: loadIssueDiscussion,
        render: renderIssueDiscussion,
        isMessageTarget: (target) => target instanceof HTMLElement && target.closest('.issue-discussion-message') !== null,
        hasSelectedMessage: () => selectedIssueDiscussionMessageId !== null
            && issueDiscussionMessages.some((message) => message.id === selectedIssueDiscussionMessageId),
        isComposer: (element) => element === issueDiscussionInput,
        focusComposer: () => issueDiscussionInput.focus(),
        setReadOnly: (readOnly) => {
            issueDiscussionInput.disabled = readOnly;
            issueDiscussionSubmit.disabled = readOnly;
            issueDiscussionReplyCancel.disabled = readOnly;
        },
        focusSelectedMessageOrLatest: () => {
            const selected = selectedIssueDiscussionMessageId === null
                ? null
                : issueDiscussionList.querySelector(`.issue-discussion-message[data-message-id="${selectedIssueDiscussionMessageId}"]`);
            const latest = issueDiscussionMessageElements().at(-1) ?? null;
            const target = selected ?? latest;
            if (target !== null)
                selectIssueDiscussionMessage(Number(target.dataset.messageId));
            else
                issueDiscussionHeading.focus();
        },
        moveSelection: moveIssueDiscussionSelection,
        moveSelectionToBoundary: moveIssueDiscussionSelectionToBoundary,
        moveSelectionByPage: moveIssueDiscussionSelectionByPage,
        replyToSelected: replyToSelectedIssueDiscussionMessage,
        clearReply: clearIssueDiscussionReply,
        dispose: () => {
            unbindRealtime();
            listeners.abort();
            stopIssueDiscussionPolling();
        },
    };
}
