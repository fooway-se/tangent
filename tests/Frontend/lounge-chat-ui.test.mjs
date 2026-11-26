import assert from 'node:assert/strict';
import test from 'node:test';
import { initLoungeChatUi } from '../../public/assets/lounge-chat-ui.js';

class FakeElement extends EventTarget {
  constructor() {
    super();
    this.children = [];
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.attributes = new Map();
    this.dataset = {};
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.clientHeight = 0;
    this.classList = {
      add() {},
      remove() {},
      toggle() {},
    };
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  focus() { globalThis.document.activeElement = this; }
  setSelectionRange() {}
}

function setup(t, requestOverride) {
  const previous = { document: globalThis.document, window: globalThis.window };
  const ids = [
    '#lounge-view', '#lounge-message-list', '#lounge-empty-state', '#lounge-latest-button', '#lounge-form',
    '#lounge-input', '#lounge-mention-suggestions', '#lounge-reply-hint', '#lounge-cancel-reply',
  ];
  const elements = new Map(ids.map((id) => [id, new FakeElement()]));
  const document = {
    activeElement: null,
    hidden: false,
    createElement: () => new FakeElement(),
    createElementNS: () => new FakeElement(),
    createTextNode: (text) => ({ textContent: text }),
    querySelector: (selector) => elements.get(selector) ?? null,
  };
  const timers = new Map();
  let nextTimerId = 0;
  globalThis.document = document;
  globalThis.window = {
    setTimeout(callback, delay) {
      const id = ++nextTimerId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
  const paths = [];
  let activeState = false;
  let clearedSelection = 0;
  const ui = initLoungeChatUi({
    isVisible: () => !elements.get('#lounge-view').hidden,
    isDocumentHidden: () => document.hidden,
    getUserId: () => 11,
    onActiveChange(active) { activeState = active; },
    onSelectionCleared() { clearedSelection += 1; },
    selectMessage() {},
    onUnauthorized() { assert.fail('unexpected unauthorized response'); },
    report: (message) => assert.fail(message),
    presence: {
      pollLoungePresence: async () => {},
      stopLoungePolling() {},
      resetLoungeStatus() {},
      setLoungePresenceStatus() {},
    },
    avatarInitials: (name) => name.slice(0, 1),
    compactMessage: (body) => body,
    submitFormOnEnter() {},
    request: async (path) => {
      paths.push(path);
      if (requestOverride !== undefined) return requestOverride(path);
      return path === '/lounge/members' ? { members: [] } : { messages: [] };
    },
    fetcher: async () => ({
      status: 304,
      ok: false,
      headers: { get: () => null },
      json: async () => ({}),
    }),
    doc: document,
  });
  return { activeState: () => activeState, clearedSelection: () => clearedSelection, elements, paths, timers, ui };
}

test('Lounge loading owns its polling state and clears it on navigation away', async (t) => {
  const state = setup(t);

  state.ui.load();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(state.ui.isActive(), true);
  assert.equal(state.activeState(), true);
  assert.deepEqual(state.paths, ['/lounge/messages', '/lounge/members']);
  assert.equal(state.timers.size, 1);

  state.ui.stop();

  assert.equal(state.ui.isActive(), false);
  assert.equal(state.activeState(), false);
  assert.equal(state.clearedSelection(), 2);
  assert.equal(state.timers.size, 0);
  assert.equal(state.ui.messagesById().size, 0);
  state.ui.dispose();
});

test('Lounge shows loading feedback until its first message request settles', async (t) => {
  let finishMessages;
  let finishMembers;
  const state = setup(t, (path) => path === '/lounge/messages'
    ? new Promise((resolve) => { finishMessages = resolve; })
    : new Promise((resolve) => { finishMembers = resolve; }));

  state.elements.get('#lounge-empty-state').textContent = 'No messages yet.';
  state.ui.load();
  const emptyState = state.elements.get('#lounge-empty-state');
  assert.equal(emptyState.textContent, 'Loading messages…');
  finishMessages({ messages: [] });
  finishMembers({ members: [] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emptyState.textContent, 'No messages yet.');
  state.ui.dispose();
});

test('Lounge exposes a latest-message control when the transcript is scrolled up', async (t) => {
  const state = setup(t);
  const messageList = state.elements.get('#lounge-message-list');
  const latestButton = state.elements.get('#lounge-latest-button');
  latestButton.hidden = true;

  state.ui.load();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  messageList.scrollHeight = 900;
  messageList.clientHeight = 240;
  messageList.scrollTop = 0;
  messageList.dispatchEvent(new Event('scroll'));
  assert.equal(latestButton.hidden, false);

  latestButton.dispatchEvent(new Event('click'));
  assert.equal(messageList.scrollTop, 900);
  assert.equal(latestButton.hidden, true);
  state.ui.dispose();
});
