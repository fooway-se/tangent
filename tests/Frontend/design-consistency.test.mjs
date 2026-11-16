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

test('all views use the warm shell and dark teal work surface palette', () => {
  assert.match(rule(':root'), /--canvas:\s*#[0-9a-f]{6}/i);
  assert.match(rule(':root'), /--accent:\s*#[0-9a-f]{6}/i);
  for (const selector of ['.workspace-sidebar', '.workspace-stage', '.keyboard-hints']) {
    assert.match(rule(selector), /background:\s*var\(--canvas\)/, `${selector} uses the warm shell`);
  }
  for (const selector of ['.workspace-content', '.project-view', '.project-chat-column']) {
    assert.match(rule(selector), /background:\s*var\(--deep-blue\)/, `${selector} uses the dark work surface`);
  }
});

test('shell, cards, and controls use the mockup corner scale and shared borders', () => {
  assert.match(rule(':root'), /--radius-shell:\s*\d+px/);
  assert.match(rule(':root'), /--radius-card:\s*\d+px/);
  assert.match(rule(':root'), /--radius-control:\s*\d+px/);
  assert.match(rule('.workspace-topbar'), /border-radius:\s*var\(--radius-shell\)/);
  assert.match(rule('.workspace-content'), /border-radius:\s*0\s+0\s+var\(--radius-shell\)/);
  for (const selector of ['.panel', '.button', 'input, textarea, select']) {
    assert.match(rule(selector), /border-radius:\s*var\(--radius-(?:card|control)\)/, `${selector} uses the shared corner scale`);
    const borderToken = selector === '.button' ? /border:\s*1px solid var\(--border-strong\)/ : /border:\s*1px solid var\(--border\)/;
    assert.match(rule(selector), borderToken, `${selector} uses the shared border token`);
  }
  assert.match(rule(':root'), /font-family:\s*ui-monospace/);
});

test('brand and main panel use the same striped signature accent', () => {
  assert.match(rule('.workspace-brand::after'), /background:\s*var\(--signal-stripe\)/);
  assert.match(rule('.workspace-content::before'), /background:\s*var\(--signal-stripe\)/);
});
