import assert from 'node:assert/strict';
import test from 'node:test';
import { initGithubProjectUi } from '../../public/assets/github-project-ui.js';

class FakeElement extends EventTarget {
  constructor() {
    super();
    this.children = [];
    this.hidden = false;
    this.value = '';
    this.textContent = '';
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  replaceChildren(...children) { this.children = children; }
  append(...children) { this.children.push(...children); }
}

function setup({ api } = {}) {
  const ids = [
    'project-github-repository', 'project-edit-github-repository', 'github-project-selection-status',
    'github-project-edit-status', 'connect-github-create-button', 'connect-github-edit-button',
  ];
  const elements = new Map(ids.map((id) => [`#${id}`, new FakeElement()]));
  const doc = {
    querySelector: (selector) => elements.get(selector) ?? null,
    createElement: () => new FakeElement(),
  };
  const popupNavigations = [];
  const popup = { opener: {}, location: { assign: (url) => popupNavigations.push(url) }, closeCalled: false, close() { this.closeCalled = true; } };
  const previous = { document: globalThis.document, window: globalThis.window };
  globalThis.document = doc;
  globalThis.window = { open: () => popup };
  let role = 'admin';
  let project = {
    id: 7,
    github_repository: { id: 42, installation_id: 5, owner: 'former', name: 'private', full_name: 'former/private' },
  };
  const calls = [];
  const reports = [];
  const ui = initGithubProjectUi({
    getRole: () => role,
    getProject: () => project,
    api: async (path, init) => {
      calls.push([path, init]);
      if (api !== undefined) return await api(path, init);
      if (path === '/github/repositories') {
        return {
          repositories: [
            { id: 11, installation_id: 3, owner: 'team', name: 'one', full_name: 'team/one' },
          ],
          connected: true,
          configured: true,
          can_connect: true,
        };
      }
      return { url: 'https://github.test/install/redirect' };
    },
    report: (message, isError = false) => reports.push([message, isError]),
    doc,
  });
  return {
    ui, elements, calls, reports, popup, popupNavigations,
    setRole: (nextRole) => { role = nextRole; },
    setProject: (nextProject) => { project = nextProject; },
    cleanup: () => {
      ui.dispose();
      if (previous.document === undefined) delete globalThis.document;
      else globalThis.document = previous.document;
      if (previous.window === undefined) delete globalThis.window;
      else globalThis.window = previous.window;
    },
  };
}

test('GitHub repository loading keeps the selected project link visible when access is unavailable', async (t) => {
  const { ui, elements, cleanup } = setup();
  t.after(cleanup);

  await ui.load();

  const editOptions = elements.get('#project-edit-github-repository').children;
  assert.equal(editOptions.length, 3);
  assert.equal(editOptions[2].textContent, 'former/private (access unavailable)');
  assert.equal(elements.get('#project-edit-github-repository').value, '[5,42,"former","private"]');
  assert.equal(elements.get('#project-github-repository').children[1].textContent, 'team/one');
  assert.equal(elements.get('#github-project-edit-status').textContent,
    'Choose a repository available to this workspace.');
  assert.equal(elements.get('#connect-github-create-button').hidden, false);
});

test('GitHub installation flow opens a safe popup and navigates it to the install URL', async (t) => {
  const { ui, popup, popupNavigations, calls, cleanup } = setup();
  t.after(cleanup);

  await ui.connect();

  assert.deepEqual(calls[0], ['/github/install', { method: 'POST', body: '{}' }]);
  assert.equal(popup.opener, null);
  assert.deepEqual(popupNavigations, ['https://github.test/install/redirect']);
});

test('GitHub loading and connection skip work for non-admin users', async (t) => {
  const { ui, calls, cleanup, setRole } = setup();
  t.after(cleanup);
  setRole('guest');

  await ui.load();
  await ui.connect();

  assert.deepEqual(calls, []);
});
