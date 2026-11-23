import { visibleRowsInViewport } from './list-keyboard-ui.js';
export function initChatMessageNavigationUi(options) {
    function messages() {
        const list = options.getMessageList();
        if (list === null)
            return [];
        return Array.from(list.querySelectorAll('.chat-message'))
            .filter((message) => Number(message.dataset.messageId) > 0);
    }
    function select(id, focus = true) {
        const list = options.getMessageList();
        if (list === null)
            return;
        const item = list.querySelector(`.chat-message[data-message-id="${id}"]`);
        if (item === null)
            return;
        options.setSelectedMessageId(id);
        options.setFollowLatest(messages().at(-1) === item);
        list.querySelectorAll('.chat-message').forEach((message) => {
            message.classList.toggle('is-keyboard-selected', message === item);
        });
        if (focus)
            item.focus();
    }
    function move(direction) {
        const currentMessages = messages();
        if (currentMessages.length === 0) {
            options.focusComposer();
            return;
        }
        const currentIndex = currentMessages.findIndex((message) => Number(message.dataset.messageId) === options.getSelectedMessageId());
        const nextIndex = currentIndex < 0
            ? direction > 0 ? 0 : currentMessages.length - 1
            : Math.max(0, Math.min(currentMessages.length - 1, currentIndex + direction));
        const next = currentMessages[nextIndex];
        if (next !== undefined)
            select(Number(next.dataset.messageId));
    }
    function moveToBoundary(edge) {
        const currentMessages = messages();
        const target = currentMessages[edge === 'first' ? 0 : currentMessages.length - 1];
        if (target !== undefined)
            select(Number(target.dataset.messageId));
    }
    function moveByPage(direction) {
        const currentMessages = messages();
        const list = options.getMessageList();
        if (currentMessages.length === 0 || list === null)
            return;
        const currentIndex = currentMessages.findIndex((message) => Number(message.dataset.messageId) === options.getSelectedMessageId());
        const pageSize = Math.max(1, visibleRowsInViewport(currentMessages, list, '.chat-message') - 1);
        const baseIndex = currentIndex < 0
            ? direction > 0 ? 0 : Math.min(pageSize, currentMessages.length - 1)
            : currentIndex;
        const targetIndex = Math.max(0, Math.min(currentMessages.length - 1, baseIndex + direction * pageSize));
        const target = currentMessages[targetIndex];
        if (target !== undefined)
            select(Number(target.dataset.messageId));
    }
    return { messages, select, move, moveToBoundary, moveByPage };
}
