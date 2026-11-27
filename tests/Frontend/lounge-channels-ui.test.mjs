import assert from 'node:assert/strict';
import test from 'node:test';
import { initLoungeChannelsUi } from '../../public/assets/lounge-channels-ui.js';

class FakeElement extends EventTarget {
  constructor(tagName = 'div') {
    super();
    this.tagName = tagName;
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.className = '';
    this.hidden = false;
    this.tabIndex = 0;
    this.parentElement = null;
    this.textContent = '';
    this.classList = {
      add: (value) => { this.className = [...new Set([...this.className.split(' ').filter(Boolean), value])].join(' '); },
      remove: (value) => { this.className = this.className.split(' ').filter((item) => item !== value).join(' '); },
      toggle: (value, enabled) => enabled ? this.classList.add(value) : this.classList.remove(value),
    };
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  append(...children) {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }
  remove() {
    if (this.parentElement === null) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }
  querySelector(selector) {
    for (const child of this.children) {
      if (selector.startsWith('.') && child.className.split(' ').includes(selector.slice(1))) return child;
      const found = child.querySelector(selector);
      if (found !== null) return found;
    }
    return null;
  }
  focus() { globalThis.document.activeElement = this; }
}

test('Lounge loads project links, marks new chat unread, and clears that count when opened', async (t) => {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    Element: globalThis.Element,
  };
  const document = { activeElement: null, createElement: (tagName) => new FakeElement(tagName) };
  const timers = new Map();
  const storedState = new Map();
  let nextTimer = 0;
  globalThis.document = document;
  globalThis.Element = FakeElement;
  globalThis.window = {
    localStorage: {
      getItem: (key) => storedState.get(key) ?? null,
      setItem: (key, value) => storedState.set(key, value),
    },
    setTimeout(callback, delay) {
      const id = ++nextTimer;
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

  const links = new FakeElement('nav');
  const generalLink = new FakeElement('a');
  generalLink.id = 'lounge-general-channel-link';
  generalLink.setAttribute('href', '#lounge-general-channel-panel');
  links.append(generalLink);
  let clickedLink = null;
  links.closest = () => clickedLink;
  const generalPanel = new FakeElement('section');
  const projectPanel = new FakeElement('section');
  projectPanel.id = 'lounge-project-channel-panel';
  const requests = [];
  const fetchPaths = [];
  let fetchCount = 0;
  let finishProjects;
  const openedProjects = [];
  const ui = initLoungeChannelsUi({
    links,
    generalLink,
    generalPanel,
    projectPanel,
    isVisible: () => true,
    isDocumentHidden: () => false,
    getWorkspaceId: () => 4,
    getUserId: () => 11,
    onGeneralSelected() {},
    onProjectSelected: (project) => openedProjects.push(project.id),
    onUnauthorized() { assert.fail('unexpected unauthorized response'); },
    report(message) { assert.fail(message); },
    request: async (path) => {
      requests.push(path);
      return await new Promise((resolve) => {
        finishProjects = () => resolve({
          projects: [{ id: 7, name: 'Tangent', slug: 'tangent', status: 'active' }],
        });
      });
    },
    fetcher: async (path) => {
      fetchPaths.push(path);
      fetchCount += 1;
      const events = fetchCount === 1 ? [] : [
        { id: 90, feed_cursor: 5, project_id: 7, author_id: 8 },
      ];
      return {
        status: 200,
        ok: true,
        headers: { get: () => fetchCount === 1 ? '"events-4-4"' : '"events-4-5"' },
        json: async () => ({ events }),
      };
    },
    doc: document,
  });

  ui.load();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(fetchPaths.map((path) => path.slice(path.lastIndexOf('/api/v1'))), [
    '/api/v1/events?cursor=0',
  ], 'it captures the initial feed cursor as soon as Lounge opens');
  finishProjects();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(requests, ['/projects']);
  assert.deepEqual(fetchPaths.map((path) => path.slice(path.lastIndexOf('/api/v1'))), [
    '/api/v1/events?cursor=0',
    '/api/v1/events?cursor=4',
  ]);
  const entry = links.children[1];
  const projectLink = entry.children[0];
  const unread = entry.children[1];
  const title = projectLink.children[0];
  assert.equal(entry.className, 'lounge-channel-entry');
  assert.equal(entry.children.length, 2);
  assert.equal(projectLink.tagName, 'a');
  assert.equal(projectLink.querySelector('.lounge-channel-unread'), null);
  assert.equal(unread.parentElement, entry);
  assert.equal(title.className, 'lounge-channel-link-title');
  assert.equal(title.children[0].textContent, '#');
  assert.equal(title.children[0].getAttribute('aria-hidden'), 'true');
  assert.equal(title.children[1].textContent, 'Tangent');
  assert.equal(title.children[1].className, 'lounge-channel-link-label');
  assert.equal(unread.hidden, false);
  assert.equal(unread.textContent, '(1)');
  assert.equal(projectLink.getAttribute('aria-label'), 'Tangent, 1 unread message');
  assert.deepEqual(JSON.parse(storedState.get('tangent:lounge-channels:4:11')), {
    cursor: 5,
    unreadByProject: { 7: 1 },
  });

  clickedLink = projectLink;
  const click = new Event('click', { cancelable: true });
  links.dispatchEvent(click);
  assert.equal(ui.selectedProjectId(), 7);
  assert.deepEqual(openedProjects, [7]);
  assert.equal(click.defaultPrevented, true);
  assert.equal(projectLink.getAttribute('aria-current'), 'page');
  assert.equal(unread.hidden, true);
  assert.equal(generalPanel.hidden, true);
  assert.equal(projectPanel.hidden, false);
  assert.deepEqual(JSON.parse(storedState.get('tangent:lounge-channels:4:11')), {
    cursor: 5,
    unreadByProject: {},
  });

  ui.dispose();
  assert.equal(timers.size, 0);
});
