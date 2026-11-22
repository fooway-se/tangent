import assert from 'node:assert/strict';
import test from 'node:test';
import { initIssueStatusPickerUi } from '../../public/assets/issue-status-picker-ui.js';

class FakeElement extends EventTarget {
  constructor(tagName = 'div') {
    super();
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.className = '';
    this.classList = { add() {}, remove() {}, toggle() {} };
    this.attributes = new Map();
    this.open = false;
    this.textContent = '';
    this.isConnected = true;
    this.tabIndex = -1;
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  querySelectorAll(selector) {
    if (selector === '.issue-status-option') return this.children.filter((child) => child.className.includes('issue-status-option'));
    return [];
  }
  matches(selector) { return selector === '.issue-status-option' && this.className.includes('issue-status-option'); }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent(new Event('close')); }
  focus() { globalThis.document.activeElement = this; }
  closest() { return null; }
  click() { this.dispatchEvent(new Event('click', { bubbles: true, cancelable: true })); }
}

test('issue status picker selects with its dialog keyboard controls', async (t) => {
  const previous = { document: globalThis.document, HTMLElement: globalThis.HTMLElement };
  const ids = ['issue-status-picker', 'issue-status-picker-close', 'issue-status-picker-description', 'issue-status-picker-options'];
  const elements = new Map(ids.map((id) => [`#${id}`, new FakeElement(id.includes('picker') && id === 'issue-status-picker' ? 'dialog' : 'div')]));
  const doc = {
    activeElement: null,
    querySelector: (selector) => elements.get(selector) ?? null,
    createElement: (tagName) => new FakeElement(tagName),
  };
  globalThis.document = doc;
  globalThis.HTMLElement = FakeElement;
  const issue = { id: 8, project_id: 3, title: 'Ship safely', status: 'todo', is_ongoing: false };
  const returnFocus = new FakeElement('button');
  const selected = [];
  const focusEvents = [];
  const ui = initIssueStatusPickerUi({
    getProjectId: () => 3,
    isIssueDetailVisible: () => true,
    getOptions: () => [
      { value: 'todo', label: 'To do' },
      { value: 'doing', label: 'In progress' },
      { value: 'testing', label: 'Testing' },
    ],
    statusLabel: (status) => status === 'todo' ? 'To do' : status === 'doing' ? 'In progress' : 'Testing',
    onSelect: async (selectedIssue, status) => { selected.push([selectedIssue.id, status]); },
    focusIssueTitle: (issueId) => { focusEvents.push(['issue', issueId]); return true; },
    focusIssuesTab: () => focusEvents.push(['issues-tab']),
    focusIssueDetailStatus: () => focusEvents.push(['detail-status']),
    shouldRestoreFocus: () => true,
    doc,
  });
  t.after(() => {
    ui.dispose();
    if (previous.document === undefined) delete globalThis.document;
    else globalThis.document = previous.document;
    if (previous.HTMLElement === undefined) delete globalThis.HTMLElement;
    else globalThis.HTMLElement = previous.HTMLElement;
  });

  ui.open(issue, returnFocus);
  assert.equal(ui.isOpen(), true);
  assert.equal(elements.get('#issue-status-picker-description').textContent,
    'Choose a status for “Ship safely”. Current status: To do.');
  const options = elements.get('#issue-status-picker-options').children;
  assert.equal(options.length, 3);
  assert.equal(options[0].attributes.get('aria-selected'), 'true');

  const arrowDown = new Event('keydown', { bubbles: true, cancelable: true });
  Object.defineProperties(arrowDown, { key: { value: 'ArrowDown' }, target: { value: options[0] } });
  elements.get('#issue-status-picker').dispatchEvent(arrowDown);
  assert.equal(options[1].attributes.get('aria-selected'), 'true');

  const enter = new Event('keydown', { bubbles: true, cancelable: true });
  Object.defineProperties(enter, { key: { value: 'Enter' }, target: { value: options[1] } });
  elements.get('#issue-status-picker').dispatchEvent(enter);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(selected, [[8, 'doing']]);
  assert.equal(ui.isOpen(), false);
  assert.deepEqual(focusEvents, [['detail-status']]);
  assert.equal(doc.activeElement, returnFocus, 'the dialog close handler restores its trigger');
});
