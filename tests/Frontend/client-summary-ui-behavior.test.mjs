import assert from 'node:assert/strict';
import test from 'node:test';
import { initClientSummaryUi, validClientSummaryRange } from '../../public/assets/client-summary-ui.js';

class FakeElement extends EventTarget {
  constructor(ownerDocument) {
    super();
    this.ownerDocument = ownerDocument;
    this.value = '';
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.open = false;
    this.isConnected = true;
    this.attributes = new Map();
    const classes = new Set();
    this.classList = {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
    };
  }

  setAttribute(name, value) { this.attributes.set(name, value); }
  closest() { return null; }
  focus() { this.ownerDocument.activeElement = this; }
  select() { this.selected = true; }
  showModal() { this.open = true; }
  close() {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  }
}

function withPage(t) {
  const previous = {
    document: globalThis.document,
    fetch: globalThis.fetch,
    HTMLElement: globalThis.HTMLElement,
    navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
  };
  const document = { activeElement: null, body: null, elements: new Map() };
  const selectors = [
    '#client-summary-dialog', '#client-summary-period', '#client-summary-custom-range',
    '#client-summary-from', '#client-summary-to', '#client-summary-generate', '#client-summary-preview',
    '#client-summary-status', '#client-summary-close', '#client-summary-copy',
  ];
  for (const selector of selectors) document.elements.set(selector, new FakeElement(document));
  document.body = new FakeElement(document);
  document.activeElement = document.body;
  document.querySelector = (selector) => selector === 'dialog[open]' ? null : document.elements.get(selector) ?? null;
  globalThis.document = document;
  globalThis.HTMLElement = FakeElement;
  t.after(() => {
    if (previous.document === undefined) delete globalThis.document;
    else globalThis.document = previous.document;
    if (previous.fetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = previous.fetch;
    if (previous.HTMLElement === undefined) delete globalThis.HTMLElement;
    else globalThis.HTMLElement = previous.HTMLElement;
    if (previous.navigator === undefined) delete globalThis.navigator;
    else Object.defineProperty(globalThis, 'navigator', previous.navigator);
  });
  return document;
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const view = {
  project: { id: 7, name: 'Northstar', status: 'active' },
  progress: { percent: 50, done: 1, total: 2 },
  next_milestone: null,
  completed_this_week: 0,
  approvals: [],
  milestones: [],
  items: [],
  updates: [],
  messages: [],
};

test('summary dialog generates a project summary and restores focus after copying', async (t) => {
  const document = withPage(t);
  const trigger = new FakeElement(document);
  document.activeElement = trigger;
  const copyCalls = [];
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { clipboard: { writeText: async (value) => copyCalls.push(value) } },
  });
  globalThis.fetch = async (url) => String(url).includes('client-summary-updates')
    ? response({ total_count: 1, updates: [{ id: 1, text: 'Issue shipped', created_at: '2026-11-22' }] })
    : response(view);
  const ui = initClientSummaryUi({
    getProject: () => ({ id: 7, name: 'Northstar', status: 'active' }),
    canOpen: () => true,
    defaultReturnFocus: () => new FakeElement(document),
    onUnauthorized: () => assert.fail('session should remain signed in'),
  });

  ui.open();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ui.dialog.open, true);
  assert.match(document.elements.get('#client-summary-preview').value, /Project summary: Northstar/);
  assert.match(document.elements.get('#client-summary-preview').value, /Issue shipped/);
  assert.equal(document.elements.get('#client-summary-status').textContent, 'Review or edit the summary, then copy it.');

  document.elements.get('#client-summary-copy').dispatchEvent(new Event('click'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(copyCalls.length, 1);
  assert.equal(copyCalls[0], document.elements.get('#client-summary-preview').value);
  assert.equal(document.elements.get('#client-summary-status').textContent, 'Summary copied.');

  ui.close();
  assert.equal(ui.dialog.open, false);
  assert.equal(document.activeElement, trigger);
  ui.dispose();
});

test('summary dialog keeps admin access scoped and closes on expired sessions', async (t) => {
  const document = withPage(t);
  let authorized = false;
  let unauthorizedCount = 0;
  globalThis.fetch = async () => response({ error: { message: 'Sign in again.' } }, 401);
  const ui = initClientSummaryUi({
    getProject: () => ({ id: 7, name: 'Northstar', status: 'active' }),
    canOpen: () => authorized,
    defaultReturnFocus: () => document.body,
    onUnauthorized: () => { unauthorizedCount += 1; },
  });

  ui.open();
  assert.equal(ui.dialog.open, false);
  authorized = true;
  ui.open();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ui.dialog.open, false);
  assert.equal(unauthorizedCount, 1);
  ui.dispose();
});

test('summary date ranges accept valid inclusive spans up to 366 days', () => {
  assert.equal(validClientSummaryRange('2026-01-01', '2026-01-01'), true);
  assert.equal(validClientSummaryRange('2025-12-31', '2026-12-31'), true);
  assert.equal(validClientSummaryRange('2025-12-30', '2026-12-31'), false);
  assert.equal(validClientSummaryRange('2026-02-30', '2026-03-01'), false);
  assert.equal(validClientSummaryRange('2026-03-02', '2026-03-01'), false);
});
