import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_PROJECT_NOTES_MODE, renderMarkdown } from '../../public/assets/project-notes.js';

test('opens project notes in Preview mode', () => {
  assert.equal(DEFAULT_PROJECT_NOTES_MODE, 'preview');
});

test('renders common Markdown blocks and inline formatting', () => {
  const rendered = renderMarkdown([
    '# Project notes',
    '',
    'Keep **decisions** and `commands` here.',
    '',
    '- First item',
    '- Second item',
    '',
    '> Remember to review this.',
    '',
    '```sh',
    'npm run build',
    '```',
  ].join('\n'));

  assert.match(rendered, /<h1>Project notes<\/h1>/);
  assert.match(rendered, /Keep <strong>decisions<\/strong> and <code>commands<\/code> here\./);
  assert.match(rendered, /<ul><li>First item<\/li><li>Second item<\/li><\/ul>/);
  assert.match(rendered, /<blockquote><p>Remember to review this\.<\/p><\/blockquote>/);
  assert.match(rendered, /<pre><code class="language-sh">npm run build<\/code><\/pre>/);
});

test('escapes raw HTML and rejects unsafe Markdown links', () => {
  const rendered = renderMarkdown('<img src=x onerror=alert(1)> [run](javascript:alert(1))');

  assert.match(rendered, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(rendered, /<img(?:\s|>)/);
  assert.doesNotMatch(rendered, /<a[^>]*onerror=/);
  assert.doesNotMatch(rendered, /href="javascript:/);
});

test('keeps safe links and escapes their attributes', () => {
  const rendered = renderMarkdown('[docs](https://example.test/a?x=1&y=2)');

  assert.match(rendered, /<a href="https:\/\/example\.test\/a\?x=1&amp;y=2" target="_blank" rel="noopener noreferrer">docs<\/a>/);
});
