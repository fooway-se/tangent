import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const css = await readFile(new URL('../../public/assets/app.css', import.meta.url), 'utf8');

test('issue ordering offers a dedicated Next Up view', () => {
  assert.match(html, /<option value="next_up">Order: Next up<\/option>/);
  assert.match(app, /function renderNextUpIssueBoard\(/);
});

test('issue rows show their milestone and Next Up exposes accessible move controls', () => {
  assert.match(app, /issue-milestone-tag/);
  assert.match(app, /data-move-direction/);
  assert.match(app, /`\/issues\/\$\{issue\.id\}\/move`/);
  assert.match(css, /\.next-up-group-heading/);
});

test('issue rows mark shared issues and leave internal issues without a sharing badge', () => {
  const rowStart = app.indexOf('function createIssueRow(');
  const rowEnd = app.indexOf('\nfunction ', rowStart + 1);
  const row = app.slice(rowStart, rowEnd === -1 ? undefined : rowEnd);

  assert.match(row, /if \(issue\.is_shared\)/);
  assert.match(row, /issue-shared-tag/);
  assert.match(row, /shared\.textContent = 'Shared'/);
});
