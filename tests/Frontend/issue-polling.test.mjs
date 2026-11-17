import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  diffIssueCollections,
  nextIssuePollDelay,
  shouldDeferIssueUpdates,
} from '../../public/assets/issue-polling.js';

const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');

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
  assert.match(app, /issueRowRenderSignatures/);
  assert.match(app, /const deferUpdates = deferUpdatesAtStart \|\| issueUpdatesAreDeferred\(\)/);

  const renderStart = app.indexOf('function renderProjectIssueBoard(');
  const renderEnd = app.indexOf('\nfunction renderMilestoneIssueBoard(', renderStart);
  const renderer = app.slice(renderStart, renderEnd);
  assert.match(renderer, /reconcileIssueBoardGroups/);
  assert.doesNotMatch(renderer, /issueList\.replaceChildren\(/);
  assert.match(app, /function placeNodeAtPosition\(/);
  assert.doesNotMatch(app, /rows\.append\(row\)/);
  assert.doesNotMatch(app, /issueList\.append\(details\)/);
});
