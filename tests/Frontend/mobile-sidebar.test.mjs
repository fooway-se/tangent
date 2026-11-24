import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile(new URL('../../public/assets/app.css', import.meta.url), 'utf8');
const mobileStart = css.indexOf('@media (max-width: 760px) {');
const mobileEnd = css.indexOf('\n}', mobileStart);
const mobileCss = css.slice(mobileStart, mobileEnd);
const narrowStart = css.indexOf('@media (max-width: 520px) {');
const narrowEnd = css.indexOf('\n}', narrowStart);
const narrowCss = css.slice(narrowStart, narrowEnd);

test('mobile workspace navigation gets a full-width row below the brand and account', () => {
  assert.match(mobileCss, /\.workspace-nav\s*\{[^}]*grid-column:\s*1 \/ -1;[^}]*grid-row:\s*2;/);
});

test('mobile workspace navigation uses equal-width responsive columns', () => {
  assert.match(mobileCss, /\.workspace-nav\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(140px,\s*1fr\)\);/);
});

test('narrow mobile brand and navigation share one full-width grid track', () => {
  assert.match(narrowCss, /\.workspace-sidebar\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
});
