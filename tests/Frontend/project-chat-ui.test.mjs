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
  const input = find(view, 'textarea');
  const send = view.children[2].children.at(-1).children.at(-1);
  assert.ok(input);
  assert.equal(input.disabled, false);
  assert.equal(send.disabled, false);

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
