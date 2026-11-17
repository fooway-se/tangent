import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const css = await readFile(new URL('../../public/assets/app.css', import.meta.url), 'utf8');

test('issue detail editor sits in the center pane beside project chat', () => {
  const projectMainStart = html.indexOf('class="project-main"');
  const issueDetailStart = html.indexOf('id="issue-detail-view"', projectMainStart);
  const chatStart = html.indexOf('id="project-chat-column"', projectMainStart);
  assert.notEqual(issueDetailStart, -1, 'issue detail view exists');
  assert.ok(issueDetailStart < chatStart, 'issue detail view precedes the right chat column');

  const detail = html.slice(issueDetailStart, chatStart);
  for (const id of [
    'issue-back-button',
    'issue-detail-title',
    'issue-detail-description',
    'issue-detail-status',
    'issue-detail-edit-form',
    'issue-detail-title-input',
    'issue-detail-description-input',
    'issue-source-link',
    'issue-status-history',
    'issue-status-history-list',
  ]) {
    assert.ok(detail.includes(`id="${id}"`), `${id} is present in the detail view`);
  }
});

test('issue detail can save existing editable fields and jump to its source message', () => {
  assert.match(app, /api<\{ issue: Issue \}>\s*\(`\/issues\/\$\{issue\.id\}`/);
  assert.match(app, /method:\s*'PATCH'/);
  assert.match(app, /source_message_id/);
  assert.match(app, /scrollIntoView/);
});

test('issue detail loads a compact status history with actor and time', () => {
  assert.match(html, /<details id="issue-status-history"/);
  assert.match(app, /`\/issues\/\$\{issueId\}\/history`/);
  assert.match(app, /transition\.actor_name/);
  assert.match(app, /transition\.created_at/);
});

test('status history has a strong visible keyboard focus state', () => {
  assert.match(css, /\.issue-status-history > summary:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--accent\)/);
  assert.match(css, /\.issue-status-history > summary:focus-visible\s*\{[^}]*background:\s*var\(--screen-control-top\)/);
  assert.match(css, /\.issue-status-history > summary:focus-visible\s*\{[^}]*box-shadow:\s*0 0 0 4px var\(--focus-ring\)/);
});
