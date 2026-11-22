import assert from 'node:assert/strict';
import test from 'node:test';
import { initLoungePresence } from '../../public/assets/lounge-presence.js';

class FakeElement {
  constructor() {
    this.children = [];
    this.attributes = new Map();
    this.hidden = false;
    this.textContent = '';
  }

  replaceChildren(...children) { this.children = children; }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
}

function fixture(t) {
  const previousWindow = globalThis.window;
  const timers = new Map();
  let nextTimer = 0;
  globalThis.window = {
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  };
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });

  const elements = new Map([
    ['#lounge-presence', new FakeElement()],
    ['#lounge-nav-presence', new FakeElement()],
  ]);
  const doc = {
    createElement: () => new FakeElement(),
    querySelector: (selector) => elements.get(selector) ?? null,
  };
  const navigationButton = new FakeElement();
  const presence = initLoungePresence({
    navigationButton,
    getUser: () => ({ id: 1, role: 'admin' }),
    isLoungeActive: () => false,
    isLoungeVisible: () => false,
    isWorkspaceVisible: () => true,
    isDocumentHidden: () => false,
    request: async () => ({ members: [] }),
    onUnauthorized() { assert.fail('unexpected unauthorized response'); },
    doc,
  });
  return { elements, navigationButton, presence, timers };
}

test('navigation presence shows names and clears its accessible label when nobody is present', (t) => {
  const { elements, navigationButton, presence } = fixture(t);

  presence.renderNavigationPresence([{ id: 2, name: 'Sam' }, { id: 3, name: 'Lee' }]);
  const badge = elements.get('#lounge-nav-presence');
  assert.equal(badge.hidden, false);
  assert.equal(badge.textContent, '2 here');
  assert.equal(navigationButton.title, '2 people in the Lounge: Sam, Lee');
  assert.equal(navigationButton.attributes.get('aria-label'), 'Lounge. 2 people in the Lounge: Sam, Lee');

  presence.renderNavigationPresence([]);
  assert.equal(badge.hidden, true);
  assert.equal(badge.textContent, '');
  assert.equal(navigationButton.attributes.has('title'), false);
  assert.equal(navigationButton.attributes.has('aria-label'), false);
});

test('workspace presence omits the viewer and schedules the next poll', async (t) => {
  const { elements, presence, timers } = fixture(t);
  const requests = [];
  presence.dispose();
  const poller = initLoungePresence({
    navigationButton: new FakeElement(),
    getUser: () => ({ id: 1, role: 'admin' }),
    isLoungeActive: () => false,
    isLoungeVisible: () => false,
    isWorkspaceVisible: () => true,
    isDocumentHidden: () => false,
    request: async (path, init) => {
      requests.push({ path, init });
      return { members: [{ id: 1, name: 'Viewer' }, { id: 2, name: 'Sam' }] };
    },
    onUnauthorized() { assert.fail('unexpected unauthorized response'); },
    doc: {
      createElement: () => new FakeElement(),
      querySelector: (selector) => elements.get(selector) ?? null,
    },
  });

  await poller.pollWorkspacePresence();

  assert.deepEqual(requests.map(({ path }) => path), ['/lounge/presence']);
  assert.equal(elements.get('#lounge-nav-presence').textContent, '1 here');
  assert.equal([...timers.values()][0].delay, 15_000);
  poller.dispose();
});

test('Lounge presence posts a heartbeat and defers checks while the page is hidden', async (t) => {
  const { elements } = fixture(t);
  const requests = [];
  let hidden = false;
  const presence = initLoungePresence({
    navigationButton: new FakeElement(),
    getUser: () => ({ id: 1, role: 'admin' }),
    isLoungeActive: () => true,
    isLoungeVisible: () => true,
    isWorkspaceVisible: () => true,
    isDocumentHidden: () => hidden,
    request: async (path, init) => {
      requests.push({ path, init });
      return { members: [{ id: 2, name: 'Sam' }] };
    },
    onUnauthorized() { assert.fail('unexpected unauthorized response'); },
    doc: {
      createElement: () => new FakeElement(),
      querySelector: (selector) => elements.get(selector) ?? null,
    },
  });

  await presence.pollLoungePresence();
  assert.deepEqual(requests, [{ path: '/lounge/presence', init: { method: 'POST', body: '{}' } }]);
  assert.equal(elements.get('#lounge-presence').children[1].textContent, 'Sam');

  hidden = true;
  await presence.pollWorkspacePresence();
  assert.equal(requests.length, 1);
  presence.dispose();
});
