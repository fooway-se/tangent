import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const tokens = await readFile(new URL('../../public/assets/tokens.css', import.meta.url), 'utf8');
const css = await readFile(new URL('../../public/assets/app.css', import.meta.url), 'utf8');
const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');

function rule(source, selector) {
  const lines = source.split('\n');
  const start = lines.findIndex((entry) => entry.trimStart().startsWith(`${selector} {`));
  assert.notEqual(start, -1, `CSS rule exists for ${selector}`);
  const block = [];
  let depth = 0;
  for (const line of lines.slice(start)) {
    block.push(line);
    depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
    if (depth === 0) break;
  }
  return block.join('\n');
}

test('tokens.css is linked before app.css so every view shares one palette', () => {
  const tokenLink = html.indexOf('href="./assets/tokens.css"');
  const appLink = html.indexOf('href="./assets/app.css"');
  assert.notEqual(tokenLink, -1, 'tokens.css is linked');
  assert.ok(tokenLink < appLink, 'tokens.css comes first');
});

test('every CSS variable used by app.css is defined as a token', () => {
  const used = new Set([...css.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]));
  const defined = new Set([...`${tokens}\n${css}`.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((match) => match[1]));
  const missing = [...used].filter((name) => !defined.has(name));
  assert.deepEqual(missing, [], `undefined variables: ${missing.join(', ')}`);
});

test('app.css takes colours from tokens instead of hard-coding them', () => {
  assert.deepEqual(css.match(/#[0-9a-f]{3,6}\b/gi) ?? [], [], 'no hex colours in app.css');
});

test('saved login autofill fields keep the dark screen colours', () => {
  assert.match(css, /\.login-panel input:autofill/);
  assert.match(css, /\.login-panel input:-webkit-autofill/);
  assert.match(css, /-webkit-text-fill-color:\s*var\(--screen-ink\)/);
  assert.match(css, /-webkit-box-shadow:[^;]*var\(--screen-field\) inset/);
});

test('invite description is separated from the password form', () => {
  assert.match(css, /\.auth-flow > \.panel-description \{[^}]*margin-bottom:\s*14px;/);
});

test('the palette is a beige case holding dark screens with an amber accent', () => {
  const root = rule(tokens, ':root');
  for (const token of ['--case-top', '--case-mid', '--case-bottom', '--key-top', '--cap-top', '--screen', '--screen-panel', '--accent']) {
    assert.match(root, new RegExp(`${token}:\\s*#[0-9a-f]{6}`, 'i'), `${token} is a hex colour`);
  }
  assert.match(root, /--signal-stripe:\s*linear-gradient/);
  assert.match(rule(css, 'body'), /background:\s*linear-gradient\([^;]*var\(--case-top\)/, 'the page is the case');
  for (const selector of ['.workspace-screen, .project-chat-column']) {
    assert.match(rule(css, selector), /var\(--screen\)/, `${selector} is a dark screen`);
  }
  assert.match(rule(css, '.keyboard-hints'), /var\(--footer-top\)/, 'the keyboard strip is on the case');
});

test('active project links use foreground text with sufficient contrast on the accent', () => {
  const activeProjectLink = rule(css, '.workspace-nav-button.is-active, .project-sidebar-link.is-active');
  assert.match(activeProjectLink, /color:\s*var\(--accent-ink\)/);
});

test('screens, panels and controls use the shared corner scale and borders', () => {
  const root = rule(tokens, ':root');
  for (const token of ['--radius-screen', '--radius-panel', '--radius-key', '--radius-cap']) {
    assert.match(root, new RegExp(`${token}:\\s*\\d+px`), `${token} is a pixel radius`);
  }
  assert.match(rule(css, '.workspace-screen, .project-chat-column'), /border-radius:\s*var\(--radius-screen\)/);
  for (const selector of ['.panel', '.button', 'input, textarea, select']) {
    assert.match(rule(css, selector), /border-radius:\s*var\(--radius-panel\)/, `${selector} uses the shared corner`);
    assert.match(rule(css, selector), /border:\s*1px solid var\(--screen-border\)/, `${selector} uses the shared border`);
  }
  assert.match(rule(css, ':root'), /font-family:\s*var\(--font-mono\)/);
  assert.match(rule(tokens, ':root'), /--font-mono:[^;]*ui-monospace/, 'monospace falls back to the platform font');
});

test('issue sharing checkboxes sit beside their labels and keep a compact control size', () => {
  assert.match(rule(css, '.form-check-label'), /display:\s*flex/);
  assert.match(rule(css, '.form-check-label'), /align-items:\s*center/);
  assert.match(rule(css, '.form-check-label input[type="checkbox"]'), /width:\s*16px/);
  assert.match(rule(css, '.form-check-label input[type="checkbox"]'), /box-shadow:\s*none/);
});

test('every screen and dialog header carries the signal stripe', () => {
  for (const selector of ['.workspace-nav::before', '.workspace-topbar::after, .chat-heading::after', '.dialog-heading::after', '.topbar::after']) {
    assert.match(rule(css, selector), /background:\s*var\(--signal-stripe\)/, `${selector} draws the stripe`);
  }
});

test('shortcut keys are black keycaps on the case and beige keys elsewhere', () => {
  assert.match(rule(css, '.keyboard-hints kbd'), /var\(--cap-top\)/);
  assert.match(rule(css, 'kbd'), /var\(--key-top\)/);
});

test('app.css uses the shape tokens instead of hard-coded corner radii', () => {
  assert.deepEqual(css.match(/border-radius:\s*(?:4|5|6|7|18)px/g) ?? [], [], 'use --radius-cap/-panel/-key/-screen');
  assert.deepEqual(css.match(/rgba\(239,\s*153,\s*39/g) ?? [], [], 'accent tints derive from --accent');
});

test('stacked admin panels are spaced and quiet row actions are visible', () => {
  assert.match(css, /\.workspace-admin-tab-panel > \.panel \+ \.panel \{[^}]*margin-top:/);
  assert.match(css, /\.member-list \.button-quiet \{[^}]*border-color:\s*var\(--screen-border\)/);
});

test('no text is set below the 11px minimum', () => {
  const tooSmall = [...css.matchAll(/font(?:-size)?:[^;}]*?\b(\d+(?:\.\d+)?)px/g)]
    .filter((match) => Number(match[1]) < 11)
    .map((match) => match[0]);
  assert.deepEqual(tooSmall, []);
});

test('issue list metadata is plain text, not bordered chips', () => {
  for (const selector of ['.issue-type-tag', '.issue-priority-tag', '.issue-due-date-tag', '.issue-shared-tag', '.issue-milestone-tag', '.inbox-issue-status']) {
    const line = css.split('\n').filter((entry) => entry.startsWith(`${selector} {`) || entry.includes(`, ${selector} {`)).join('');
    assert.doesNotMatch(line, /border:\s*1px/, `${selector} has no chip border`);
  }
});

test('issue detail section labels share one label style', () => {
  const labels = ['.issue-detail-brief > summary', '.issue-status-history > summary', '.issue-discussion-heading h3', '.issue-detail-metadata dt'];
  const line = css.split('\n').find((entry) => entry.startsWith('.issue-detail-metadata dt'));
  assert.ok(line, 'shared label rule exists');
  for (const label of labels) assert.ok(line.includes(label), `${label} uses the shared label rule`);
  assert.match(line, /font:\s*700 11px\/1\.4 var\(--font-display\)/);
});
