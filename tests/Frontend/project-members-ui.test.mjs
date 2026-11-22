import assert from 'node:assert/strict';
import test from 'node:test';
import { initProjectMembersUi } from '../../public/assets/project-members-ui.js';

class FakeElement extends EventTarget {
  constructor(tagName = 'div') {
    super();
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.className = '';
    this.classList = { add() {}, remove() {}, toggle() {} };
    this.hidden = false;
    this.disabled = false;
    this.open = false;
    this.value = '';
    this.textContent = '';
    this.tabIndex = 0;
    this.isConnected = true;
  }

  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  matches(selector) { return selector === ':disabled' && this.disabled; }
  closest(selector) { return selector === '[hidden]' && this.hidden ? this : null; }
  querySelectorAll() {
    return this.children.flatMap((child) => [child, ...child.querySelectorAll()]);
  }
  querySelector(selector) {
    const userId = selector.match(/data-user-id="(\d+)"/)?.[1];
    return this.querySelectorAll().find((element) => element.dataset.userId === userId) ?? null;
  }
  showModal() { this.open = true; }
  close() {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  }
  focus() { globalThis.document.activeElement = this; }
  click() { this.dispatchEvent(new Event('click', { bubbles: true, cancelable: true })); }
}

function setup({ members = [{ id: 1, name: 'Ada', role: 'member' }], role = 'admin' } = {}) {
  const ids = [
    'member-list', 'member-form', 'member-add-controls', 'member-add-status', 'member-select',
    'member-removal-confirmation', 'member-removal-description', 'member-removal-cancel',
    'member-removal-confirm', 'add-member-button', 'members-view',
  ];
  const elements = new Map(ids.map((id) => [`#${id}`, new FakeElement(id.includes('confirmation') ? 'dialog' : 'div')]));
  const doc = {
    activeElement: null,
    querySelector: (selector) => elements.get(selector) ?? null,
    createElement: (tagName) => new FakeElement(tagName),
  };
  const previousDocument = globalThis.document;
  globalThis.document = doc;
  let currentMembers = members;
  let projectId = 9;
  let visible = true;
  const calls = [];
  const reports = [];
  const refreshes = [];
  const users = [
    { id: 1, name: 'Ada', email: 'ada@example.test' },
    { id: 2, name: 'Lin', email: 'lin@example.test' },
  ];
  const ui = initProjectMembersUi({
    getProjectId: () => projectId,
    getMembers: () => currentMembers,
    getRole: () => role,
    isReadOnly: () => false,
    isViewVisible: () => visible,
    api: async (path, init) => {
      calls.push([path, init]);
      if (path === '/users') return { users };
      if (init?.method === 'DELETE') currentMembers = [];
      if (init?.method === 'PUT') currentMembers = [...currentMembers, users[1]];
      return {};
    },
    onRefresh: async (id, tab) => { refreshes.push([id, tab]); },
    report: (message, isError = false) => reports.push([message, isError]),
    doc,
  });

  return {
    ui, elements, calls, reports, refreshes,
    setProjectId: (id) => { projectId = id; },
    setVisible: (value) => { visible = value; },
    cleanup: () => {
      ui.dispose();
      if (previousDocument === undefined) delete globalThis.document;
      else globalThis.document = previousDocument;
    },
  };
}

test('project member view renders members and only offers users who are not already members', async (t) => {
  const { ui, elements, cleanup } = setup();
  t.after(cleanup);

  await ui.load(9);

  const rows = elements.get('#member-list').children;
  assert.equal(rows.length, 1);
  assert.match(rows[0].children[0].textContent, /Ada · member/);
  assert.equal(elements.get('#member-select').children.length, 1);
  assert.equal(elements.get('#member-select').children[0].value, '2');
  assert.equal(elements.get('#member-add-controls').hidden, false);
});

test('non-admin members can view the list without member management controls', async (t) => {
  const { ui, elements, calls, cleanup } = setup({ role: 'member' });
  t.after(cleanup);

  await ui.load(9);

  assert.equal(elements.get('#member-list').children.length, 1);
  assert.equal(elements.get('#member-list').children[0].children.length, 1);
  assert.equal(elements.get('#member-form').hidden, true);
  assert.deepEqual(calls, []);
});

test('project member form adds a selected user and refreshes the members tab', async (t) => {
  const { ui, elements, calls, reports, refreshes, cleanup } = setup();
  t.after(cleanup);
  await ui.load(9);

  elements.get('#member-select').value = '2';
  elements.get('#member-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(calls.at(-1), ['/projects/9/members/2', { method: 'PUT' }]);
  assert.deepEqual(refreshes, [[9, 'members']]);
  assert.deepEqual(reports, [['Member added to the project.', false]]);
});

test('project member removal requires confirmation, refreshes the list, and restores focus', async (t) => {
  const { ui, elements, calls, refreshes, cleanup } = setup();
  t.after(cleanup);
  await ui.load(9);

  const removeButton = elements.get('#member-list').children[0].children[1];
  removeButton.click();
  assert.equal(ui.hasOpenDialog(), true);
  assert.equal(elements.get('#member-removal-description').textContent, '“Ada” will be removed from the project.');
  elements.get('#member-removal-confirm').click();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(calls.at(-1), ['/projects/9/members/1', { method: 'DELETE' }]);
  assert.deepEqual(refreshes, [[9, 'members']]);
  assert.equal(ui.hasOpenDialog(), false);
  assert.equal(globalThis.document.activeElement, elements.get('#member-select'));
});
