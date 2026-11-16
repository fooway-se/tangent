import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');

test('project view has a compact progress strip, quick-add, and real issue controls', () => {
  for (const id of ['issue-progress', 'issue-progress-label', 'issue-filter', 'issue-order', 'issue-form']) {
    assert.ok(html.includes(`id="${id}"`), `${id} exists`);
  }
  assert.match(html, /Group: Status/);
  assert.match(html, /Order: Updated/);
});

test('the issue board keeps chat in its separate right column', () => {
  const center = html.indexOf('class="project-main"');
  const chat = html.indexOf('id="project-chat-column"');
  assert.ok(center >= 0 && chat > center);
});
