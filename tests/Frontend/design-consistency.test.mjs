import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile(new URL('../../public/assets/app.css', import.meta.url), 'utf8');

function rule(selector) {
  const start = css.split('\n').findIndex((entry) => entry.trimStart().startsWith(`${selector} {`));
  assert.notEqual(start, -1, `CSS rule exists for ${selector}`);
  const lines = css.split('\n');
  const block = [];
  let depth = 0;
  for (const line of lines.slice(start)) {
    block.push(line);
    depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
    if (depth === 0) break;
  }
  return block.join('\n');
}

test('all workspace views share one deep-blue canvas', () => {
  assert.match(rule(':root'), /background:\s*var\(--deep-blue\)/);
  for (const selector of ['.workspace-content', '.project-view', '.project-chat-column']) {
    assert.match(rule(selector), /background:\s*var\(--deep-blue\)/, `${selector} uses the workspace canvas`);
  }
});

test('panels, controls, and buttons share square corners and theme tokens', () => {
  for (const selector of ['.panel', '.button', 'input, textarea, select']) {
    assert.match(rule(selector), /border-radius:\s*0(?:px)?\s*;/, `${selector} has square corners`);
    assert.match(rule(selector), /border:\s*1px solid var\(--border\)/, `${selector} uses the shared border token`);
  }
  assert.match(rule(':root'), /font-family:\s*ui-monospace/);
});
