import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const paletteCommands = await readFile(new URL('../../frontend/src/command-palette-commands.ts', import.meta.url), 'utf8');
const summaryUi = await readFile(new URL('../../frontend/src/client-summary-ui.ts', import.meta.url), 'utf8');
const api = await readFile(new URL('../../docs/openapi.yaml', import.meta.url), 'utf8');

test('summary is project-scoped in the command palette, not a persistent project-header control', () => {
  assert.match(paletteCommands, /label: 'Generate summary'/);
  assert.match(paletteCommands, /context\.activeProject !== null && user\.role === 'admin' && context\.projectViewVisible/);
  assert.match(app, /generateSummary: \(\) => clientSummaryUi\.open\(\)/);
  assert.doesNotMatch(html.slice(html.indexOf('id="project-view"'), html.indexOf('id="admin-view"')), /Generate summary/);
});

test('summary dialog offers a period, custom dates, editable preview, and copy action', () => {
  assert.match(html, /id="client-summary-dialog"/);
  assert.match(html, /id="client-summary-period"/);
  assert.match(html, /value="7">Last 7 days/);
  assert.match(html, /value="30">Last 30 days/);
  assert.match(html, /value="custom">Custom dates/);
  assert.match(html, /id="client-summary-from"[^>]*type="date"/);
  assert.match(html, /id="client-summary-to"[^>]*type="date"/);
  assert.match(html, /<textarea id="client-summary-preview"/);
  assert.match(html, /id="client-summary-copy"/);
  assert.match(summaryUi, /navigator\.clipboard\.writeText\(preview\.value\)/);
});

test('summary activity comes from an admin-only client-safe endpoint with a selected date range', () => {
  assert.match(summaryUi, /client-summary-updates\?from=/);
  assert.match(api, /\/projects\/\{id\}\/client-summary-updates/);
  assert.match(api, /Only workspace admins can request client summary activity/);
});
