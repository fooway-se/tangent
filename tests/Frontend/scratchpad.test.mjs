import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildPaletteCommands } from '../../public/assets/command-palette-commands.js';
import { resolveShortcut } from '../../public/assets/shortcuts.js';
import { initScratchpadUi } from '../../public/assets/scratchpad-ui.js';

class FakeElement extends EventTarget {
  constructor(ownerDocument) {
    super();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.attributes = new Map();
    this.value = '';
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.open = false;
  }

  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  focus() { this.ownerDocument.activeElement = this; }
  showModal() { this.open = true; }
  close() { this.open = false; }
}

function withPage(t) {
  const previous = { document: globalThis.document, fetch: globalThis.fetch };
  const selectors = [
    '#scratchpad-dialog', '#scratchpad-close', '#scratchpad-body', '#scratchpad-status',
    '#scratchpad-convert-button', '#scratchpad-convert-form', '#scratchpad-project',
    '#scratchpad-convert-submit', '#scratchpad-convert-cancel',
  ];
  const elements = new Map();
  const doc = {
    cookie: 'tangent_csrf=test-token',
    activeElement: null,
    querySelector: (selector) => elements.get(selector) ?? null,
    createElement: () => new FakeElement(doc),
  };
  for (const selector of selectors) elements.set(selector, new FakeElement(doc));
  globalThis.document = doc;
  t.after(() => {
    if (previous.document === undefined) delete globalThis.document;
    else globalThis.document = previous.document;
    if (previous.fetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = previous.fetch;
  });
  return { doc, elements };
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function paletteContext(role, openScratchpad) {
  const noop = () => {};
  const actions = new Proxy({ openScratchpad }, { get: (target, name) => target[name] ?? noop });
  return {
    user: { id: 1, workspace_id: 1, name: 'Morgan', email: 'morgan@example.test', role },
    keyboardHintsVisible: false,
    workspaceVisible: true,
    activeWorkspaces: [],
    projectsViewVisible: false,
    projectViewVisible: false,
    projectChatVisible: true,
    activeProject: null,
    hasSelectedIssueInVisibleView: false,
    selectedIssueInVisibleView: null,
    hasLatestChatIssue: false,
    deletedProjectIssues: [],
    currentThemeLabel: 'Clean',
    nextThemeLabel: 'Dark',
    issueStatusLabel: (status) => status,
    actions,
  };
}

test('members can open the scratchpad from the command palette, while guests cannot', () => {
  let opened = 0;
  const adminCommands = buildPaletteCommands(paletteContext('admin', () => { opened += 1; }));
  const developerCommands = buildPaletteCommands(paletteContext('developer', () => { opened += 1; }));
  const guestCommands = buildPaletteCommands(paletteContext('guest', () => { opened += 1; }));
  const command = adminCommands.find(({ label }) => label === 'Open Scratchpad');

  assert.ok(command);
  assert.equal(command.shortcut, 'g q');
  assert.ok(developerCommands.some(({ label }) => label === 'Open Scratchpad'));
  assert.ok(!guestCommands.some(({ label }) => label === 'Open Scratchpad'));
  command.run();
  assert.equal(opened, 1);
});

test('g then q opens the scratchpad and stays inactive while typing', () => {
  const event = (key) => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false });
  const context = {
    targetIsEditable: false,
    goPrefixPending: false,
    hasWorkspace: true,
    canNavigateWorkspace: true,
    canSwitchWorkspace: true,
    canAdmin: false,
    canRoadmap: false,
    hasProject: false,
    projectListVisible: false,
    inboxListVisible: false,
    hasSelectedInboxIssue: false,
    issueFilterFocused: false,
    hasSelectedProject: false,
    issueListVisible: false,
    issueDetailVisible: false,
    hasSelectedIssue: false,
    hasLatestChatMessage: false,
    chatMessagesFocused: false,
    hasSelectedChatMessage: false,
    issueDiscussionMessagesFocused: false,
    hasSelectedIssueDiscussionMessage: false,
    issueGroupFocused: false,
    statusHistoryFocused: false,
    textInputFocused: false,
    modalOpen: false,
    canDismiss: false,
  };
  assert.equal(resolveShortcut(event('g'), context), 'await-projects-key');
  assert.equal(resolveShortcut(event('q'), { ...context, goPrefixPending: true }), 'scratchpad');
  assert.equal(resolveShortcut(event('q'), { ...context, goPrefixPending: true, targetIsEditable: true }), null);
});

