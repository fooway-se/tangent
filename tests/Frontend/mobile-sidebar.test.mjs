import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile(new URL('../../public/assets/app.css', import.meta.url), 'utf8');
const mobileStart = css.indexOf('@media (max-width: 760px) {');
const mobileEnd = css.indexOf('\n}', mobileStart);
const mobileCss = css.slice(mobileStart, mobileEnd);

test('mobile workspace navigation gets a full-width row below the brand and account', () => {
  assert.match(mobileCss, /\.workspace-nav\s*\{[^}]*grid-column:\s*1 \/ -1;[^}]*grid-row:\s*2;/);
});
