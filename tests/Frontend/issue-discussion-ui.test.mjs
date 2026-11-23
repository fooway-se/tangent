import assert from 'node:assert/strict';
import test from 'node:test';
import { initIssueDiscussionUi } from '../../public/assets/issue-discussion-ui.js';

class FakeElement extends EventTarget {
  constructor(tagName = 'div') {
    super();
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.className = '';
    this.classList = {
      add() {},
      remove() {},
      toggle() {},
    };
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.textContent = '';
    this.isConnected = true;
  }

  setAttribute(name, value) { this[name] = String(value); }
  append(...children) {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }
  replaceChildren(...children) {
    this.children.forEach((child) => { child.parentElement = null; });
    this.children = [];
    this.append(...children);
  }
  replaceWith(next) {
    const index = this.parentElement?.children.indexOf(this) ?? -1;
    if (index < 0) return;
    next.parentElement = this.parentElement;
    this.parentElement.children[index] = next;
  }
  querySelectorAll(selector) {
    if (selector === '.issue-discussion-message') {
      return this.children.filter((child) => child.className.includes('issue-discussion-message'));
    }
    return [];
  }
  querySelector(selector) {
    const messageId = selector.match(/data-message-id="?(\d+)"?/);
    if (messageId !== null) return this.findMessage(Number(messageId[1]));
    return null;
  }
  findMessage(id) {
    if (Number(this.dataset.messageId) === id) return this;
    for (const child of this.children) {
      const match = child.findMessage?.(id);
      if (match !== null && match !== undefined) return match;
    }
    return null;
  }
  findByClass(className) {
    if (this.className.split(/\s+/).includes(className)) return this;
    for (const child of this.children) {
      const match = child.findByClass?.(className);
      if (match !== null && match !== undefined) return match;
    }
    return null;
  }
  focus() { globalThis.document.activeElement = this; }
  scrollIntoView() {}
  remove() {
    const index = this.parentElement?.children.indexOf(this) ?? -1;
    if (index >= 0) this.parentElement.children.splice(index, 1);
    this.isConnected = false;
  }
  closest() { return null; }
  click() { this.dispatchEvent(new Event('click', { bubbles: true, cancelable: true })); }
}

const selectors = [
  'issue-discussion-heading', 'issue-discussion-count', 'issue-discussion-status', 'issue-discussion-empty',
  'issue-discussion-list', 'issue-discussion-form', 'issue-discussion-input', 'issue-discussion-submit',
  'issue-discussion-reply-context', 'issue-discussion-reply-label', 'issue-discussion-reply-cancel',
];

test('issue discussion UI loads messages and posts a reply for the selected issue', async (t) => {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    HTMLElement: globalThis.HTMLElement,
  };
  const elements = new Map(selectors.map((id) => [`#${id}`, new FakeElement(id.includes('form') ? 'form' : 'div')]));
  const doc = {
    activeElement: null,
    querySelector: (selector) => elements.get(selector) ?? null,
    createElement: (tagName) => new FakeElement(tagName),
  };
  const timers = new Map();
  let nextTimer = 1;
  globalThis.document = doc;
  globalThis.window = {
    setTimeout: (callback) => {
      const id = nextTimer++;
      timers.set(id, callback);
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  globalThis.HTMLElement = FakeElement;
  const issue = { id: 12, project_id: 3 };
  const initialMessage = {
    id: 21, issue_id: 12, author_id: 7, author_agent_id: 99, author_name: 'Build agent', body: 'First note',
    parent_id: null, parent_body: null, parent_author_name: null, created_at: '2026-11-22 10:00:00',
  };
  const postedMessage = {
    ...initialMessage, id: 22, author_id: 7, author_name: 'Sam', body: 'A follow-up',
    created_at: '2026-11-22 10:05:00',
  };
  const requests = [];
  const discussionCounts = [];
  const ui = initIssueDiscussionUi({
    getIssue: () => issue,
    getUser: () => ({ id: 7 }),
    getProject: () => ({ id: 3, status: 'active' }),
    isProjectReadOnly: () => false,
    isDetailVisible: () => true,
    getPageSize: () => 5,
    onDiscussionCountChanged: (issueId, count) => discussionCounts.push([issueId, count]),
    onUnauthorized() { assert.fail('unexpected unauthorized response'); },
    avatarInitials: (name) => name.slice(0, 1).toUpperCase(),
    request: async (path, init) => {
      requests.push({ path, init });
      if (init?.method === 'POST') return { message: postedMessage };
      return { messages: [initialMessage] };
    },
    doc,
  });
  t.after(() => {
    ui.dispose();
    for (const key of Object.keys(previous)) {
      if (previous[key] === undefined) delete globalThis[key];
      else globalThis[key] = previous[key];
    }
  });

  await ui.load(12);
  assert.equal(requests[0].path, '/issues/12/discussion');
  assert.equal(elements.get('#issue-discussion-count').textContent, '1');
  assert.equal(elements.get('#issue-discussion-list').children.length, 1);
  assert.equal(
    elements.get('#issue-discussion-list').children[0].findByClass('issue-discussion-action'),
    null,
    'The human token owner must not see edit/delete controls for an agent-authored note.',
  );
  assert.deepEqual(discussionCounts, [[12, 1]]);

  const input = elements.get('#issue-discussion-input');
  elements.get('#issue-discussion-list').children[0].findByClass('issue-discussion-reply-button').click();
  assert.equal(elements.get('#issue-discussion-reply-context').hidden, false);
  assert.match(elements.get('#issue-discussion-reply-label').textContent, /Replying to Build agent: First note/);
  input.value = 'A follow-up';
  elements.get('#issue-discussion-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(requests[1].path, '/issues/12/discussion');
  assert.deepEqual(JSON.parse(requests[1].init.body), { body: 'A follow-up', parent_id: 21 });
  assert.equal(input.value, '');
  assert.equal(elements.get('#issue-discussion-reply-context').hidden, true);
  assert.equal(elements.get('#issue-discussion-count').textContent, '2');
  assert.equal(elements.get('#issue-discussion-list').children.length, 2);
  assert.deepEqual(discussionCounts, [[12, 1], [12, 2]]);
});
