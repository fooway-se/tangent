import assert from 'node:assert/strict';
import test from 'node:test';
import { initIssueDeleteUi } from '../../public/assets/issue-delete-ui.js';

class FakeElement extends EventTarget {
  constructor(tagName = 'div') {
    super();
    this.tagName = tagName;
    this.open = false;
    this.hidden = false;
    this.disabled = false;
    this.textContent = '';
    this.attributes = new Map();
    this.classList = { add() {}, remove() {} };
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent(new Event('close')); }
  focus() { this.focused = true; }
  click() { this.dispatchEvent(new Event('click', { bubbles: true, cancelable: true })); }
}

const selectors = [
  'issue-delete-confirmation', 'issue-delete-description', 'issue-delete-error',
  'issue-delete-cancel', 'issue-delete-confirm',
];

test('issue delete confirmation deletes, restores and reports issue actions', async (t) => {
  const elements = new Map(selectors.map((id) => [`#${id}`, new FakeElement(id.includes('confirmation') ? 'dialog' : 'div')]));
  const doc = { querySelector: (selector) => elements.get(selector) ?? null };
  const issue = { id: 14, project_id: 3, title: 'Fix access', status: 'doing' };
  const requests = [];
  const reports = [];
  const callbacks = [];
  const ui = initIssueDeleteUi({
    getProjectId: () => 3,
    statusLabel: (status) => status === 'doing' ? 'In progress' : 'To do',
    onDeleted: async (deletedIssue, projectId) => {
      callbacks.push(['deleted', deletedIssue.id, projectId]);
      return true;
    },
    onRestored: async (restoredIssue) => callbacks.push(['restored', restoredIssue.id]),
    onUnauthorized() { assert.fail('unexpected unauthorized response'); },
    report: (message, isError) => reports.push([message, isError]),
    request: async (path, init) => { requests.push({ path, init }); },
    doc,
  });
  t.after(() => ui.dispose());

  ui.open(issue);
  assert.equal(ui.isOpen(), true);
  assert.match(elements.get('#issue-delete-description').textContent, /“Fix access” is currently In progress/);
  elements.get('#issue-delete-confirm').click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests[0].path, '/issues/14');
  assert.deepEqual(requests[0].init, { method: 'DELETE' });
  assert.deepEqual(callbacks[0], ['deleted', 14, 3]);
  assert.equal(ui.isOpen(), false);

  const restoreButton = new FakeElement('button');
  await ui.restore(issue, restoreButton);
  assert.equal(requests[1].path, '/issues/14/restore');
  assert.deepEqual(requests[1].init, { method: 'POST' });
  assert.deepEqual(callbacks[1], ['restored', 14]);
  assert.deepEqual(reports, [
    ['Issue moved to Deleted issues. You can restore it from the issue list.', undefined],
    ['Issue restored.', undefined],
  ]);
  assert.equal(restoreButton.disabled, false);
});
