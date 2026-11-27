import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile(new URL('../../public/assets/app.css', import.meta.url), 'utf8');

function mediaBlock(query) {
  const start = css.indexOf(`@media ${query} {`);
  assert.notEqual(start, -1, `media query exists: ${query}`);

  const opening = css.indexOf('{', start);
  let depth = 0;
  for (let index = opening; index < css.length; index++) {
    if (css[index] === '{') depth++;
    if (css[index] === '}' && --depth === 0) return css.slice(opening + 1, index);
  }
  assert.fail(`media query is not closed: ${query}`);
}

function selectorsHiddenIn(styles) {
  return [...styles.matchAll(/([^{}]+)\{\s*display:\s*none;\s*\}/g)]
    .flatMap((match) => match[1].split(',').map((selector) => selector.trim()));
}

test('hides branded vents at mobile width', () => {
  const hidden = selectorsHiddenIn(mediaBlock('(max-width: 760px)'));

  for (const theme of ['broadcast', 'pc88']) {
    assert.ok(
      hidden.includes(`:root[data-theme="${theme}"] .workspace-brand::before`),
      `${theme} grille is hidden at mobile width`,
    );
  }
});

test('hides desktop vents through the first constrained-sidebar stage', () => {
  assert.match(css, /\.workspace-sidebar\.is-project-sidebar-space-constrained::before\s*\{\s*display:\s*none;/);
  assert.match(css, /:root \.workspace-sidebar\.is-project-sidebar-space-constrained \.workspace-brand::before\s*\{\s*display:\s*none;/);

  const shortDesktop = mediaBlock('(min-width: 761px) and (max-height: 560px)');
  assert.doesNotMatch(shortDesktop, /\.workspace-sidebar::before|\.workspace-brand::before/);
});
