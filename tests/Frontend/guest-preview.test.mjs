import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const paletteCommands = await readFile(new URL('../../frontend/src/command-palette-commands.ts', import.meta.url), 'utf8');
const guestView = await readFile(new URL('../../frontend/src/guest-view.ts', import.meta.url), 'utf8');
const guestUi = await readFile(new URL('../../frontend/src/guest-ui.ts', import.meta.url), 'utf8');

test('admins launch guest-view preview from the project command palette, without a header button', () => {
  assert.doesNotMatch(html, /id="preview-guest-view-button"/);
  assert.match(paletteCommands, /context\.activeProject !== null && user\.role === 'admin' && context\.projectViewVisible[\s\S]*?label: 'Preview guest view'[\s\S]*?run: actions\.previewGuestView/);
  assert.match(app, /previewGuestView: \(\) => \{ void guestUi\.openPreview\(\); \}/);
  assert.doesNotMatch(app, /previewGuestViewButton/);
  assert.match(guestUi, /function closePreview\(\)[\s\S]*?returnFocus\.focus\(\)/);
  const openPreview = guestUi.slice(guestUi.indexOf('async function openPreview'), guestUi.indexOf('function closePreview'));
  assert.match(openPreview, /const activeElement = doc\.activeElement;[\s\S]{0,120}previewReturnFocus = activeElement instanceof HTMLElement/);
  assert.match(guestUi, /guestPreviewReturnButton\.addEventListener\('click', closePreview/);
  assert.match(app, /if \(guestUi\.isPreviewActive\(\)\) \{\s*if \(event\.key === 'Escape'\) guestUi\.closePreview\(\);/);
});

test('the admin preview reuses guest data and rendering with guest actions disabled', () => {
  assert.match(guestUi, /request<ClientView>\(`\/projects\/\$\{projectId\}\/client-view`\)/);
  assert.match(guestUi, /renderView\(guestMain, view,[\s\S]{0,220}previewMode\)/);
  assert.match(guestView, /export interface GuestViewOptions/);
  assert.match(guestView, /approveButton\.disabled = previewMode/);
  assert.match(guestView, /textarea\.disabled = previewMode/);
  assert.match(guestView, /send\.disabled = previewMode/);
  assert.match(guestView, /if \(previewMode\) return/);
});
