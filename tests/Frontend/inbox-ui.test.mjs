import assert from 'node:assert/strict';
import test from 'node:test';
import { initInboxUi } from '../../public/assets/inbox-ui.js';

class FakeChildren extends Array {
  item(index) { return this[index] ?? null; }
}

class FakeElement extends EventTarget {
  constructor(tagName = 'div') {
    super();
    this.tagName = tagName.toUpperCase();
    this.children = new FakeChildren();
    this.parentElement = null;
    this.attributes = new Map();
    this.dataset = {};
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.textContent = '';
    this.tabIndex = 0;
    this._className = '';
    this.classList = {
      values: new Set(),
      add: (...names) => names.forEach((name) => this.classList.values.add(name)),
      remove: (...names) => names.forEach((name) => this.classList.values.delete(name)),
      contains: (name) => this.classList.values.has(name),
      toggle: (name, force) => {
        const enabled = force ?? !this.classList.values.has(name);
        if (enabled) this.classList.values.add(name);
        else this.classList.values.delete(name);
        return enabled;
      },
    };
  }

  get className() { return this._className; }
  set className(value) {
    this._className = value;
    this.classList.values = new Set(value.split(/\s+/).filter(Boolean));
  }

  append(...nodes) { nodes.forEach((node) => this.insertBefore(node, null)); }
  replaceChildren(...nodes) {
    this.children.forEach((child) => { child.parentElement = null; });
    this.children = new FakeChildren();
    this.append(...nodes);
  }
  insertBefore(node, reference) {
    if (node.parentElement !== null) node.parentElement.children.splice(node.parentElement.children.indexOf(node), 1);
    const index = reference === null ? -1 : this.children.indexOf(reference);
    if (index < 0) this.children.push(node);
    else this.children.splice(index, 0, node);
    node.parentElement = this;
    return node;
  }
  remove() {
    if (this.parentElement === null) return;
    this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1);
    this.parentElement = null;
  }
  replaceWith(node) {
    if (this.parentElement === null) return;
    this.parentElement.insertBefore(node, this);
    this.remove();
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  matches(selector) {
    const classes = [...selector.matchAll(/\.([\w-]+)/g)].map((match) => match[1]);
    return classes.length > 0 && classes.every((name) => this.classList.contains(name));
  }
  closest(selector) {
    for (let node = this; node !== null; node = node.parentElement) {
      if (node.matches(selector)) return node;
    }
    return null;
  }
  contains(node) {
    for (let current = node; current !== null; current = current.parentElement) {
      if (current === this) return true;
    }
    return false;
  }
  querySelectorAll(selector) {
    const direct = selector.startsWith(':scope > ');
    const targetSelector = direct ? selector.slice(':scope > '.length) : selector;
    const candidates = direct ? this.children : this.descendants();
    return candidates.filter((candidate) => candidate.matches(targetSelector));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  descendants() { return this.children.flatMap((child) => [child, ...child.descendants()]); }
  focus() { globalThis.document.activeElement = this; }
  get isConnected() { return true; }
}

function setup(t, payloads) {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    HTMLElement: globalThis.HTMLElement,
  };
  const selectors = [
    '#my-work-tabs', '#my-work-tab-inbox', '#my-work-tab-tasks', '#my-work-inbox-panel',
    '#my-work-tasks-panel', '#my-work-tasks-summary', '#my-work-task-groups',
    '#my-work-tasks-empty-state', '#inbox-summary', '#inbox-issue-list', '#inbox-empty-state',
    '#inbox-tabs', '#inbox-mark-all-read', '#inbox-load-more',
  ];
  const elements = new Map(selectors.map((selector) => [selector, new FakeElement()]));
  const document = {
    activeElement: new FakeElement(),
    hidden: false,
    createElement: (tagName) => new FakeElement(tagName),
    createDocumentFragment: () => new FakeElement('fragment'),
    querySelector: (selector) => elements.get(selector) ?? null,
  };
  const timers = new Map();
  let nextTimerId = 0;
  globalThis.document = document;
  globalThis.HTMLElement = FakeElement;
  globalThis.window = {
    setTimeout: (callback, delay) => {
      const id = ++nextTimerId;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  };
  t.after(() => {
    for (const key of Object.keys(previous)) {
      if (previous[key] === undefined) delete globalThis[key];
      else globalThis[key] = previous[key];
    }
  });

  const fetches = [];
  const mutations = [];
  const ui = initInboxUi({
    isVisible: () => true,
    isDocumentHidden: () => document.hidden,
    onUnauthorized() { assert.fail('unexpected unauthorized response'); },
    report: (message) => assert.fail(message),
    onOpenEvent() {},
    onOpenIssue() {},
    issueStatusLabel: (status) => status,
    issueTypeLabel: (type) => type,
    issuePriorityLabel: (priority) => priority,
    formatDueDate: (date) => date,
    isIssueOverdue: () => false,
    createDiscussionIndicator: () => null,
    request: async (path, init) => {
      mutations.push({ path, init });
      if (path.endsWith('/31')) return { event: { ...payloads.event, read: true } };
      return undefined;
    },
    fetcher: async (url, init) => {
      fetches.push({ url, init });
      const isIssues = String(url).endsWith('/inbox');
      const payload = isIssues ? { issues: [] } : {
        events: payloads.events,
        counts: payloads.counts,
        has_more: false,
        next_cursor: null,
      };
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => name === 'ETag' ? `etag-${isIssues ? 'issues' : 'events'}` : null },
        json: async () => payload,
      };
    },
    doc: document,
  });
  return { document, elements, fetches, mutations, timers, ui };
}

const event = {
  id: 31,
  type: 'mention',
  actor_name: 'Sam',
  summary: 'mentioned you',
  detail: null,
  project_id: 4,
  project_name: 'Atlas',
  issue_id: null,
  message_id: 88,
  read: false,
  done: false,
  created_at: '2026-11-22T08:00:00Z',
};

test('inbox refresh renders event counts and local read actions update the selected tab', async (t) => {
  const { elements, fetches, mutations, ui } = setup(t, {
    event,
    events: [event],
    counts: { unread: 1, mentions: 1 },
  });

  await ui.pollNow();

  assert.deepEqual(fetches.map(({ url }) => String(url).slice(String(url).indexOf('/api/v1'))), [
    '/api/v1/inbox', '/api/v1/inbox/events?tab=unread',
  ]);
  assert.equal(elements.get('#inbox-summary').textContent, '1 unread event.');
  assert.equal(elements.get('#inbox-tabs').children.map((tab) => tab.textContent).join(', '), 'Unread 1, All, Mentions 1, Done');
  const readButton = elements.get('#inbox-issue-list').querySelector('.inbox-event-read');
  assert.ok(readButton);

  readButton.dispatchEvent(new Event('click'));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(mutations[0].path, '/inbox/events/31');
  assert.equal(mutations[0].init.method, 'PATCH');
  assert.equal(elements.get('#inbox-summary').textContent, '1 unread event.');
  assert.equal(elements.get('#inbox-issue-list').children.length, 0);
  ui.dispose();
});
