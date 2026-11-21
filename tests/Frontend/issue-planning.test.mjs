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
  assert.match(app, /className: 'issue-group milestone-issue-group'/);
});

test('Next Up keeps keyboard focus when a move disables the selected arrow', () => {
  const moveStart = app.indexOf('async function moveIssue(');
  const moveEnd = app.indexOf('\nfunction ', moveStart + 1);
  const move = app.slice(moveStart, moveEnd === -1 ? undefined : moveEnd);

  assert.match(move, /\[data-move-direction="\$\{direction\}"\]:not\(:disabled\)/);
  assert.match(move, /\?\?\s*movedIssueRow\?\.querySelector<HTMLElement>\('\.issue-title-button'\)/);
});

test('milestone groups are collapsible and their headings show issue counts', () => {
  assert.match(app, /function createIssueGroupSummary\(name: string, count: number\)/);
  assert.match(app, /details\.open = true/);
  assert.match(app, /summary\.className = 'issue-group-summary'/);
  assert.match(app, /groupCount\.textContent = String\(count\)/);
  assert.match(app, /createIssueGroupSummary\(group\.name, group\.issues\.length\)/);
  assert.match(app, /details\.open = true/);
  assert.match(app, /reconcileIssueBoardGroups\(groups\)/);
});

test('No milestone group offers opt-in bulk selection and a grouped milestone move action', () => {
  assert.match(app, /allowBulkMove: group\.milestoneId === null/);
  assert.match(app, /issue-bulk-select-toggle/);
  assert.match(app, /issue-bulk-move-toolbar/);
  assert.match(app, /Select all/);
  assert.match(app, /Move selected/);
  assert.match(app, /\/projects\/\$\{projectId\}\/issues\/move-to-milestone/);
  assert.match(css, /\.issue-bulk-move-toolbar\s*\{/);
});

test('issue board offers opt-in bulk assignment across milestone groups', () => {
  assert.match(html, /id="issue-bulk-assign-toggle"/);
  assert.match(app, /issue-bulk-assign-toolbar/);
  assert.match(app, /issue-bulk-assign-checkbox/);
  assert.match(app, /const allowBulkAssignSelection = bulkAssignSelectionMode/);
  assert.match(app, /visibleBulkAssignIssueIds = new Set\(visible\.map\(\(issue\) => issue\.id\)\)/);
  assert.match(html, /Assign selected/);
  assert.match(html, /Unassigned/);
  assert.match(app, /\/projects\/\$\{projectId\}\/issues\/assign/);
  assert.match(css, /\.issue-bulk-assign-toolbar\s*\{/);
});

test('ongoing issues are marked separately, grouped apart from unplanned work, and excluded from project progress', () => {
  assert.match(html, /name="is_ongoing"/);
  assert.match(app, /if \(issueQuickAddOngoing\.checked\) \{\s*issueInput\.is_ongoing = true/);
  assert.match(app, /projectProgress\(projectIssues\)/);
  assert.match(app, /group\.isOngoing \? 'milestone:ongoing'/);
  assert.match(app, /issue\.is_ongoing/);
  assert.match(css, /\.issue-ongoing-tag\s*\{/);
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
  assert.match(css, /\.issue-metadata\s*\{[^}]*font:\s*400 11px\/1\.5 var\(--font-mono\)/);
});
