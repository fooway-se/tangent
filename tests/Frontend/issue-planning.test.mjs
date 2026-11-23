import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const issueBoardUi = await readFile(new URL('../../frontend/src/issue-board-ui.ts', import.meta.url), 'utf8');
const issueRowUi = await readFile(new URL('../../frontend/src/issue-row-ui.ts', import.meta.url), 'utf8');
const dom = await readFile(new URL('../../frontend/src/dom.ts', import.meta.url), 'utf8');
const css = await readFile(new URL('../../public/assets/app.css', import.meta.url), 'utf8');

test('issue ordering offers a dedicated Next Up view', () => {
  assert.match(html, /<option value="next_up">Order: Next up<\/option>/);
  assert.match(app, /function renderNextUpIssueBoard\(/);
  assert.match(app, /issueGrouping\.disabled = true/);
  assert.match(app, /issueGrouping\.value = issueGroupingBeforeNextUp/);
  assert.match(app, /issueOrder\.value = 'updated';\s*synchronizeIssueGroupingForOrder\(\)/);
});

test('issue rows show their milestone and Next Up exposes accessible move controls', () => {
  assert.match(issueRowUi, /issue-milestone-tag/);
  assert.match(issueRowUi, /dataset\.moveDirection = direction/);
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
  assert.match(issueBoardUi, /function createGroupSummary\(name: string, count: number\)/);
  assert.match(issueBoardUi, /details\.open = group\.openByDefault \?\? true/);
  assert.match(issueBoardUi, /summary\.className = 'issue-group-summary'/);
  assert.match(issueBoardUi, /groupCount\.textContent = String\(count\)/);
  assert.match(issueBoardUi, /createGroupSummary\(group\.name, group\.issues\.length\)/);
  assert.match(app, /issueBoardUi\.render\(groups\)/);
});

test('history milestone groups start collapsed and existing disclosure state is preserved', () => {
  const milestoneBoardStart = app.indexOf('function renderMilestoneIssueBoard(');
  const milestoneBoardEnd = app.indexOf('\nfunction renderNextUpIssueBoard(', milestoneBoardStart);
  const milestoneBoard = app.slice(milestoneBoardStart, milestoneBoardEnd);
  assert.match(milestoneBoard, /openByDefault: issueScope\.value !== 'history'/);
  assert.match(issueBoardUi, /if \(details === undefined\) \{\s*details = doc\.createElement\('details'\);\s*details\.open = group\.openByDefault \?\? true;/);
});

test('No milestone bulk move uses the shared selection and action-group design', () => {
  assert.match(app, /allowBulkMove: group\.milestoneId === null/);
  assert.match(issueBoardUi, /issue-bulk-select-toggle/);
  assert.match(app, /issue-bulk-move-toolbar/);
  assert.match(app, /selectionActions\.className = 'issue-bulk-move-selection-actions'/);
  assert.match(app, /selectionLabel\.textContent = 'Selection'/);
  assert.match(app, /actionGroup\.className = 'issue-bulk-move-action-group'/);
  assert.match(app, /milestoneLabel\.textContent = 'Milestone'/);
  assert.match(app, /selectAll\.textContent = 'Select all'/);
  assert.match(app, /moveButton\.textContent = 'Move'/);
  assert.match(app, /moveButton\.setAttribute\('aria-label', 'Move selected issues'\)/);
  assert.match(app, /\/projects\/\$\{projectId\}\/issues\/move-to-milestone/);
  assert.match(css, /\.issue-bulk-move-toolbar\s*\{/);
  assert.match(css, /\.issue-bulk-move-selection-actions\s*\{/);
  assert.match(css, /\.issue-bulk-move-action-group\s*\{/);
});

test('issue board offers opt-in bulk assignment across milestone groups', () => {
  assert.match(html, /id="issue-bulk-assign-toggle"/);
  assert.match(dom, /issue-bulk-assign-toolbar/);
  assert.match(app, /issue-bulk-assign-checkbox/);
  assert.match(issueBoardUi, /const allowBulkAssignSelection = state\.bulkAssignSelectionMode/);
  assert.match(app, /visibleBulkAssignIssueIds = new Set\(visible\.map\(\(issue\) => issue\.id\)\)/);
  assert.match(html, /Assign selected/);
  assert.match(html, /Unassigned/);
  assert.match(app, /\/projects\/\$\{projectId\}\/issues\/assign/);
  assert.match(css, /\.issue-bulk-assign-toolbar\s*\{/);
});

test('issue selection toolbar groups selection, assignment, and guest-access controls', () => {
  const toolbarStart = html.indexOf('id="issue-bulk-assign-toolbar"');
  const toolbarEnd = html.indexOf('\n                </div>\n                <ul id="issue-list"', toolbarStart);
  const toolbar = html.slice(toolbarStart, toolbarEnd);
  const selectionStart = toolbar.indexOf('class="issue-bulk-selection-actions"');
  const selection = toolbar.slice(selectionStart, toolbar.indexOf('</div>', selectionStart));
  const assignmentStart = toolbar.indexOf('class="issue-bulk-action-group issue-bulk-assignment-actions"');
  const assignment = toolbar.slice(assignmentStart, toolbar.indexOf('</div>', assignmentStart));
  const guestAccessStart = toolbar.indexOf('class="issue-bulk-action-group issue-bulk-sharing-actions"');
  const guestAccess = toolbar.slice(guestAccessStart, toolbar.indexOf('</div>', guestAccessStart));

  assert.match(selection, /Selection/);
  assert.match(selection, /Select visible/);
  assert.match(selection, /Cancel/);
  assert.match(assignment, /aria-label="Assignment"/);
  assert.doesNotMatch(assignment, />Assignment</);
  assert.match(assignment, /aria-label="Assign selected issues to"/);
  assert.match(assignment, /class="button button-primary issue-bulk-assign-apply" type="button"[^>]*>Assign<\/button>/);
  assert.match(guestAccess, /Guest access/);
  assert.match(guestAccess, /class="button button-primary issue-bulk-share-apply" type="button"[^>]*>Share<\/button>/);
  assert.match(guestAccess, /class="button button-secondary issue-bulk-unshare-apply" type="button"[^>]*>Unshare<\/button>/);
  assert.match(css, /\.issue-bulk-selection-actions\s*\{[^}]*flex:\s*0 0 auto/);
  assert.match(css, /\.issue-bulk-selection-actions\s*\{[^}]*flex-wrap:\s*nowrap/);
  assert.doesNotMatch(toolbar, /Guests with access to this project can see shared issues/);
  assert.match(app, /function updateSelectedIssuesSharing\(isShared: boolean\)/);
  assert.match(app, /\/projects\/\$\{projectId\}\/issues\/share/);
  assert.match(app, /JSON\.stringify\(\{\s*issue_ids: issueIds,\s*is_shared: isShared\s*\}\)/);
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
  assert.match(issueRowUi, /if \(issue\.is_shared\)/);
  assert.match(issueRowUi, /issue-shared-tag/);
  assert.match(issueRowUi, /shared\.textContent = 'Shared'/);
});

test('issue type, sharing, milestone, and assignee metadata use one typography rule', () => {
  assert.match(css, /\.issue-metadata\s*\{[^}]*font:\s*400 11px\/1\.5 var\(--font-mono\)/);
});
