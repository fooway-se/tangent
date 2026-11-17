import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../../public/assets/app.css', import.meta.url), 'utf8');
const tokens = await readFile(new URL('../../public/assets/tokens.css', import.meta.url), 'utf8');

test('sign-in uses a cream header over a night-sky screen with no vent strip', () => {
  assert.doesNotMatch(html, /login-vent/);
  assert.match(tokens, /--night:\s*#[0-9a-f]{6}/i);
  assert.match(css, /\.login-shell\s*\{[^}]*var\(--night\)/s);
  assert.match(css, /\.login-topbar\s*\{[^}]*var\(--case-top\)/s);
  assert.match(css, /\.login-shell::after\s*\{[^}]*var\(--signal-stripe\)/s);
});

test('the star field is a same-origin-safe data URI, not a remote asset', () => {
  assert.match(css, /\.login-shell\s*\{[^}]*url\("data:image\/svg\+xml,/s);
});
