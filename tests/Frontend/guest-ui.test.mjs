import assert from 'node:assert/strict';
import test from 'node:test';
import { initGuestUi } from '../../public/assets/guest-ui.js';

class FakeElement extends EventTarget {
  constructor() {
    super();
    this.children = [];
    this.attributes = new Map();
    this.classList = {
      values: new Set(),
      add: (name) => this.classList.values.add(name),
      remove: (name) => this.classList.values.delete(name),
      toggle: (name, force) => {
        const enabled = force ?? !this.classList.values.has(name);
        if (enabled) this.classList.values.add(name);
        else this.classList.values.delete(name);
        return enabled;
      },
    };
    this.textContent = '';
    this.value = '';
    this.hidden = false;
  }

  replaceChildren(...children) { this.children = children; }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  focus() { this.focused = true; }
}

class FakeOption extends FakeElement {
  constructor(label, value) {
    super();
    this.textContent = label;
    this.value = value;
  }
}

function withBrowserGlobals(t) {
  const previous = {
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    Option: globalThis.Option,
  };
  const selectors = [
    '#guest-shell', '#guest-status', '#guest-main', '#guest-title', '#guest-user', '#guest-cap',
    '#guest-project-label', '#guest-project-select', '#guest-preview-member-label',
    '#guest-preview-member-select', '#guest-preview-return-button',
  ];
  const elements = new Map(selectors.map((selector) => [selector, new FakeElement()]));
  const body = new FakeElement();
  const doc = {
    body,
    activeElement: new FakeElement(),
    createElement: () => new FakeElement(),
    querySelector: (selector) => elements.get(selector) ?? null,
  };
  globalThis.document = doc;
  globalThis.HTMLElement = FakeElement;
  globalThis.Option = FakeOption;
  t.after(() => {
    if (previous.document === undefined) delete globalThis.document;
    else globalThis.document = previous.document;
    if (previous.HTMLElement === undefined) delete globalThis.HTMLElement;
    else globalThis.HTMLElement = previous.HTMLElement;
    if (previous.Option === undefined) delete globalThis.Option;
    else globalThis.Option = previous.Option;
  });
  return { doc, elements };
}

const user = { id: 7, email: 'guest@example.com', name: 'Guest', role: 'guest' };
const view = { project: { id: 5, name: 'Atlas', status: 'active' }, approvals: [], messages: [] };

test('guest shell loads shared projects and shows an empty state when none are available', async (t) => {
  const { elements } = withBrowserGlobals(t);
  const requests = [];
  const emptyStates = [];
  let finishProjects;
  let enteredGuestMode = 0;
  const ui = initGuestUi({
    getUser: () => user,
    getProject: () => null,
    getProjectMembers: () => [],
    getProjectHeading: () => new FakeElement(),
    request: async (path) => {
      requests.push(path);
      return new Promise((resolve) => { finishProjects = resolve; });
    },
    renderEmptyState: (container, message) => emptyStates.push({ container, message }),
    onGuestMode: () => { enteredGuestMode += 1; },
    onPreviewOpened() {},
    onPreviewClosed() {},
    onUnauthorized() { assert.fail('unexpected unauthorized response'); },
    report: (message, isError) => {
      elements.get('#guest-status').textContent = message;
      elements.get('#guest-status').classList.toggle('error', isError);
    },
  });

  const loading = ui.showGuestShell(user);
  assert.equal(elements.get('#guest-status').textContent, 'Loading projects…');
  finishProjects({ projects: [] });
  await loading;

  assert.deepEqual(requests, ['/projects']);
  assert.equal(enteredGuestMode, 1);
  assert.equal(elements.get('#guest-shell').hidden, false);
  assert.deepEqual(emptyStates, [{ container: elements.get('#guest-main'), message: 'No projects have been shared with you yet.' }]);
  assert.equal(elements.get('#guest-status').textContent, '');
  assert.equal(ui.isPreviewActive(), false);
  assert.equal(ui.isShellVisible(), true);
});

test('admin preview selects an active guest, disables actions, and restores focus on close', async (t) => {
  const { doc, elements } = withBrowserGlobals(t);
  const requests = [];
  const rendered = [];
  const guestOne = { id: 21, name: 'Ari', email: 'ari@example.com', role: 'guest', is_active: true };
  const guestTwo = { id: 22, name: 'Bo', email: 'bo@example.com', role: 'guest', is_active: true };
  const inactiveGuest = { id: 23, name: 'Cy', email: 'cy@example.com', role: 'guest', is_active: false };
  const project = { id: 5, name: 'Atlas' };
  const returnFocus = new FakeElement();
  doc.activeElement = returnFocus;
  let opened = 0;
  let closed = 0;
  let unauthorized = 0;
  const ui = initGuestUi({
    getUser: () => ({ id: 1, email: 'admin@example.com', role: 'admin' }),
    getProject: () => project,
    getProjectMembers: () => [guestOne, guestTwo, inactiveGuest],
    getProjectHeading: () => new FakeElement(),
    request: async (path, init) => {
      requests.push({ path, init });
      return view;
    },
    renderView: (container, clientView, handlers, options) => rendered.push({ container, clientView, handlers, options }),
    onGuestMode() {},
    onPreviewOpened: () => { opened += 1; },
    onPreviewClosed: () => { closed += 1; },
    onUnauthorized: () => { unauthorized += 1; },
    report: assert.fail,
  });

  await ui.openPreview();

  assert.equal(ui.isPreviewActive(), true);
  assert.equal(elements.get('#guest-shell').hidden, false);
  assert.equal(opened, 1);
  assert.equal(elements.get('#guest-user').textContent, guestOne.email);
  assert.deepEqual(elements.get('#guest-preview-member-select').children.map((option) => option.value), ['21', '22']);
  assert.equal(elements.get('#guest-preview-member-label').hidden, false);
  assert.equal(elements.get('#guest-preview-return-button').focused, true);
  assert.deepEqual(requests.map((request) => request.path), ['/projects/5/client-view']);
  assert.equal(rendered[0].options.previewMode, true);
  assert.equal(rendered[0].handlers.userId, guestOne.id);

  await rendered[0].handlers.approve(4);
  await rendered[0].handlers.comment('should be ignored');
  assert.equal(requests.length, 1);

  const memberSelect = elements.get('#guest-preview-member-select');
  memberSelect.value = String(guestTwo.id);
  memberSelect.dispatchEvent(new Event('change'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(elements.get('#guest-user').textContent, guestTwo.email);
  assert.equal(rendered.at(-1).handlers.userId, guestTwo.id);

  ui.closePreview();
  assert.equal(ui.isPreviewActive(), false);
  assert.equal(elements.get('#guest-shell').hidden, true);
  assert.equal(closed, 1);
  assert.equal(returnFocus.focused, true);
  assert.equal(unauthorized, 0);
});
