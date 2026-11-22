import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const api = await readFile(new URL('../../docs/openapi.yaml', import.meta.url), 'utf8');

test('summary is project-scoped in the command palette, not a persistent project-header control', () => {
  const commands = app.slice(app.indexOf('function getPaletteCommands'), app.indexOf('function renderCommandResults'));
  assert.match(commands, /label: 'Generate summary'/);
  assert.match(commands, /activeProject !== null && activeUser\.role === 'admin' && !projectView\.hidden/);
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
  assert.match(app, /navigator\.clipboard\.writeText\(clientSummaryPreview\.value\)/);
});

test('summary activity comes from an admin-only client-safe endpoint with a selected date range', () => {
  assert.match(app, /client-summary-updates\?from=/);
  assert.match(api, /\/projects\/\{id\}\/client-summary-updates/);
  assert.match(api, /Only workspace admins can request client summary activity/);
});
