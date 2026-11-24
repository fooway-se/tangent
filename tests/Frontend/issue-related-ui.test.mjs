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
  'copy-issue-branch-button', 'issue-commits', 'issue-commits-list', 'issue-commits-empty',
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
    check_runs: [{
      id: 81, name: 'PHP tests', html_url: 'https://github.com/acme/app/runs/81',
      status: 'completed', conclusion: 'success', started_at: '2026-11-22 10:10:00',
      completed_at: '2026-11-22 10:12:00', github_updated_at: '2026-11-22 10:12:00',
    }],
  };
  const transition = {
    id: 52, from_status: 'todo', to_status: 'doing', actor_name: 'Sam', created_at: '2026-11-22 09:00:00',
  };
  const commit = {
    repository_full_name: 'acme/app',
    sha: '0123456789abcdef0123456789abcdef01234567',
    message: 'Keep mobile chat scrolling stable',
    html_url: 'https://github.com/acme/app/commit/0123456789abcdef0123456789abcdef01234567',
    author_login: 'sam',
    committed_at: '2026-11-22 10:30:00',
  };
  const requests = [];
  const reports = [];
  const copied = [];
  const ui = initIssueRelatedUi({
    getIssue: () => issue,
    getProject: () => project,
    getUser: () => ({ id: 7, role: 'admin' }),
    isProjectReadOnly: () => false,
    isDetailVisible: () => true,
    issueStatusLabel: (status) => status === 'todo' ? 'To do' : 'In progress',
    onUnauthorized() { assert.fail('unexpected unauthorized response'); },
    report: (message, isError) => reports.push([message, isError]),
    copyText: async (value) => copied.push(value),
    request: async (path, init) => {
      requests.push({ path, init });
      if (init?.method === 'POST') return { pull_request: pullRequest };
      if (path.endsWith('/history')) return { transitions: [transition] };
      if (path.endsWith('/commits')) return { commits: [commit] };
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
  await ui.loadCommits(12);
  await ui.loadStatusHistory(12);
  assert.equal(elements.get('#issue-pull-requests-list').children.length, 1);
  assert.equal(elements.get('#issue-pull-requests-empty').hidden, true);
  assert.equal(elements.get('#issue-pull-requests-list').children[0].children[0].children[2].textContent, 'PHP tests · success');
  assert.equal(elements.get('#issue-pull-requests-list').children[0].children[0].children[2].href, 'https://github.com/acme/app/runs/81');
  assert.equal(elements.get('#issue-status-history-list').children.length, 1);
  assert.equal(elements.get('#issue-status-history-count').textContent, '1');
  assert.equal(elements.get('#issue-commits').hidden, false);
  assert.equal(elements.get('#issue-commits-list').children.length, 1);
  assert.equal(elements.get('#issue-commits-list').children[0].children[0].href, commit.html_url);
  assert.match(elements.get('#issue-commits-list').children[0].children[0].textContent, /acme\/app/);
  assert.match(elements.get('#issue-commits-list').children[0].children[0].textContent, /Keep mobile chat scrolling stable/);

  elements.get('#copy-issue-branch-button').click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(copied, ['tangent/issue-12-fix-release-flow']);
  assert.deepEqual(reports.at(-1), ['Branch name copied.', undefined]);

  elements.get('#link-pull-request-button').click();
  assert.equal(elements.get('#issue-pull-request-dialog').open, true);
  assert.equal(ui.isPullRequestDialogOpen(), true);
  ui.closePullRequestDialog();
  assert.equal(ui.isPullRequestDialogOpen(), false);
  assert.equal(doc.activeElement, elements.get('#link-pull-request-button'));

  elements.get('#link-pull-request-button').click();
  elements.get('#issue-pull-request-url').value = 'https://github.com/acme/app/pull/41';
  elements.get('#issue-pull-request-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const post = requests.find(({ init }) => init?.method === 'POST');
  assert.equal(post.path, '/issues/12/pull-requests');
  assert.deepEqual(JSON.parse(post.init.body), { url: 'https://github.com/acme/app/pull/41' });
  assert.equal(elements.get('#issue-pull-request-dialog').open, false);
  assert.deepEqual(reports.at(-1), ['Pull request linked.', undefined]);

  project.github_repository = null;
  ui.renderCommits();
  assert.equal(elements.get('#issue-commits').hidden, true);
  assert.equal(elements.get('#copy-issue-branch-button').hidden, true);
  await ui.loadCommits(12);
  assert.equal(requests.filter(({ path }) => path.endsWith('/commits')).length, 1);
});
