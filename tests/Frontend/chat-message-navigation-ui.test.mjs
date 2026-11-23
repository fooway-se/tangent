import assert from 'node:assert/strict';
import test from 'node:test';
import { initChatMessageNavigationUi } from '../../public/assets/chat-message-navigation-ui.js';

class FakeMessage {
  constructor(id, doc, top = 0, height = 20) {
    this.dataset = { messageId: String(id) };
    this.doc = doc;
    this.top = top;
    this.height = height;
    this.focusCount = 0;
    this.classes = new Set(['chat-message']);
    this.classList = {
      toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name),
      contains: (name) => this.classes.has(name),
    };
  }

  focus() {
    this.focusCount += 1;
    this.doc.activeElement = this;
  }

  closest(selector) {
    return selector === '.chat-message' ? this : null;
  }

  getBoundingClientRect() {
    return { top: this.top, bottom: this.top + this.height };
  }
}

class FakeList {
  constructor(messages = []) {
    this.messages = messages;
    this.clientTop = 0;
    this.clientHeight = 100;
  }

  querySelectorAll(selector) {
    return selector === '.chat-message' ? this.messages : [];
  }

  querySelector(selector) {
    const match = selector.match(/^\.chat-message\[data-message-id="(\d+)"\]$/);
    return match === null ? null : this.messages.find((message) => message.dataset.messageId === match[1]) ?? null;
  }

  getBoundingClientRect() {
    return { top: 0, bottom: this.clientHeight };
  }
}

function createHarness(messageCount = 3, viewportHeight = 100) {
  const doc = { activeElement: null };
  const messages = Array.from({ length: messageCount }, (_, index) => new FakeMessage(index + 1, doc, index * 20));
  const list = new FakeList(messages);
  list.clientHeight = viewportHeight;
  let selectedMessageId = null;
  let followLatest = null;
  let composerFocuses = 0;
  const ui = initChatMessageNavigationUi({
    getMessageList: () => list,
    getSelectedMessageId: () => selectedMessageId,
    setSelectedMessageId: (id) => { selectedMessageId = id; },
    setFollowLatest: (value) => { followLatest = value; },
    focusComposer: () => { composerFocuses += 1; },
  });
  return {
    ui, doc, list, messages,
    get selectedMessageId() { return selectedMessageId; },
    get followLatest() { return followLatest; },
    get composerFocuses() { return composerFocuses; },
  };
}

test('selecting a chat message synchronizes selection, follow-latest, and focus', () => {
  const harness = createHarness();

  harness.ui.select(3);

  assert.equal(harness.selectedMessageId, 3);
  assert.equal(harness.followLatest, true);
  assert.equal(harness.messages[2].classList.contains('is-keyboard-selected'), true);
  assert.equal(harness.messages[0].classList.contains('is-keyboard-selected'), false);
  assert.equal(harness.doc.activeElement, harness.messages[2]);

  harness.ui.select(1, false);
  assert.equal(harness.selectedMessageId, 1);
  assert.equal(harness.followLatest, false);
  assert.equal(harness.messages[2].classList.contains('is-keyboard-selected'), false);
  assert.equal(harness.doc.activeElement, harness.messages[2]);
});

test('selection movement starts at the nearest edge and clamps at list boundaries', () => {
  const harness = createHarness();

  harness.ui.move(-1);
  assert.equal(harness.selectedMessageId, 3);
  harness.ui.move(1);
  assert.equal(harness.selectedMessageId, 3);
  harness.ui.move(-1);
  assert.equal(harness.selectedMessageId, 2);
  harness.ui.moveToBoundary('first');
  assert.equal(harness.selectedMessageId, 1);
  harness.ui.moveToBoundary('last');
  assert.equal(harness.selectedMessageId, 3);
});

test('page movement advances by the visible messages minus one', () => {
  const harness = createHarness(6, 60);
  harness.ui.select(1, false);

  harness.ui.moveByPage(1);
  assert.equal(harness.selectedMessageId, 3);
  harness.ui.moveByPage(1);
  assert.equal(harness.selectedMessageId, 5);
});

test('an empty chat list sends navigation to the composer', () => {
  const harness = createHarness(0);

  harness.ui.move(1);

  assert.equal(harness.composerFocuses, 1);
  assert.equal(harness.selectedMessageId, null);
});
