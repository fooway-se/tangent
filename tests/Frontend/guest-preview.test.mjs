import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const guestView = await readFile(new URL('../../frontend/src/guest-view.ts', import.meta.url), 'utf8');

test('admins launch guest-view preview from the project command palette, without a header button', () => {
  assert.doesNotMatch(html, /id="preview-guest-view-button"/);
  const commands = app.slice(app.indexOf('function getPaletteCommands'), app.indexOf('function renderCommandResults'));
  assert.match(commands, /if \(activeProject !== null && activeUser\.role === 'admin' && !projectView\.hidden\)[\s\S]{0,220}label: 'Preview guest view'[\s\S]{0,180}run: openGuestViewPreview/);
  assert.doesNotMatch(app, /previewGuestViewButton/);
  const closePreview = app.slice(app.indexOf('function closeGuestViewPreview'), app.indexOf('async function loadGuestProjects'));
  assert.match(closePreview, /returnFocus\.focus\(\)/);
  assert.match(app, /function openGuestViewPreview\(\)/);
  const openPreview = app.slice(app.indexOf('function openGuestViewPreview'), app.indexOf('function closeGuestViewPreview'));
  assert.match(openPreview, /const activeElement = document\.activeElement;[\s\S]{0,120}guestPreviewReturnFocus = activeElement instanceof HTMLElement/);
  assert.match(app, /function closeGuestViewPreview\(\)/);
  assert.match(app, /guestPreviewReturnButton\.addEventListener\('click', closeGuestViewPreview\)/);
  assert.match(app, /if \(guestPreviewActive\) \{\s*if \(event\.key === 'Escape'\) closeGuestViewPreview\(\);\s*return;\s*\}/);
});

test('the admin preview reuses guest data and rendering with guest actions disabled', () => {
  assert.match(app, /api<ClientView>\(`\/projects\/\$\{projectId\}\/client-view`\)/);
  assert.match(app, /renderClientView\(guestMain, view,[\s\S]{0,220}previewMode\)/);
  assert.match(guestView, /export interface GuestViewOptions/);
  assert.match(guestView, /approveButton\.disabled = previewMode/);
  assert.match(guestView, /textarea\.disabled = previewMode/);
  assert.match(guestView, /send\.disabled = previewMode/);
  assert.match(guestView, /if \(previewMode\) return/);
});
