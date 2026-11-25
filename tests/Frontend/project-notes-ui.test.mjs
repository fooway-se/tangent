import assert from 'node:assert/strict';
import test from 'node:test';
import { initProjectNotesUi } from '../../public/assets/project-notes-ui.js';

class FakeElement extends EventTarget {
  constructor() {
    super();
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.hidden = false;
    this.disabled = false;
    this.attributes = new Map();
    this.classList = {
      values: new Set(),
      toggle: (name, force) => {
        const enabled = force ?? !this.classList.values.has(name);
        if (enabled) this.classList.values.add(name);
        else this.classList.values.delete(name);
        return enabled;
      },
    };
  }

  setAttribute(name, value) { this.attributes.set(name, value); }
}

function withPage(t) {
  const previous = { document: globalThis.document, fetch: globalThis.fetch };
  const selectors = [
    '#project-notes-view', '#project-notes-form', '#project-notes-input', '#project-notes-preview',
    '#project-notes-status', '#project-notes-save', '#project-notes-write', '#project-notes-preview-toggle',
    '#project-repository-card', '#project-repository-link', '#project-repository-branch-row',
    '#project-repository-default-branch', '#project-repository-clone-command', '#project-repository-copy',
    '#project-repository-status',
  ];
  const elements = new Map(selectors.map((selector) => [selector, new FakeElement()]));
  elements.get('#project-repository-card').hidden = true;
  elements.get('#project-repository-branch-row').hidden = true;
  elements.get('#project-repository-copy').disabled = true;
  globalThis.document = {
    cookie: 'tangent_csrf=test-token',
    querySelector: (selector) => elements.get(selector) ?? null,
  };
  t.after(() => {
    if (previous.document === undefined) delete globalThis.document;
    else globalThis.document = previous.document;
    if (previous.fetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = previous.fetch;
  });
  return elements;
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('project notes load in Preview, track edits, and save with the CSRF header', async (t) => {
  const elements = withPage(t);
  const project = { id: 7, status: 'active' };
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return init.method === 'PUT'
      ? response({ notes: '# Updated', updated_at: '2026-11-22 10:00:00' })
      : response({ notes: '# Existing', updated_at: null });
  };
  const ui = initProjectNotesUi({ getProject: () => project, onUnauthorized: () => assert.fail('session should remain signed in') });
  const input = elements.get('#project-notes-input');
  const preview = elements.get('#project-notes-preview');
  const save = elements.get('#project-notes-save');
  const writeButton = elements.get('#project-notes-write');

  await ui.load(project.id);
  assert.equal(input.value, '# Existing');
  assert.match(preview.innerHTML, /<h1>Existing<\/h1>/);
  assert.equal(elements.get('#project-notes-status').textContent, 'Saved. Notes are private to the internal team.');
  assert.equal(ui.isLoadedFor(project.id), true);

  writeButton.dispatchEvent(new Event('click'));
  assert.equal(input.hidden, false);
  assert.equal(preview.hidden, true);
  assert.equal(save.hidden, false);
  input.value = '# Draft';
  input.dispatchEvent(new Event('input'));
  assert.equal(save.disabled, false);
  assert.equal(elements.get('#project-notes-status').textContent, 'Unsaved changes.');

  const submitEvent = new Event('submit', { cancelable: true });
  elements.get('#project-notes-form').dispatchEvent(submitEvent);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(submitEvent.defaultPrevented, true);
  assert.equal(calls[1].init.method, 'PUT');
  assert.equal(calls[1].init.headers.get('X-CSRF-Token'), 'test-token');
  assert.deepEqual(JSON.parse(calls[1].init.body), { notes: '# Draft' });
  assert.equal(input.value, '# Updated');
  assert.equal(save.disabled, true);
  assert.equal(elements.get('#project-notes-status').textContent, 'Saved. Notes are private to the internal team.');

  ui.dispose();
});

test('project notes show repository details and copy the clone command', async (t) => {
  const elements = withPage(t);
  const project = {
    id: 12,
    status: 'active',
    github_repository: {
      id: 42,
      installation_id: 5,
      owner: 'acme',
      name: 'client',
      full_name: 'acme/client',
      html_url: 'https://github.com/acme/client',
      default_branch: 'trunk',
    },
  };
  const copiedCommands = [];
  globalThis.fetch = async () => response({ notes: '', updated_at: null });
  const ui = initProjectNotesUi({
    getProject: () => project,
    onUnauthorized: () => assert.fail('session should remain signed in'),
    copyToClipboard: async (command) => { copiedCommands.push(command); },
  });

  await ui.load(project.id);

  assert.equal(elements.get('#project-repository-card').hidden, false);
  assert.equal(elements.get('#project-repository-link').textContent, 'acme/client');
  assert.equal(elements.get('#project-repository-link').href, 'https://github.com/acme/client');
  assert.equal(elements.get('#project-repository-branch-row').hidden, false);
  assert.equal(elements.get('#project-repository-default-branch').textContent, 'trunk');
  assert.equal(elements.get('#project-repository-clone-command').textContent, 'git clone https://github.com/acme/client.git');

  elements.get('#project-repository-copy').dispatchEvent(new Event('click'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(copiedCommands, ['git clone https://github.com/acme/client.git']);
  assert.equal(elements.get('#project-repository-status').textContent, 'Clone command copied.');

  ui.dispose();
});

test('project notes hide repository details when no repository is linked', async (t) => {
  const elements = withPage(t);
  const project = { id: 13, status: 'active', github_repository: null };
  globalThis.fetch = async () => response({ notes: '', updated_at: null });
  const ui = initProjectNotesUi({ getProject: () => project, onUnauthorized: () => assert.fail('session should remain signed in') });

  await ui.load(project.id);

  assert.equal(elements.get('#project-repository-card').hidden, true);
  ui.dispose();
});

test('project repository details refresh after the linked repository changes', async (t) => {
  const elements = withPage(t);
  const project = {
    id: 14,
    status: 'active',
    github_repository: {
      id: 1,
      installation_id: 5,
      owner: 'acme',
      name: 'old-repo',
      full_name: 'acme/old-repo',
      html_url: 'https://github.com/acme/old-repo',
      default_branch: 'main',
    },
  };
  globalThis.fetch = async () => response({ notes: '', updated_at: null });
  const ui = initProjectNotesUi({ getProject: () => project, onUnauthorized: () => assert.fail('session should remain signed in') });

  await ui.load(project.id);
  project.github_repository = {
    id: 2,
    installation_id: 5,
    owner: 'acme',
    name: 'new-repo',
    full_name: 'acme/new-repo',
    html_url: 'https://github.com/acme/new-repo',
    default_branch: 'trunk',
  };
  ui.refreshRepository();

  assert.equal(elements.get('#project-repository-link').textContent, 'acme/new-repo');
  assert.equal(elements.get('#project-repository-default-branch').textContent, 'trunk');
  assert.equal(elements.get('#project-repository-clone-command').textContent, 'git clone https://github.com/acme/new-repo.git');
  ui.dispose();
});

test('project notes disable editing for read-only projects and handle expired sessions', async (t) => {
  const elements = withPage(t);
  const project = { id: 9, status: 'archived' };
  let unauthorizedCount = 0;
  globalThis.fetch = async () => response({ error: { message: 'Sign in again.' } }, 401);
  const ui = initProjectNotesUi({ getProject: () => project, onUnauthorized: () => { unauthorizedCount += 1; } });

  ui.setReadOnly(true);
  assert.equal(elements.get('#project-notes-input').disabled, true);
  assert.equal(elements.get('#project-notes-write').disabled, true);
  assert.equal(elements.get('#project-notes-preview').hidden, false);

  await ui.load(project.id);
  assert.equal(unauthorizedCount, 1);
  assert.equal(elements.get('#project-notes-status').textContent, 'Loading notes…');
  ui.dispose();
});
