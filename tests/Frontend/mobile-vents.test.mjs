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

for (const [label, query] of [
  ['mobile width', '(max-width: 760px)'],
  ['short desktop height', '(min-width: 761px) and (max-height: 560px)'],
]) {
  test(`hides branded vents at ${label}`, () => {
    const hidden = selectorsHiddenIn(mediaBlock(query));

    for (const theme of ['broadcast', 'pc88']) {
      assert.ok(
        hidden.includes(`:root[data-theme="${theme}"] .workspace-brand::before`),
        `${theme} grille is hidden at ${label}`,
      );
    }
  });
}
