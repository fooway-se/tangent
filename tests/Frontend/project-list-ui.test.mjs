import assert from 'node:assert/strict';
import test from 'node:test';
import { initProjectListUi } from '../../public/assets/project-list-ui.js';

class FakeElement extends EventTarget {
  constructor(tagName = 'div') {
    super();
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.classList = { add() {}, remove() {}, toggle() {} };
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this.textContent = '';
    this.focused = false;
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  focus() { this.focused = true; globalThis.document.activeElement = this; }
  querySelector(selector) {
    const name = selector.match(/input\[name="([^"]+)"\]/)?.[1];
    return name === undefined ? null : this.children.find((child) => child.name === name) ?? null;
  }
  reset() { this.resetCalled = true; }
  click() { this.dispatchEvent(new Event('click', { bubbles: true, cancelable: true })); }
}

function setup({ role = 'admin', projects = [] } = {}) {
  const ids = [
    'project-list', 'project-sidebar-list', 'empty-projects', 'project-sidebar-empty',
    'project-form', 'project-form-panel', 'toggle-project-form', 'cancel-project-form',
    'project-github-repository',
  ];
  const elements = new Map(ids.map((id) => [`#${id}`, new FakeElement(id.includes('list') ? 'ul' : 'div')]));
  const nameInput = new FakeElement('input');
  nameInput.name = 'name';
  const descriptionInput = new FakeElement('textarea');
  descriptionInput.name = 'description';
  elements.get('#project-form').append(nameInput, descriptionInput);
  const values = new Map([['name', 'New project'], ['description', 'Description']]);
  class FakeFormData { get(name) { return values.get(name) ?? null; } }
  const doc = {
    activeElement: null,
    querySelector: (selector) => elements.get(selector) ?? null,
    createElement: (tagName) => new FakeElement(tagName),
  };
  const previous = {
    document: globalThis.document,
    FormData: globalThis.FormData,
    window: globalThis.window,
  };
  globalThis.document = doc;
  globalThis.FormData = FakeFormData;
  globalThis.window = { requestAnimationFrame: (callback) => callback() };
  const calls = [];
  const opened = [];
  const reports = [];
  const projectData = projects;
  const ui = initProjectListUi({
    getRole: () => role,
    getActiveProjectId: () => 2,
    openProject: (id) => opened.push(id),
    onRendered: () => {},
    api: async (path, init) => {
      calls.push([path, init]);
      return path === '/projects' && (init === undefined || init.method === undefined)
        ? { projects: projectData }
        : { project: {} };
    },
    report: (message, isError = false) => reports.push([message, isError]),
    doc,
  });
  return {
    ui, elements, calls, opened, reports, values,
    cleanup: () => {
      ui.dispose();
      for (const key of Object.keys(previous)) {
        if (previous[key] === undefined) delete globalThis[key];
        else globalThis[key] = previous[key];
      }
    },
  };
}

test('project list sorts lifecycle states, renders cards and opens the selected project', async (t) => {
  const projects = [
    { id: 1, name: 'Zebra', slug: 'zebra', description: '', status: 'paused' },
    { id: 3, name: 'Done', slug: 'done', description: 'Complete', status: 'completed' },
    { id: 2, name: 'Alpha', slug: 'alpha', description: 'Work', status: 'active' },
  ];
  const { ui, elements, opened, cleanup } = setup({ projects });
  t.after(cleanup);

  await ui.load();

  const cards = elements.get('#project-list').children;
  assert.deepEqual(cards.map((card) => card.dataset.projectId), ['2', '1', '3']);
  assert.equal(cards[0].children[0].children[1].textContent, 'Work');
  assert.equal(elements.get('#project-sidebar-list').children[0].children[0].textContent, 'Alpha');
  cards[0].children[1].children[1].click();
  assert.deepEqual(opened, [2]);
  assert.equal(elements.get('#empty-projects').hidden, true);
});

test('project creation posts form and repository values, closes, and reloads the list', async (t) => {
  const { ui, elements, calls, reports, cleanup } = setup();
  t.after(cleanup);
  elements.get('#project-form-panel').hidden = false;
  elements.get('#project-github-repository').value = '[6,52,"team","migration"]';
  await ui.load();

  elements.get('#project-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls[1][0], '/projects');
  assert.equal(calls[1][1].method, 'POST');
  assert.deepEqual(JSON.parse(calls[1][1].body), {
    name: 'New project',
    description: 'Description',
    github_installation_id: 6,
    github_repository_id: 52,
    github_repository_owner: 'team',
    github_repository_name: 'migration',
  });
  assert.equal(elements.get('#project-form-panel').hidden, true);
  assert.deepEqual(calls.map(([path]) => path), ['/projects', '/projects', '/projects']);
  assert.deepEqual(reports, [['Project created.', false]]);
});

test('empty project state explains that a non-admin needs project membership', async (t) => {
  const { ui, elements, cleanup } = setup({ role: 'developer' });
  t.after(cleanup);

  await ui.load();

  assert.equal(elements.get('#empty-projects').hidden, false);
  assert.equal(elements.get('#empty-projects').textContent,
    "You're not a member of any projects yet. Ask a workspace admin to add you.");
  assert.equal(elements.get('#project-sidebar-empty').textContent, 'No project access yet.');
});
