import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const dom = await readFile(new URL('../../frontend/src/dom.ts', import.meta.url), 'utf8');

test('central DOM bindings point to elements present in the application shell', () => {
  const selectors = [...dom.matchAll(/document\.querySelector<[^>]+>\('([^']+)'\)!/g)].map((match) => match[1]);
  assert.equal(selectors.length, 160);
  assert.equal(new Set(selectors).size, selectors.length);

  for (const selector of selectors) {
    if (selector.startsWith('#')) {
      assert.ok(html.includes(`id="${selector.slice(1)}"`), `missing ${selector}`);
    } else if (selector.startsWith('.')) {
      assert.match(html, new RegExp(`class="[^"]*\\b${selector.slice(1)}\\b`), `missing ${selector}`);
    } else if (selector.startsWith('input[name=')) {
      assert.ok(html.includes(selector.slice('input['.length, -1)), `missing ${selector}`);
    } else {
      assert.fail(`unsupported selector ${selector}`);
    }
  }
});
