import assert from 'node:assert/strict';
import test from 'node:test';
import { initProjectChatUi } from '../../public/assets/project-chat-ui.js';

class FakeElement extends EventTarget {
  constructor(tagName = 'div') {
    super();
    this.tagName = tagName;
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.className = '';
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.clientHeight = 0;
    this.classList = { add() {}, remove() {}, toggle() {} };
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  append(...children) { this.children.push(...children); }
  insertBefore(child, before) {
    const index = before === null ? -1 : this.children.indexOf(before);
    if (index < 0) this.children.push(child);
    else this.children.splice(index, 0, child);
  }
  replaceChildren(...children) { this.children = [...children]; }
  querySelector() { return null; }
  focus() { globalThis.document.activeElement = this; }
}

test('project chat owns its lifecycle, read-only controls, and polling cleanup', async (t) => {
  const previous = { document: globalThis.document, window: globalThis.window };
  const timers = new Map();
  let nextTimerId = 0;
  const document = {
    activeElement: null,
    hidden: false,
    createElement: (tagName) => new FakeElement(tagName),
    createElementNS: (_namespace, tagName) => new FakeElement(tagName),
  };
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

  const project = { id: 7, slug: 'tangent', status: 'active' };
  const paths = [];
  let clearedSelection = 0;
  const ui = initProjectChatUi({
    getProject: () => project,
    getMembers: () => [{ id: 11, name: 'Avery', email: 'avery@example.test' }],
    getUser: () => ({ id: 11, name: 'Avery' }),
    isDocumentHidden: () => document.hidden,
    selectMessage() {},
    onClearSelection() { clearedSelection += 1; },
    onCreateIssue() {},
    onUnauthorized() { assert.fail('unexpected unauthorized response'); },
    report(message) { assert.fail(message); },
    avatarInitials: (name) => name.slice(0, 1),
    compactMessage: (body) => body,
    submitFormOnEnter() {},
    request: async (path) => {
      paths.push(path);
      return path.endsWith('/presence') ? { someone_else_viewing: false } : { messages: [] };
    },
    pollEvents: async () => ({ notModified: true, status: 304, etag: null, nextDelay: 1500, events: [] }),
    doc: document,
  });

  const view = ui.create(project.id);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(ui.activeProjectId(), 7);
  assert.equal(ui.messageList().className, 'chat-message-list');
  assert.deepEqual(paths, ['/projects/7/presence', '/projects/7/messages']);
  assert.equal(timers.size, 2, 'chat and presence each schedule their next poll');
  const find = (element, tagName) => {
    if (element.tagName === tagName) return element;
    for (const child of element.children) {
      const found = find(child, tagName);
      if (found !== null) return found;
    }
    return null;
  };
  const findByClass = (element, className) => {
    if (element.className.split(' ').includes(className)) return element;
    for (const child of element.children) {
      const found = findByClass(child, className);
      if (found !== null) return found;
    }
    return null;
  };
  const input = find(view, 'textarea');
  const send = findByClass(view, 'button-primary');
  const latestButton = findByClass(view, 'chat-latest-button');
  assert.ok(input);
  assert.ok(latestButton);
  assert.equal(latestButton.hidden, true);
  assert.equal(input.disabled, false);
  assert.equal(send.disabled, false);

  const messageList = ui.messageList();
  messageList.scrollHeight = 1000;
  messageList.clientHeight = 200;
  messageList.scrollTop = 0;
  messageList.dispatchEvent(new Event('scroll'));
  assert.equal(latestButton.hidden, false, 'the latest control appears when scrolled away from the newest message');
  latestButton.dispatchEvent(new Event('click'));
  assert.equal(messageList.scrollTop, 1000, 'the latest control returns the transcript to the end');
  assert.equal(latestButton.hidden, true);

  ui.setReadOnly(true);
  assert.equal(input.disabled, true);
  assert.equal(send.disabled, true);

  ui.stop();
  assert.equal(ui.activeProjectId(), null);
  assert.equal(ui.messageList(), null);
  assert.equal(ui.messagesById().size, 0);
  assert.equal(timers.size, 0);
  assert.equal(clearedSelection, 1);
  ui.dispose();
});

test('project chat shows loading feedback until the first message request settles', async (t) => {
  const previous = { document: globalThis.document, window: globalThis.window };
  const document = {
    activeElement: null,
    hidden: false,
    createElement: (tagName) => new FakeElement(tagName),
    createElementNS: (_namespace, tagName) => new FakeElement(tagName),
  };
  globalThis.document = document;
  globalThis.window = { setTimeout: () => 1, clearTimeout() {} };
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });

  let finishHistory;
  const ui = initProjectChatUi({
    getProject: () => ({ id: 7, slug: 'tangent', status: 'active' }),
    getMembers: () => [],
    getUser: () => null,
    isDocumentHidden: () => false,
    selectMessage() {}, onClearSelection() {}, onCreateIssue() {}, onUnauthorized() {},
    report(message) { assert.fail(message); },
    avatarInitials: (name) => name.slice(0, 1), compactMessage: (body) => body,
    submitFormOnEnter() {},
    request: async (path) => path.endsWith('/presence')
      ? { someone_else_viewing: false }
      : await new Promise((resolve) => { finishHistory = resolve; }),
    pollEvents: async () => ({ notModified: true, status: 304, etag: null, nextDelay: 1500, events: [] }),
    doc: document,
  });

  ui.create(7);
  const emptyState = ui.messageList().children.find((child) => child.className === 'chat-empty-state');
  assert.equal(emptyState.textContent, 'Loading messages…');
  finishHistory({ messages: [] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emptyState.textContent, 'No messages yet.');
  ui.dispose();
});

test('project chat reports presence changes so the top bar can mirror the indicator', async (t) => {
  const previous = { document: globalThis.document, window: globalThis.window };
  const document = {
    activeElement: null,
    hidden: false,
    createElement: (tagName) => new FakeElement(tagName),
    createElementNS: (_namespace, tagName) => new FakeElement(tagName),
  };
  globalThis.document = document;
  globalThis.window = { setTimeout: () => 1, clearTimeout() {} };
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });

  const states = [];
  const ui = initProjectChatUi({
    getProject: () => ({ id: 7, slug: 'tangent', status: 'active' }),
    getMembers: () => [],
    getUser: () => null,
    isDocumentHidden: () => false,
    selectMessage() {}, onClearSelection() {}, onCreateIssue() {}, onUnauthorized() {},
    report(message) { assert.fail(message); },
    avatarInitials: (name) => name.slice(0, 1), compactMessage: (body) => body,
    submitFormOnEnter() {},
    request: async (path) => path.endsWith('/presence') ? { someone_else_viewing: true } : { messages: [] },
    pollEvents: async () => ({ notModified: true, status: 304, etag: null, nextDelay: 1500, events: [] }),
    onPresenceChange: (state) => states.push(state),
    doc: document,
  });

  ui.create(7);
  assert.deepEqual(states, ['checking'], 'a new chat starts from the checking state');
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(states, ['checking', 'active'], 'the heartbeat result is reported while the chat keeps polling');
  ui.stop();
  ui.dispose();
});
