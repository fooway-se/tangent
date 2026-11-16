import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');

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
