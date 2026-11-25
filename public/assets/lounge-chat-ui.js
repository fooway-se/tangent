import { ApiFailure, api, apiBaseUrl } from './api.js';
import { bindRealtimePolling, shouldUsePolling } from './realtime-polling.js';
import { filterMentionMembers, findMentionQuery, mentionEmptyMessage, replaceMentionQuery, splitMentions, } from './chat-mentions.js';
import { handleMentionKeydown as handleMentionKeydownUi } from './chat-mentions-ui.js';
import { splitChatSmilies } from './chat-smilies.js';
import { formatChatTimestamp } from './chat-time.js';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const smileyLabels = {
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
    sushi: 'sushi',
    chinese: 'Chinese takeout',
};
const smileyShapes = {
    smile: [
        { tag: 'circle', attributes: { cx: '12', cy: '12', r: '10.5', class: 'chat-smiley-outline' } },
        { tag: 'path', attributes: { d: 'M1.7 14A10.5 10.5 0 0 0 22.3 14A12 12 0 0 1 1.7 14z', class: 'chat-smiley-shade' } },
        { tag: 'path', attributes: { d: 'M5.6 7.4C6.6 4.9 9 3.7 11.2 3.6c-2.6.8-4.3 2.2-5 4.3z', class: 'chat-smiley-gloss' } },
        { tag: 'circle', attributes: { cx: '8.3', cy: '9', r: '1.35', class: 'chat-smiley-dot' } },
        { tag: 'circle', attributes: { cx: '15.7', cy: '9', r: '1.35', class: 'chat-smiley-dot' } },
        { tag: 'path', attributes: { d: 'M7 14.5 Q12 19.5 17 14.5', class: 'chat-smiley-feature' } },
        { tag: 'path', attributes: { d: 'M6.4 12.4v4.6', class: 'chat-smiley-glint' } },
    ],
    wink: [
        { tag: 'circle', attributes: { cx: '12', cy: '12', r: '10.5', class: 'chat-smiley-outline' } },
        { tag: 'path', attributes: { d: 'M1.7 14A10.5 10.5 0 0 0 22.3 14A12 12 0 0 1 1.7 14z', class: 'chat-smiley-shade' } },
        { tag: 'path', attributes: { d: 'M5.6 7.4C6.6 4.9 9 3.7 11.2 3.6c-2.6.8-4.3 2.2-5 4.3z', class: 'chat-smiley-gloss' } },
        { tag: 'path', attributes: { d: 'M6.6 9.7Q8.3 7.3 10 9.7', class: 'chat-smiley-feature' } },
        { tag: 'circle', attributes: { cx: '15.7', cy: '9', r: '1.35', class: 'chat-smiley-dot' } },
        { tag: 'path', attributes: { d: 'M7 14.5 Q12 19.5 17 14.5', class: 'chat-smiley-feature' } },
    ],
    frown: [
        { tag: 'circle', attributes: { cx: '12', cy: '12', r: '10.5', class: 'chat-smiley-outline' } },
        { tag: 'path', attributes: { d: 'M1.7 14A10.5 10.5 0 0 0 22.3 14A12 12 0 0 1 1.7 14z', class: 'chat-smiley-shade' } },
        { tag: 'path', attributes: { d: 'M5.6 7.4C6.6 4.9 9 3.7 11.2 3.6c-2.6.8-4.3 2.2-5 4.3z', class: 'chat-smiley-gloss' } },
        { tag: 'circle', attributes: { cx: '8.3', cy: '9', r: '1.35', class: 'chat-smiley-dot' } },
        { tag: 'circle', attributes: { cx: '15.7', cy: '9', r: '1.35', class: 'chat-smiley-dot' } },
        { tag: 'path', attributes: { d: 'M7 17.5 Q12 12.5 17 17.5', class: 'chat-smiley-feature' } },
    ],
    grin: [
        { tag: 'circle', attributes: { cx: '12', cy: '12', r: '10.5', class: 'chat-smiley-outline' } },
        { tag: 'path', attributes: { d: 'M1.7 14A10.5 10.5 0 0 0 22.3 14A12 12 0 0 1 1.7 14z', class: 'chat-smiley-shade' } },
        { tag: 'path', attributes: { d: 'M5.6 7.4C6.6 4.9 9 3.7 11.2 3.6c-2.6.8-4.3 2.2-5 4.3z', class: 'chat-smiley-gloss' } },
        { tag: 'circle', attributes: { cx: '8.3', cy: '9', r: '1.35', class: 'chat-smiley-dot' } },
        { tag: 'circle', attributes: { cx: '15.7', cy: '9', r: '1.35', class: 'chat-smiley-dot' } },
        { tag: 'path', attributes: { d: 'M6.5 13.8h11v1.7a5.5 5.5 0 0 1-11 0z', class: 'chat-smiley-mouth' } },
        { tag: 'path', attributes: { d: 'M7.6 13.8h8.8v1.5H7.6z', class: 'chat-smiley-teeth' } },
    ],
    tongue: [
        { tag: 'circle', attributes: { cx: '12', cy: '12', r: '10.5', class: 'chat-smiley-outline' } },
        { tag: 'path', attributes: { d: 'M1.7 14A10.5 10.5 0 0 0 22.3 14A12 12 0 0 1 1.7 14z', class: 'chat-smiley-shade' } },
        { tag: 'path', attributes: { d: 'M5.6 7.4C6.6 4.9 9 3.7 11.2 3.6c-2.6.8-4.3 2.2-5 4.3z', class: 'chat-smiley-gloss' } },
        { tag: 'circle', attributes: { cx: '8.3', cy: '9', r: '1.35', class: 'chat-smiley-dot' } },
        { tag: 'circle', attributes: { cx: '15.7', cy: '9', r: '1.35', class: 'chat-smiley-dot' } },
        { tag: 'path', attributes: { d: 'M6.5 13.8h11v1.6a5.5 5.5 0 0 1-11 0z', class: 'chat-smiley-mouth' } },
        { tag: 'path', attributes: { d: 'M9.3 15.4h5.4v3.7a2.7 2.7 0 0 1-5.4 0z', class: 'chat-smiley-tongue' } },
    ],
    neutral: [
        { tag: 'circle', attributes: { cx: '12', cy: '12', r: '10.5', class: 'chat-smiley-outline' } },
        { tag: 'path', attributes: { d: 'M1.7 14A10.5 10.5 0 0 0 22.3 14A12 12 0 0 1 1.7 14z', class: 'chat-smiley-shade' } },
        { tag: 'path', attributes: { d: 'M5.6 7.4C6.6 4.9 9 3.7 11.2 3.6c-2.6.8-4.3 2.2-5 4.3z', class: 'chat-smiley-gloss' } },
        { tag: 'circle', attributes: { cx: '8.3', cy: '9', r: '1.35', class: 'chat-smiley-dot' } },
        { tag: 'circle', attributes: { cx: '15.7', cy: '9', r: '1.35', class: 'chat-smiley-dot' } },
        { tag: 'path', attributes: { d: 'M7.5 15.5h9', class: 'chat-smiley-feature' } },
    ],
    surprised: [
        { tag: 'circle', attributes: { cx: '12', cy: '12', r: '10.5', class: 'chat-smiley-outline' } },
        { tag: 'path', attributes: { d: 'M1.7 14A10.5 10.5 0 0 0 22.3 14A12 12 0 0 1 1.7 14z', class: 'chat-smiley-shade' } },
        { tag: 'path', attributes: { d: 'M5.6 7.4C6.6 4.9 9 3.7 11.2 3.6c-2.6.8-4.3 2.2-5 4.3z', class: 'chat-smiley-gloss' } },
        { tag: 'path', attributes: { d: 'M6.6 5.7Q8.3 4.5 10 5.7m4 0Q15.7 4.5 17.4 5.7', class: 'chat-smiley-brow' } },
        { tag: 'circle', attributes: { cx: '8.3', cy: '9.3', r: '1.45', class: 'chat-smiley-dot' } },
        { tag: 'circle', attributes: { cx: '15.7', cy: '9.3', r: '1.45', class: 'chat-smiley-dot' } },
        { tag: 'path', attributes: { d: 'M12 13.1a1.9 2.6 0 1 0 0 5.2a1.9 2.6 0 1 0 0-5.2z', class: 'chat-smiley-mouth' } },
    ],
    uncertain: [
        { tag: 'circle', attributes: { cx: '12', cy: '12', r: '10.5', class: 'chat-smiley-outline' } },
        { tag: 'path', attributes: { d: 'M1.7 14A10.5 10.5 0 0 0 22.3 14A12 12 0 0 1 1.7 14z', class: 'chat-smiley-shade' } },
        { tag: 'path', attributes: { d: 'M5.6 7.4C6.6 4.9 9 3.7 11.2 3.6c-2.6.8-4.3 2.2-5 4.3z', class: 'chat-smiley-gloss' } },
        { tag: 'path', attributes: { d: 'M13.4 6.1Q15.5 4.9 17.7 6.3', class: 'chat-smiley-brow' } },
        { tag: 'circle', attributes: { cx: '8.3', cy: '9', r: '1.35', class: 'chat-smiley-dot' } },
        { tag: 'circle', attributes: { cx: '15.7', cy: '9', r: '1.35', class: 'chat-smiley-dot' } },
        { tag: 'path', attributes: { d: 'M6.8 15.8c1.7-2 3.4-2 5.2 0s3.5 2 5.2 0', class: 'chat-smiley-feature' } },
    ],
    crying: [
        { tag: 'circle', attributes: { cx: '12', cy: '12', r: '10.5', class: 'chat-smiley-outline' } },
        { tag: 'path', attributes: { d: 'M1.7 14A10.5 10.5 0 0 0 22.3 14A12 12 0 0 1 1.7 14z', class: 'chat-smiley-shade' } },
        { tag: 'path', attributes: { d: 'M5.6 7.4C6.6 4.9 9 3.7 11.2 3.6c-2.6.8-4.3 2.2-5 4.3z', class: 'chat-smiley-gloss' } },
        { tag: 'circle', attributes: { cx: '8.3', cy: '9', r: '1.35', class: 'chat-smiley-dot' } },
        { tag: 'circle', attributes: { cx: '15.7', cy: '9', r: '1.35', class: 'chat-smiley-dot' } },
        { tag: 'path', attributes: { d: 'M7 17.5 Q12 12.5 17 17.5', class: 'chat-smiley-feature' } },
        { tag: 'path', attributes: { d: 'M15.9 10.9c-1.2 1.7-2 2.5-2 3.7a2 2 0 0 0 4 0c0-1.2-.8-2-2-3.7z', class: 'chat-smiley-tear' } },
        { tag: 'path', attributes: { d: 'M8.1 10.7v3', class: 'chat-smiley-tear-trail' } },
    ],
    angry: [
        { tag: 'circle', attributes: { cx: '12', cy: '12', r: '10.5', class: 'chat-smiley-outline' } },
        { tag: 'path', attributes: { d: 'M1.7 14A10.5 10.5 0 0 0 22.3 14A12 12 0 0 1 1.7 14z', class: 'chat-smiley-shade' } },
        { tag: 'path', attributes: { d: 'M5.6 7.4C6.6 4.9 9 3.7 11.2 3.6c-2.6.8-4.3 2.2-5 4.3z', class: 'chat-smiley-gloss' } },
        { tag: 'path', attributes: { d: 'M6.4 6.9 10.4 9.2m7.2-2.3L13.6 9.2', class: 'chat-smiley-brow' } },
        { tag: 'circle', attributes: { cx: '8.6', cy: '10.8', r: '1.3', class: 'chat-smiley-dot' } },
        { tag: 'circle', attributes: { cx: '15.4', cy: '10.8', r: '1.3', class: 'chat-smiley-dot' } },
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
        { tag: 'path', attributes: { d: 'M5.6 8.2c.7-2.1 2.3-3 4-3.2', class: 'chat-smiley-glint' } },
    ],
    sushi: [
        { tag: 'path', attributes: { d: 'M6.68 5.94 12.68 3.54A7.6 7.6 0 0 1 18.32 17.66L12.32 20.06z', class: 'chat-smiley-nori' } },
        { tag: 'circle', attributes: { cx: '15.5', cy: '10.6', r: '7.6', class: 'chat-smiley-nori' } },
        { tag: 'circle', attributes: { cx: '9.5', cy: '13', r: '7.6', class: 'chat-smiley-nori' } },
        { tag: 'path', attributes: { d: 'M15.8 8.1 19.6 6.6m-3.4 8.4 4.7-1.9', class: 'chat-smiley-glint' } },
        { tag: 'circle', attributes: { cx: '9.5', cy: '13', r: '6.8', class: 'chat-smiley-rice-face' } },
        { tag: 'circle', attributes: { cx: '5.4', cy: '10.4', r: '0.5', class: 'chat-smiley-rice' } },
        { tag: 'circle', attributes: { cx: '6', cy: '16.4', r: '0.5', class: 'chat-smiley-rice' } },
        { tag: 'circle', attributes: { cx: '13.6', cy: '9.6', r: '0.5', class: 'chat-smiley-rice' } },
        { tag: 'circle', attributes: { cx: '13.8', cy: '16.8', r: '0.5', class: 'chat-smiley-rice' } },
        { tag: 'circle', attributes: { cx: '9.4', cy: '7.9', r: '0.5', class: 'chat-smiley-rice' } },
        { tag: 'circle', attributes: { cx: '9.6', cy: '18.5', r: '0.5', class: 'chat-smiley-rice' } },
        { tag: 'circle', attributes: { cx: '9.5', cy: '13', r: '3.2', class: 'chat-smiley-fish' } },
        { tag: 'circle', attributes: { cx: '10.9', cy: '14.4', r: '1.4', class: 'chat-smiley-filling' } },
    ],
    chinese: [
        { tag: 'path', attributes: { d: 'M4.6 9.2h14.8l-2.1 11.7a1.6 1.6 0 0 1-1.6 1.3H8.3a1.6 1.6 0 0 1-1.6-1.3z', class: 'chat-smiley-icon-line' } },
        { tag: 'path', attributes: { d: 'M4.6 9.2 6 4.9l6 2.6 6-2.6 1.4 4.3z', class: 'chat-smiley-icon-line' } },
        { tag: 'path', attributes: { d: 'M12 11.8 15 15.2 12 18.6 9 15.2z', class: 'chat-smiley-band' } },
    ],
};
function createChatSmiley(doc, icon, shortcut) {
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
        for (const [name, value] of Object.entries(shape.attributes))
            element.setAttribute(name, value);
        svg.append(element);
    }
    wrapper.append(svg);
    return wrapper;
}
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
                for (const textSegment of splitChatSmilies(segment.text)) {
                    if (textSegment.icon === null)
                        body.append(doc.createTextNode(textSegment.text));
                    else
                        body.append(createChatSmiley(doc, textSegment.icon, textSegment.text));
                }
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
        if (options.realtime?.isConnected())
            void pollNow();
        else
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
    const unbindRealtime = bindRealtimePolling({
        realtime: options.realtime,
        isActive: () => active && options.isVisible(),
        pausePolling: () => {
            if (pollTimer !== null)
                window.clearTimeout(pollTimer);
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
