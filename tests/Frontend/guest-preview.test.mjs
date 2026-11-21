import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const guestView = await readFile(new URL('../../frontend/src/guest-view.ts', import.meta.url), 'utf8');

test('admins can open and return from a project guest-view preview', () => {
  assert.match(html, /id="preview-guest-view-button"[^>]*hidden[^>]*>Preview guest view/);
  assert.match(html, /id="guest-preview-member-label"[^>]*hidden/);
  assert.match(app, /function openGuestViewPreview\(/);
  assert.match(app, /function closeGuestViewPreview\(/);
  assert.match(app, /previewGuestViewButton\.hidden = user\.role !== 'admin'/);
  assert.match(app, /guestPreviewReturnButton\.addEventListener\('click', closeGuestViewPreview\)/);
  assert.match(app, /if \(guestPreviewActive\) \{\s*if \(event\.key === 'Escape'\) closeGuestViewPreview\(\);\s*return;\s*\}/);
});

test('the admin preview reuses the guest data and renderer with guest actions disabled', () => {
  assert.match(app, /api<ClientView>\(`\/projects\/\$\{projectId\}\/client-view`\)/);
  assert.match(app, /renderClientView\(guestMain, view,[\s\S]{0,220}previewMode\)/);
  assert.match(guestView, /export interface GuestViewOptions/);
  assert.match(guestView, /approveButton\.disabled = previewMode/);
  assert.match(guestView, /textarea\.disabled = previewMode/);
  assert.match(guestView, /send\.disabled = previewMode/);
  assert.match(guestView, /if \(previewMode\) return/);
});
