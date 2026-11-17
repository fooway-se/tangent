import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const css = await readFile(new URL('../../public/assets/app.css', import.meta.url), 'utf8');

test('issue ordering offers a dedicated Next Up view', () => {
  assert.match(html, /<option value="next_up">Order: Next up<\/option>/);
  assert.match(app, /function renderNextUpIssueBoard\(/);
  assert.match(app, /issueGrouping\.disabled = true/);
  assert.match(app, /issueGrouping\.value = issueGroupingBeforeNextUp/);
  assert.match(app, /issueOrder\.value = 'updated';\s*synchronizeIssueGroupingForOrder\(\)/);
});

test('issue rows show their milestone and Next Up exposes accessible move controls', () => {
  assert.match(app, /issue-milestone-tag/);
  assert.match(app, /data-move-direction/);
  assert.match(app, /`\/issues\/\$\{issue\.id\}\/move`/);
  assert.match(app, /details\.className = 'issue-group milestone-issue-group'/);
});

test('milestone groups are collapsible and their headings show issue counts', () => {
  assert.match(app, /function createIssueGroupSummary\(name: string, count: number\)/);
  assert.match(app, /details\.open = true/);
  assert.match(app, /summary\.className = 'issue-group-summary'/);
  assert.match(app, /groupCount\.textContent = String\(count\)/);
  assert.match(app, /createIssueGroupSummary\(headingText, group\.issues\.length\)/);
});

test('issue rows mark shared issues and leave internal issues without a sharing badge', () => {
  const rowStart = app.indexOf('function createIssueRow(');
  const rowEnd = app.indexOf('\nfunction ', rowStart + 1);
  const row = app.slice(rowStart, rowEnd === -1 ? undefined : rowEnd);

  assert.match(row, /if \(issue\.is_shared\)/);
  assert.match(row, /issue-shared-tag/);
  assert.match(row, /shared\.textContent = 'Shared'/);
});

test('issue type, sharing, milestone, and assignee metadata use one typography rule', () => {
  assert.match(css, /\.issue-metadata > \*\s*\{[^}]*font:\s*400 10px\/1\.4 var\(--font-mono\)/);
});
