import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');

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