test('scratchpad opens on its single saved note and autosaves text in place', async (t) => {
  const { doc, elements } = withPage(t);
  const requests = [];
  let noteBody = '<img src=x onerror=alert(1)>';
  let runScheduledSave = null;
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    if (init.method === 'GET') return response({ body: noteBody, updated_at: '2026-11-27T12:00:00Z' });
    noteBody = JSON.parse(init.body).body;
    return response({ body: noteBody, updated_at: '2026-11-27T12:01:00Z' });
  };
  const ui = initScratchpadUi({
    doc,
    onUnauthorized: () => assert.fail('session should remain signed in'),
    setTimeout: (callback) => { runScheduledSave = callback; return 1; },
    clearTimeout: () => {},
  });

  await ui.open();
  const input = elements.get('#scratchpad-body');
  assert.equal(elements.get('#scratchpad-dialog').open, true);
  assert.equal(doc.activeElement, input);
  assert.equal(requests[0].init.method, 'GET');
  assert.equal(input.value, '<img src=x onerror=alert(1)>');

  input.value = 'One thought, kept here';
  input.dispatchEvent(new Event('input'));
  runScheduledSave();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests[1].init.method, 'PUT');
  assert.equal(requests[1].url.endsWith('/scratchpad'), true);
  assert.equal(requests[1].init.headers.get('X-CSRF-Token'), 'test-token');
  assert.deepEqual(JSON.parse(requests[1].init.body), { body: 'One thought, kept here' });
  assert.equal(input.value, 'One thought, kept here');
  assert.equal(elements.get('#scratchpad-status').textContent, 'Saved.');
  ui.dispose();
});

test('closing the scratchpad immediately saves the pending single note', async (t) => {
  const { elements } = withPage(t);
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    return init.method === 'GET'
      ? response({ body: '', updated_at: null })
      : response({ body: JSON.parse(init.body).body, updated_at: '2026-11-27T12:01:00Z' });
  };
  const ui = initScratchpadUi({
    onUnauthorized: () => assert.fail('session should remain signed in'),
    setTimeout: () => 2,
    clearTimeout: () => {},
  });
  await ui.open();
  const input = elements.get('#scratchpad-body');
  input.value = 'Keep this thought';
  input.dispatchEvent(new Event('input'));
  ui.close();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(elements.get('#scratchpad-dialog').open, false);
  assert.equal(requests[1].init.method, 'PUT');
  assert.deepEqual(JSON.parse(requests[1].init.body), { body: 'Keep this thought' });
  ui.dispose();
});

test('the single scratchpad note can be turned into an issue in a writable project', async (t) => {
  const { elements } = withPage(t);
  const requests = [];
  const createdIssue = { id: 91, project_id: 12, title: 'Idea to track' };
  let openedIssue = null;
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    if (init.method === 'GET' && url.endsWith('/scratchpad')) {
      return response({ body: 'Idea to track\nAdd an API endpoint.', updated_at: '2026-11-27T12:00:00Z' });
    }
    if (url.endsWith('/projects')) {
      return response({ projects: [
        { id: 12, name: 'Active project', status: 'active' },
        { id: 13, name: 'Archived project', status: 'archived' },
      ] });
    }
    return response({ issue: createdIssue }, 201);
  };
  const ui = initScratchpadUi({
    onUnauthorized: () => assert.fail('session should remain signed in'),
    onIssueCreated: (issue) => { openedIssue = issue; },
  });

  await ui.open();
  elements.get('#scratchpad-convert-button').dispatchEvent(new Event('click'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(elements.get('#scratchpad-convert-form').hidden, false);
  elements.get('#scratchpad-project').value = '12';
  const submit = new Event('submit', { cancelable: true });
  elements.get('#scratchpad-convert-form').dispatchEvent(submit);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(submit.defaultPrevented, true);
  assert.equal(requests[1].url.endsWith('/projects'), true);
  assert.equal(requests[2].url.endsWith('/scratchpad/issue'), true);
  assert.equal(requests[2].init.method, 'POST');
  assert.deepEqual(JSON.parse(requests[2].init.body), { project_id: 12 });
  assert.deepEqual(openedIssue, createdIssue);
  assert.equal(elements.get('#scratchpad-body').value, '');
  assert.equal(elements.get('#scratchpad-dialog').open, false);
  ui.dispose();
});

test('workspace navigation exposes one scratchpad field and no note collection', async () => {
  const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
  assert.match(html, /id="scratchpad-nav"[^>]*>Scratchpad<\/button>/);
  assert.match(html, /<dialog id="scratchpad-dialog"/);
  assert.match(html, /<textarea id="scratchpad-body"[^>]*maxlength="10000"/);
  assert.match(html, /id="scratchpad-status"[^>]*role="status"/);
  assert.doesNotMatch(html, /scratchpad-note-list|scratchpad-new-note/);
});

test('scratchpad note text uses the regular 16px interface font', async () => {
  const css = await readFile(new URL('../../public/assets/app.css', import.meta.url), 'utf8');
  const scratchpadRule = css.match(/\.scratchpad-body\s*\{([^}]*)\}/)?.[1] ?? '';

  assert.match(scratchpadRule, /font:\s*400 16px\/1\.6 var\(--font-display\)/);
  assert.doesNotMatch(scratchpadRule, /font-mono/);
});
