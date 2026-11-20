import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const css = await readFile(new URL('../../public/assets/app.css', import.meta.url), 'utf8');

test('milestone management stays behind a button beside project progress', () => {
  const progressStart = html.indexOf('<section class="issue-progress-strip"');
  const progressEnd = html.indexOf('</section>', progressStart);
  assert.notEqual(progressStart, -1);
  assert.match(html.slice(progressStart, progressEnd), /id="manage-milestones-button"/);
  assert.match(html, /<dialog id="milestone-manager-dialog"/);
});

test('milestone dialog provides a list and compact create/edit form', () => {
  assert.match(html, /id="milestone-list"/);
  assert.match(html, /id="milestone-form"/);
  assert.match(html, /id="milestone-name-input"[^>]*required/);
  assert.match(html, /id="milestone-due-date-input"[^>]*type="date"/);
  assert.match(html, /id="milestone-form-cancel"/);
});

test('milestone manager loads and saves project milestones through the existing API', () => {
  assert.match(app, /function renderMilestoneList\(/);
  assert.match(app, /method: editingId === null \? 'POST' : 'PATCH'/);
  assert.match(app, /`\/projects\/\$\{projectId\}\/milestones\/\$\{editingId\}`/);
});

test('issue board has separate current-work and history views for archived milestone issues', () => {
  assert.match(html, /id="issue-scope"/);
  assert.match(html, /<option value="active">Current work<\/option>/);
  assert.match(html, /<option value="history">History<\/option>/);
  assert.match(app, /filterIssuesByMilestoneArchive\(/);
});

test('milestone manager offers archive and restore actions without deleting milestones', () => {
  assert.match(app, /milestone\.archived_at !== null/);
  assert.match(app, /Archive/);
  assert.match(app, /Restore/);
  assert.match(app, /async function setMilestoneArchived\(/);
});

test('saving a milestone refreshes issue labels and quick-add choices', () => {
  const saveStart = app.indexOf('async function saveMilestone(');
  const saveEnd = app.indexOf('\nasync function ', saveStart + 1);
  const save = app.slice(saveStart, saveEnd === -1 ? undefined : saveEnd);

  assert.match(save, /populateIssueMilestoneSelect\(issueQuickAddMilestone,/);
  assert.match(save, /renderProjectIssueBoard\(\)/);
});

test('milestone list shows issue progress and a green completion indicator', () => {
  assert.match(app, /milestoneProgress\(milestoneIssues\)/);
  assert.match(app, /milestone-row-progress/);
  assert.match(app, /✓ Complete/);
  assert.match(css, /\.milestone-row-progress\.is-complete[^\{]*\{[^}]*var\(--success\)/);
});

test('milestone deletion uses an in-app confirmation and explains linked issue behavior', () => {
  assert.match(app, /remove\.setAttribute\('aria-label', `Delete milestone:/);
  assert.match(html, /<dialog id="milestone-delete-confirmation"[^>]*aria-labelledby="milestone-delete-heading"/);
  assert.match(html, /id="milestone-delete-description"/);
  assert.match(html, /id="milestone-delete-cancel"/);
  assert.match(html, /id="milestone-delete-confirm"/);
  assert.match(app, /function openMilestoneDeleteConfirmation\(/);
  assert.match(app, /milestoneDeleteConfirmation\.showModal\(\)/);
  assert.match(app, /milestoneDeleteConfirm\.addEventListener\('click'/);
  assert.doesNotMatch(app, /window\.(?:alert|confirm|prompt)\s*\(/);
  assert.match(app, /async function deleteMilestone\(/);
  assert.match(app, /api\(`\/projects\/\$\{projectId\}\/milestones\/\$\{milestone\.id\}`/);
  assert.match(app, /method:\s*'DELETE'/);
  assert.match(app, /projectMilestones = projectMilestones\.filter/);
  assert.match(app, /projectIssues = projectIssues\.map/);
  assert.match(app, /renderProjectIssueBoard\(\)/);
  assert.match(app, /milestone_id === milestone\.id/);
  assert.match(app, /populateIssueMilestoneSelect\(issueQuickAddMilestone,/);
});

test('milestone rows can be deleted from the keyboard when focused', () => {
  assert.match(app, /row\.tabIndex = 0/);
  assert.match(app, /row\.setAttribute\('aria-keyshortcuts', 'Delete'\)/);
  assert.match(app, /row\.addEventListener\('keydown'/);
  assert.match(app, /event\.key !== 'Delete'/);
  assert.match(app, /if \(nextMilestoneRow === undefined\) milestoneNameInput\.focus\(\);\s*else nextMilestoneRow\.focus\(\);/);
});

test('opening the milestone manager focuses a milestone when available', () => {
  const openStart = app.indexOf('function openMilestoneManager(');
  const openEnd = app.indexOf('\nfunction closeMilestoneManager(', openStart + 1);
  const open = app.slice(openStart, openEnd);
  assert.match(open, /milestoneManagerDialog\.showModal\(\)/);
  assert.match(open, /const firstMilestoneRow = milestoneList\.querySelector/);
  assert.match(open, /if \(firstMilestoneRow === null\) milestoneNameInput\.focus\(\);\s*else firstMilestoneRow\.focus\(\);/);
});
