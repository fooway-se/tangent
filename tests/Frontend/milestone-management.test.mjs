import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const milestoneUi = await readFile(new URL('../../frontend/src/milestone-ui.ts', import.meta.url), 'utf8');
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
  assert.match(milestoneUi, /function renderList\(/);
  assert.match(milestoneUi, /method: editingId === null \? 'POST' : 'PATCH'/);
  assert.match(milestoneUi, /`\/projects\/\$\{projectId\}\/milestones\/\$\{editingId\}`/);
});

test('issue board has separate current-work and history views for archived milestone issues', () => {
  assert.match(html, /id="issue-scope"/);
  assert.match(html, /<option value="active">Current work<\/option>/);
  assert.match(html, /<option value="history">History<\/option>/);
  assert.match(app, /filterIssuesByMilestoneArchive\(/);
});

test('milestone manager offers archive and restore actions without deleting milestones', () => {
  assert.match(milestoneUi, /milestone\.archived_at !== null/);
  assert.match(milestoneUi, /Archive/);
  assert.match(milestoneUi, /Restore/);
  assert.match(milestoneUi, /async function setArchived\(/);
});

test('saving a milestone refreshes issue labels and quick-add choices', () => {
  const saveStart = milestoneUi.indexOf('async function save(');
  const saveEnd = milestoneUi.indexOf('\n  async function removeMilestone(', saveStart + 1);
  const save = milestoneUi.slice(saveStart, saveEnd);

  assert.match(save, /populateIssueMilestoneSelect\(quickAddMilestone,/);
  assert.match(save, /options\.renderProjectIssueBoard\(\)/);
});

test('milestone list shows issue progress and a green completion indicator', () => {
  assert.match(milestoneUi, /milestoneProgress\(milestoneIssues\)/);
  assert.match(milestoneUi, /milestone-row-progress/);
  assert.match(milestoneUi, /✓ Complete/);
  assert.match(css, /\.milestone-row-progress\.is-complete[^\{]*\{[^}]*var\(--success\)/);
});

test('milestone deletion uses an in-app confirmation and explains linked issue behavior', () => {
  assert.match(milestoneUi, /remove\.setAttribute\('aria-label', `Delete milestone:/);
  assert.match(html, /<dialog id="milestone-delete-confirmation"[^>]*aria-labelledby="milestone-delete-heading"/);
  assert.match(html, /id="milestone-delete-description"/);
  assert.match(html, /id="milestone-delete-cancel"/);
  assert.match(html, /id="milestone-delete-confirm"/);
  assert.match(milestoneUi, /function openDeleteConfirmation\(/);
  assert.match(milestoneUi, /deleteConfirmation\.showModal\(\)/);
  assert.match(milestoneUi, /deleteConfirmButton\.addEventListener\('click'/);
  assert.doesNotMatch(milestoneUi, /window\.(?:alert|confirm|prompt)\s*\(/);
  assert.match(milestoneUi, /async function removeMilestone\(/);
  assert.match(milestoneUi, /api\(`\/projects\/\$\{projectId\}\/milestones\/\$\{milestone\.id\}`/);
  assert.match(milestoneUi, /method:\s*'DELETE'/);
  assert.match(milestoneUi, /options\.setMilestones\(options\.getMilestones\(\)\.filter/);
  assert.match(milestoneUi, /options\.setIssues\(options\.getIssues\(\)\.map/);
  assert.match(milestoneUi, /options\.renderProjectIssueBoard\(\)/);
  assert.match(milestoneUi, /milestone_id === milestone\.id/);
  assert.match(milestoneUi, /populateIssueMilestoneSelect\(\s*quickAddMilestone,/);
});

test('milestone rows can be deleted from the keyboard when focused', () => {
  assert.match(milestoneUi, /row\.tabIndex = 0/);
  assert.match(milestoneUi, /row\.setAttribute\('aria-keyshortcuts', 'Delete'\)/);
  assert.match(milestoneUi, /row\.addEventListener\('keydown'/);
  assert.match(milestoneUi, /event\.key !== 'Delete'/);
  assert.match(milestoneUi, /if \(nextMilestoneRow === undefined\) milestoneNameInput\.focus\(\);\s*else nextMilestoneRow\.focus\(\);/);
});

test('opening the milestone manager focuses a milestone when available', () => {
  const openStart = milestoneUi.indexOf('function open(): void');
  const openEnd = milestoneUi.indexOf('\n  function close()', openStart + 1);
  const open = milestoneUi.slice(openStart, openEnd);
  assert.match(open, /managerDialog\.showModal\(\)/);
  assert.match(open, /const firstMilestoneRow = milestoneList\.querySelector/);
  assert.match(open, /if \(firstMilestoneRow === null\) milestoneNameInput\.focus\(\);\s*else firstMilestoneRow\.focus\(\);/);
});
