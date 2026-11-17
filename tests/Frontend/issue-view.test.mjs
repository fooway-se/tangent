import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const css = await readFile(new URL('../../public/assets/app.css', import.meta.url), 'utf8');

test('project view has a compact progress strip, quick-add, and real issue controls', () => {
  for (const id of ['issue-progress', 'issue-progress-label', 'issue-filter', 'issue-grouping', 'issue-order', 'issue-form']) {
    assert.ok(html.includes(`id="${id}"`), `${id} exists`);
  }
  assert.match(html, /<option value="status">Group: Status<\/option>/);
  assert.match(html, /<option value="milestone">Group: Milestone<\/option>/);
  assert.match(html, /Order: Updated/);
});

test('the issue board keeps chat in its separate right column', () => {
  const center = html.indexOf('class="project-main"');
  const chat = html.indexOf('id="project-chat-column"');
  assert.ok(center >= 0 && chat > center);
});

test('the issue grouping control switches between status and milestone groups', () => {
  assert.match(app, /issueGrouping\.addEventListener\('change', renderProjectIssueBoard\)/);
  assert.match(app, /if \(issueGrouping\.value === 'milestone'\) \{\s*renderMilestoneIssueBoard\(visible\)/);
  assert.match(app, /function renderMilestoneIssueBoard\(/);
});

test('quick add has a mouse cancel action and supports complete issue planning', () => {
  for (const id of [
    'issue-quick-add-cancel', 'issue-quick-add-milestone',
    'issue-quick-add-shared', 'issue-quick-add-approval',
  ]) {
    assert.ok(html.includes(`id="${id}"`), `${id} exists`);
  }
  assert.match(html, /id="issue-quick-add-cancel"[^>]*>Cancel/);
  assert.match(app, /issueQuickAddCancelButton\.addEventListener\('click'/);
  assert.match(app, /milestone_id:/);
  assert.match(app, /is_shared:/);
  assert.match(app, /approval_requested:/);
  assert.match(css, /\.issue-quick-add-actions\s*\{[^}]*display:\s*flex/);
});

test('canceling quick add keeps focus inside the active project', () => {
  assert.match(app, /projectView\.contains\(target\)/);
  assert.match(app, /issuesTabButton\.focus\(\)/);
});

test('quick-add controls appear only while the form is active and align as a group', () => {
  assert.match(app, /issueForm\.classList\.toggle\('is-active', active\)/);
  assert.match(app, /setIssueQuickAddActive\(true\)/);
  assert.match(app, /setIssueQuickAddActive\(false\)/);
  assert.match(css, /\.issue-quick-add:not\(\.is-active\) \.issue-description-details,[\s\S]*?\.issue-quick-add:not\(\.is-active\) \.issue-quick-add-actions\s*\{\s*display:\s*none/);
  assert.match(css, /\.issue-quick-add-actions\s*\{[^}]*align-items:\s*center/);
});

test('Escape dismisses an active quick-add form before leaving the project', () => {
  const dismissHandler = app.slice(app.indexOf('function dismissCurrentView'), app.indexOf('function focusIssueQuickAddReturnTarget'));
  assert.match(dismissHandler, /issueForm\.classList\.contains\('is-active'\)/);
  assert.match(dismissHandler, /cancelIssueQuickAdd\(\)/);
});
