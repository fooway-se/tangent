import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  diffConditionalIssueCollections,
  diffIssueCollections,
  loadIssueCollections,
  nextIssuePollDelay,
  refreshDeletedIssuesOnOpen,
  shouldDeferIssueUpdates,
} from '../../public/assets/issue-polling.js';

const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const issueBoardUi = await readFile(new URL('../../frontend/src/issue-board-ui.ts', import.meta.url), 'utf8');
const issueBoardView = await readFile(new URL('../../frontend/src/issue-board-view.ts', import.meta.url), 'utf8');
const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');

test('issue collection diff identifies only added, changed, and removed issues', () => {
  const before = [
    { id: 1, title: 'Same', status: 'todo' },
    { id: 2, title: 'Old title', status: 'backlog' },
    { id: 3, title: 'Removed', status: 'done' },
  ];
  const after = [
    { id: 1, title: 'Same', status: 'todo' },
    { id: 2, title: 'New title', status: 'doing' },
    { id: 4, title: 'Added', status: 'backlog' },
  ];

  assert.deepEqual(diffIssueCollections(before, after), {
    added: [4],
    changed: [2],
    removed: [3],
  });
});

test('two unchanged issue responses skip collection diffs', () => {
  const issues = [{ id: 1, title: 'Current' }];
  assert.deepEqual(diffConditionalIssueCollections(issues, null, issues, null), {
    active: null,
    deleted: null,
  });
});

test('mixed issue responses only diff the collection with a response body', () => {
  const beforeActive = [{ id: 1, title: 'Old' }];
  const afterActive = [{ id: 1, title: 'New' }, { id: 2, title: 'Added' }];
  const deleted = [{ id: 3, title: 'Unchanged trash' }];
  assert.deepEqual(diffConditionalIssueCollections(beforeActive, afterActive, deleted, null), {
    active: { added: [2], changed: [1], removed: [] },
    deleted: null,
  });
});

test('active issue view does not fetch the deleted collection', async () => {
  let deletedRequests = 0;
  const result = await loadIssueCollections(
    async () => 'active',
    async () => { deletedRequests++; return 'deleted'; },
    false,
  );
  assert.deepEqual(result, { active: 'active', deleted: null });
  assert.equal(deletedRequests, 0);
});

test('opening deleted issues fetches that collection without waiting for active issues', async () => {
  let deletedRequests = 0;
  const result = await loadIssueCollections(
    async () => 'active',
    async () => { deletedRequests++; return 'deleted'; },
    true,
  );
  assert.deepEqual(result, { active: 'active', deleted: 'deleted' });
  assert.equal(deletedRequests, 1);
  assert.match(app, /deletedIssuesDetails\.addEventListener\('toggle'/);
  assert.match(app, /refreshDeletedIssuesOnOpen\(deletedIssuesDetails\.open, projectId, loadDeletedProjectIssues\)/);
  assert.match(html, /<details id="deleted-issues-details" class="deleted-issues-details">/);
});

test('opening deleted issues starts a refresh for the current project', async () => {
  const projects = [];
  await refreshDeletedIssuesOnOpen(true, 12, async (projectId) => { projects.push(projectId); });
  await refreshDeletedIssuesOnOpen(false, 12, async (projectId) => { projects.push(projectId); });
  await refreshDeletedIssuesOnOpen(true, null, async (projectId) => { projects.push(projectId); });
  assert.deepEqual(projects, [12]);
});

test('issue polling backs off when quiet, resets after changes, and slows in the background', () => {
  assert.equal(nextIssuePollDelay(1000, false, false), 1500);
  assert.equal(nextIssuePollDelay(9000, false, false), 10000);
  assert.equal(nextIssuePollDelay(9000, true, false), 1000);
  assert.equal(nextIssuePollDelay(1000, false, true), 5000);
  assert.equal(nextIssuePollDelay(9000, false, true), 10000);
});

test('issue updates wait while the user is editing issue controls', () => {
  assert.equal(shouldDeferIssueUpdates({ issueEditorOpen: true }), true);
  assert.equal(shouldDeferIssueUpdates({ quickAddActive: true }), true);
  assert.equal(shouldDeferIssueUpdates({ filterFocused: true }), true);
  assert.equal(shouldDeferIssueUpdates({ dialogOpen: true }), true);
  assert.equal(shouldDeferIssueUpdates({}), false);
});

test('issue polling is conditional and board rendering keeps unchanged issue rows', () => {
  assert.match(app, /headers\.set\('If-None-Match', etag\)/);
  assert.match(app, /fetchConditionalIssueList\(projectId, false, activeEtag\)/);
  assert.match(app, /fetchConditionalIssueList\(projectId, true, deletedEtag\)/);
  assert.match(app, /issuePollHasDeferredChanges/);
  assert.match(issueBoardUi, /rowRenderSignatures/);
  assert.match(app, /const deferUpdates = deferUpdatesAtStart \|\| issueUpdatesAreDeferred\(\)/);

  const renderer = issueBoardView;
  assert.match(renderer, /issueBoardUi\.render/);
  assert.doesNotMatch(renderer, /issueList\.replaceChildren\(/);
  assert.match(app, /function placeNodeAtPosition\(/);
  assert.doesNotMatch(app, /rows\.append\(row\)/);
  assert.doesNotMatch(app, /issueList\.append\(details\)/);
});
