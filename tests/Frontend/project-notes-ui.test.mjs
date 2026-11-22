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
  ];
  const elements = new Map(selectors.map((selector) => [selector, new FakeElement()]));
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
