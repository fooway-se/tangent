import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const css = await readFile(new URL('../../public/assets/app.css', import.meta.url), 'utf8');
const mobileStart = css.indexOf('@media (max-width: 760px) {');
const mobileEnd = css.indexOf('\n}', mobileStart);
const mobileCss = css.slice(mobileStart, mobileEnd);

test('mobile Lounge and project chats have bounded panels with their own message scrolling', () => {
  assert.match(mobileCss, /\.lounge-view\s*\{[^}]*height:\s*min\(70dvh,\s*640px\)/);
  assert.match(mobileCss, /\.lounge-chat-panel\s*\{[^}]*min-height:\s*0/);
  assert.match(mobileCss, /\.project-chat-column\s*\{[^}]*height:\s*min\(70dvh,\s*640px\)/);
  assert.match(mobileCss, /\.chat-message-list\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/);
});

test('mobile chat keeps the composer reachable and exposes the latest-message control', () => {
  assert.match(mobileCss, /\.chat-composer\s*\{[^}]*flex:\s*0 0 auto/);
  assert.match(mobileCss, /\.chat-latest-button:not\(\[hidden\]\)\s*\{[^}]*display:\s*flex/);
});

test('desktop chat panels retain their existing side-by-side sizing', () => {
  assert.match(css, /\.project-chat-column\s*\{\s*flex:\s*0 1 var\(--chat-width\);\s*min-width:\s*300px;\s*\}/);
  assert.match(css, /\.lounge-chat-panel\s*\{\s*display:\s*flex;\s*flex:\s*1;\s*flex-direction:\s*column;\s*min-height:\s*280px;\s*overflow:\s*hidden;/);
});
