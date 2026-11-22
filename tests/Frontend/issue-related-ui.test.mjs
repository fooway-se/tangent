import assert from 'node:assert/strict';
import test from 'node:test';
import { initIssueRelatedUi } from '../../public/assets/issue-related-ui.js';

class FakeElement extends EventTarget {
  constructor(tagName = 'div') {
    super();
    this.tagName = tagName;
    this.children = [];
    this.dataset = {};
    this.className = '';
    this.classList = { add() {}, remove() {}, toggle() {} };
    this.hidden = false;
    this.disabled = false;
    this.open = false;
    this.value = '';
    this.textContent = '';
  }

  setAttribute(name, value) { this[name] = String(value); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  reset() { this.value = ''; }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent(new Event('close')); }
  focus() { globalThis.document.activeElement = this; }
  click() { this.dispatchEvent(new Event('click', { bubbles: true, cancelable: true })); }
}

const selectors = [
  'issue-pull-requests', 'issue-pull-requests-list', 'issue-pull-requests-empty', 'link-pull-request-button',
  'issue-pull-request-dialog', 'issue-pull-request-form', 'issue-pull-request-close',
  'issue-pull-request-cancel', 'issue-pull-request-url', 'issue-pull-request-message',
  'issue-pull-request-submit', 'issue-status-history', 'issue-status-history-count',
  'issue-status-history-empty', 'issue-status-history-list',
];

test('issue relations load, render and link a pull request', async (t) => {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
  };
  const elements = new Map(selectors.map((id) => [`#${id}`, new FakeElement(id.includes('dialog') ? 'dialog' : 'div')]));
  const doc = {
    activeElement: null,
    querySelector: (selector) => selector === 'dialog[open]'
      ? [...elements.values()].find((element) => element.open) ?? null
      : elements.get(selector) ?? null,
    createElement: (tagName) => new FakeElement(tagName),
  };
  globalThis.document = doc;
  globalThis.window = {};
  const issue = { id: 12, title: 'Fix release flow' };
  const project = { id: 3, status: 'active', github_repository: { full_name: 'acme/app' } };
  const pullRequest = {
    id: 41, html_url: 'https://github.com/acme/app/pull/41', repository_full_name: 'acme/app',
    pull_number: 41, title: 'Fix release flow', state: 'open', is_draft: false,
    author_login: 'sam', github_updated_at: '2026-11-22 10:00:00',
  };
  const transition = {
    id: 52, from_status: 'todo', to_status: 'doing', actor_name: 'Sam', created_at: '2026-11-22 09:00:00',
  };
  const requests = [];
  const reports = [];
  const ui = initIssueRelatedUi({
    getIssue: () => issue,
    getProject: () => project,
    getUser: () => ({ id: 7, role: 'admin' }),
    isProjectReadOnly: () => false,
    isDetailVisible: () => true,
    issueStatusLabel: (status) => status === 'todo' ? 'To do' : 'In progress',
    onUnauthorized() { assert.fail('unexpected unauthorized response'); },
    report: (message, isError) => reports.push([message, isError]),
    request: async (path, init) => {
      requests.push({ path, init });
      if (init?.method === 'POST') return { pull_request: pullRequest };
      if (path.endsWith('/history')) return { transitions: [transition] };
      return { pull_requests: [pullRequest] };
    },
    doc,
  });
  t.after(() => {
    ui.dispose();
    if (previous.document === undefined) delete globalThis.document;
    else globalThis.document = previous.document;
    if (previous.window === undefined) delete globalThis.window;
    else globalThis.window = previous.window;
  });

  await ui.loadPullRequests(12);
  await ui.loadStatusHistory(12);
  assert.equal(elements.get('#issue-pull-requests-list').children.length, 1);
  assert.equal(elements.get('#issue-pull-requests-empty').hidden, true);
  assert.equal(elements.get('#issue-status-history-list').children.length, 1);
  assert.equal(elements.get('#issue-status-history-count').textContent, '1');

  elements.get('#link-pull-request-button').click();
  assert.equal(elements.get('#issue-pull-request-dialog').open, true);
  elements.get('#issue-pull-request-url').value = 'https://github.com/acme/app/pull/41';
  elements.get('#issue-pull-request-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const post = requests.find(({ init }) => init?.method === 'POST');
  assert.equal(post.path, '/issues/12/pull-requests');
  assert.deepEqual(JSON.parse(post.init.body), { url: 'https://github.com/acme/app/pull/41' });
  assert.equal(elements.get('#issue-pull-request-dialog').open, false);
  assert.deepEqual(reports.at(-1), ['Pull request linked.', undefined]);
});
