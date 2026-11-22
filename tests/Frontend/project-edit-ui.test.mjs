import assert from 'node:assert/strict';
import test from 'node:test';
import { initProjectEditUi } from '../../public/assets/project-edit-ui.js';

class FakeElement extends EventTarget {
  constructor(tagName = 'div') {
    super();
    this.tagName = tagName;
    this.children = [];
    this.attributes = new Map();
    this.classList = { add() {}, remove() {}, toggle() {} };
    this.disabled = false;
    this.open = false;
    this.value = '';
    this.textContent = '';
    this.focused = false;
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  replaceChildren(...children) { this.children = children; }
  showModal() { this.open = true; }
  close() {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  }
  focus() { this.focused = true; globalThis.document.activeElement = this; }
  reset() {}
}

const archivedProject = {
  id: 9,
  workspace_id: 2,
  name: 'Migration',
  slug: 'migration',
  description: 'Move the data safely',
  status: 'archived',
  archived_from_status: 'paused',
  github_repository: {
    id: 52, installation_id: 6, owner: 'team', name: 'migration',
    full_name: 'team/migration', html_url: 'https://github.test/team/migration',
  },
};

function setup({ api } = {}) {
  const ids = [
    'project-edit-dialog', 'project-edit-form', 'project-edit-close', 'project-edit-cancel',
    'project-edit-name', 'project-edit-description-input', 'project-edit-status',
    'project-edit-status-help', 'project-edit-message', 'project-edit-save', 'edit-project-button',
    'project-edit-github-repository',
  ];
  const elements = new Map(ids.map((id) => [`#${id}`, new FakeElement(id.endsWith('dialog') ? 'dialog' : 'div')]));
  const doc = {
    activeElement: null,
    querySelector: (selector) => elements.get(selector) ?? null,
  };
  const previousDocument = globalThis.document;
  globalThis.document = doc;
  let project = { ...archivedProject };
  let role = 'admin';
  let projectViewVisible = true;
  const calls = [];
  const updates = [];
  const refreshes = [];
  const reports = [];
  const ui = initProjectEditUi({
    getRole: () => role,
    getProject: () => project,
    isProjectViewVisible: () => projectViewVisible,
    populateRepositorySelect: (select, selection) => { select.value = selection === null ? '' : '[6,52,"team","migration"]'; },
    api: async (path, init) => {
      calls.push([path, init]);
      if (api !== undefined) return await api(path, init);
      return { project: { ...project, name: 'Migration refreshed', status: 'paused' } };
    },
    onUpdated: (nextProject) => { project = nextProject; updates.push(nextProject); },
    refreshProjects: async () => { refreshes.push('projects'); },
    report: (message, isError = false) => reports.push([message, isError]),
    doc,
  });
  return {
    ui, elements, calls, updates, refreshes, reports,
    setRole: (value) => { role = value; },
    setProjectViewVisible: (value) => { projectViewVisible = value; },
    cleanup: () => {
      ui.dispose();
      if (previousDocument === undefined) delete globalThis.document;
      else globalThis.document = previousDocument;
    },
  };
}

test('project edit dialog explains archive restoration and unlocks fields for a work state', (t) => {
  const { ui, elements, cleanup } = setup();
  t.after(cleanup);

  ui.open();
  assert.equal(elements.get('#project-edit-dialog').open, true);
  assert.equal(elements.get('#project-edit-name').value, 'Migration');
  assert.equal(elements.get('#project-edit-name').disabled, true);
  assert.match(elements.get('#project-edit-status-help').textContent, /was paused before archiving/);
  assert.equal(globalThis.document.activeElement, elements.get('#project-edit-name'));

  const status = elements.get('#project-edit-status');
  status.value = 'paused';
  status.dispatchEvent(new Event('change'));
  assert.equal(elements.get('#project-edit-name').disabled, false);
  assert.match(elements.get('#project-edit-status-help').textContent, /restore the previous work state/);
});

test('saving project edits sends project and repository fields, updates the view, and refreshes projects', async (t) => {
  const { ui, elements, calls, updates, refreshes, reports, cleanup } = setup();
  t.after(cleanup);
  ui.open();
  elements.get('#project-edit-name').value = 'Migration refreshed';
  elements.get('#project-edit-description-input').value = 'Move the data safely';
  elements.get('#project-edit-status').value = 'paused';
  elements.get('#project-edit-github-repository').value = '[6,52,"team","migration"]';

  elements.get('#project-edit-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls[0][0], '/projects/9');
  assert.equal(calls[0][1].method, 'PATCH');
  assert.deepEqual(JSON.parse(calls[0][1].body), {
    name: 'Migration refreshed',
    description: 'Move the data safely',
    status: 'paused',
    github_installation_id: 6,
    github_repository_id: 52,
    github_repository_owner: 'team',
    github_repository_name: 'migration',
  });
  assert.equal(updates[0].name, 'Migration refreshed');
  assert.deepEqual(refreshes, ['projects']);
  assert.deepEqual(reports, [['Project updated.', false]]);
  assert.equal(elements.get('#project-edit-dialog').open, false);
  assert.equal(elements.get('#project-edit-save').disabled, false);
});

test('project edit failures stay in the dialog and keep the message available', async (t) => {
  const { ui, elements, reports, cleanup } = setup({ api: async () => { throw new Error('Update denied'); } });
  t.after(cleanup);
  ui.open();
  elements.get('#project-edit-name').value = 'Changed';

  elements.get('#project-edit-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(elements.get('#project-edit-dialog').open, true);
  assert.equal(elements.get('#project-edit-message').textContent, 'Update denied');
  assert.equal(elements.get('#project-edit-save').disabled, false);
  assert.deepEqual(reports, []);
});
