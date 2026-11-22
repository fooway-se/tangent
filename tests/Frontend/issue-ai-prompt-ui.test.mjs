import assert from 'node:assert/strict';
import test from 'node:test';
import { initIssueAiPromptUi } from '../../public/assets/issue-ai-prompt-ui.js';

class FakeElement extends EventTarget {
  constructor(tagName = 'div') {
    super();
    this.tagName = tagName;
    this.children = [];
    this.attributes = new Map();
    this.className = '';
    this.classList = { add() {}, remove() {} };
    this.hidden = false;
    this.disabled = false;
    this.open = false;
    this.value = '';
    this.textContent = '';
    this.isConnected = true;
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  append(...children) { this.children.push(...children); }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent(new Event('close')); }
  focus() { globalThis.document.activeElement = this; }
  select() { this.selected = true; }
  remove() { this.isConnected = false; }
  closest() { return null; }
  click() { this.dispatchEvent(new Event('click', { bubbles: true, cancelable: true })); }
}

const selectors = [
  'issue-ai-prompt-button', 'issue-ai-prompt-dialog', 'issue-ai-prompt-close', 'issue-ai-prompt-step-count',
  'issue-ai-prompt-context', 'issue-ai-prompt-outcome', 'issue-ai-prompt-criteria', 'issue-ai-prompt-preview',
  'issue-ai-prompt-status', 'issue-ai-prompt-back', 'issue-ai-prompt-skip', 'issue-ai-prompt-next',
  'issue-ai-prompt-actions', 'issue-ai-prompt-save', 'issue-ai-prompt-copy', 'issue-ai-prompt-copy-markdown',
  'issue-ai-prompt-download', 'issue-ai-prompt-step-context', 'issue-ai-prompt-step-outcome',
  'issue-ai-prompt-step-criteria', 'issue-ai-prompt-step-preview',
];

test('AI prompt flow navigates its steps and saves the edited issue context', async (t) => {
  const previous = { document: globalThis.document, window: globalThis.window };
  const previousHTMLElement = globalThis.HTMLElement;
  const elements = new Map(selectors.map((id) => [`#${id}`, new FakeElement(id.includes('dialog') ? 'dialog' : 'div')]));
  const doc = {
    activeElement: null,
    body: new FakeElement('body'),
    querySelector: (selector) => selector === 'dialog[open]' ? null : elements.get(selector) ?? null,
    createElement: (tagName) => new FakeElement(tagName),
  };
  globalThis.document = doc;
  globalThis.window = { setTimeout: () => 1 };
  globalThis.HTMLElement = FakeElement;
  const currentIssue = {
    id: 12, project_id: 3, title: 'Prepare release', description: 'Release notes', status: 'doing',
    priority: 'high', due_date: null, type: 'feature', context: 'Current context',
    expected_outcome: 'Clear release', acceptance_criteria: 'Prompt copies',
  };
  const requests = [];
  let savedIssue = null;
  const ui = initIssueAiPromptUi({
    getIssue: () => currentIssue,
    isIssueCurrent: (issue) => issue.id === currentIssue.id,
    onSaved: (issue) => { savedIssue = issue; Object.assign(currentIssue, issue); },
    onUnauthorized() { assert.fail('unexpected unauthorized response'); },
    request: async (path, init) => {
      requests.push({ path, init });
      return { issue: { ...currentIssue, context: JSON.parse(init.body).context } };
    },
    doc,
  });
  t.after(() => {
    ui.dispose();
    if (previous.document === undefined) delete globalThis.document;
    else globalThis.document = previous.document;
    if (previous.window === undefined) delete globalThis.window;
    else globalThis.window = previous.window;
    if (previousHTMLElement === undefined) delete globalThis.HTMLElement;
    else globalThis.HTMLElement = previousHTMLElement;
  });

  ui.open();
  const context = elements.get('#issue-ai-prompt-context');
  const outcome = elements.get('#issue-ai-prompt-outcome');
  const preview = elements.get('#issue-ai-prompt-preview');
  assert.equal(elements.get('#issue-ai-prompt-step-count').textContent, 'Step 1 of 4');
  assert.equal(context.value, 'Current context');
  assert.equal(outcome.value, 'Clear release');

  context.value = 'New context';
  context.dispatchEvent(new Event('input'));
  elements.get('#issue-ai-prompt-next').click();
  elements.get('#issue-ai-prompt-next').click();
  elements.get('#issue-ai-prompt-skip').click();
  assert.equal(elements.get('#issue-ai-prompt-step-count').textContent, 'Step 4 of 4');
  assert.match(preview.value, /New context/);
  assert.equal(elements.get('#issue-ai-prompt-save').disabled, false);

  elements.get('#issue-ai-prompt-save').click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests[0].path, '/issues/12');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    context: 'New context',
    expected_outcome: 'Clear release',
    acceptance_criteria: 'Prompt copies',
  });
  assert.equal(savedIssue.context, 'New context');
  assert.equal(elements.get('#issue-ai-prompt-status').textContent, 'Prompt context saved to this issue.');
  ui.close();
});
