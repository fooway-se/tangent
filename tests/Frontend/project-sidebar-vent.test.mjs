import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  getProjectSidebarLayoutStage,
  shouldHideProjectSidebarVent,
} from '../../public/assets/project-sidebar-layout.js';

const css = await readFile(new URL('../../public/assets/app.css', import.meta.url), 'utf8');
const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');

test('hides the top vent before project links need to scroll and restores it when safe', () => {
  assert.equal(shouldHideProjectSidebarVent(503, 500), true);
  assert.equal(shouldHideProjectSidebarVent(503, 503), false, 'allow an exact fit');
  assert.equal(shouldHideProjectSidebarVent(504, 503), false, 'ignore a one-pixel layout rounding difference');
  assert.equal(shouldHideProjectSidebarVent(503, 504), false, 'links fit in the visible space');
  assert.equal(shouldHideProjectSidebarVent(490, 500), false, 'leave the vent visible when links fit');
  assert.equal(shouldHideProjectSidebarVent(10, 0), false, 'ignore a hidden list with no measurable space');
});

test('advances through vent, compact controls, then scrolling only as space remains tight', () => {
  assert.equal(getProjectSidebarLayoutStage(false, false, false), 'normal');
  assert.equal(getProjectSidebarLayoutStage(true, false, false), 'vent-hidden');
  assert.equal(getProjectSidebarLayoutStage(true, true, false), 'buttons-compact');
  assert.equal(getProjectSidebarLayoutStage(true, true, true), 'scrollable');
});

test('remeasures after each space-saving stage before enabling scrolling', () => {
  assert.match(app, /getPropertyValue\('--project-sidebar-top-vent-space'\)/);
  assert.match(app, /if \(hasOverflowBeforeVent && ventSpace > 0\)[\s\S]*?projectSidebar\.classList\.add\('is-project-sidebar-space-constrained'\)[\s\S]*?projectSidebarList\.clientHeight/);
  assert.match(app, /if \(hasOverflowAfterVent\)[\s\S]*?projectSidebar\.classList\.add\('is-project-sidebar-controls-compact'\)[\s\S]*?projectSidebarList\.clientHeight/);
  assert.match(app, /getProjectSidebarLayoutStage\([\s\S]*?hasProjectOverflow = stage === 'scrollable'/);
  assert.match(app, /projectSidebarResizeObserver\.observe\(projectSidebar\)/);
  assert.match(app, /window\.requestAnimationFrame\(updateProjectSidebarMoreCue\)/);
  assert.match(html, /assets\/app-[a-f0-9]{12}\.js/);
  assert.match(css, /\.workspace-sidebar\.is-project-sidebar-space-constrained::before\s*\{\s*display:\s*none;/);
  assert.match(css, /:root \.workspace-sidebar\.is-project-sidebar-space-constrained \.workspace-brand::before\s*\{\s*display:\s*none;/);
  assert.match(css, /:root\[data-theme="nordic"\] \.workspace-sidebar\s*\{\s*--project-sidebar-top-vent-space:\s*56px;/);
  assert.match(css, /:root\[data-theme="broadcast"\] \.workspace-sidebar\s*\{\s*--project-sidebar-top-vent-space:\s*11px;/);
  assert.match(css, /:root\[data-theme="pc88"\] \.workspace-sidebar\s*\{\s*--project-sidebar-top-vent-space:\s*14px;/);
});

test('keeps the desktop project list clipped until the final scroll stage', () => {
  assert.match(css, /@media \(min-width: 761px\)\s*\{[^}]*\.project-sidebar-list\s*\{[^}]*overflow-y:\s*hidden;/);
  assert.match(css, /\.sidebar-projects\.has-project-overflow \.project-sidebar-list\s*\{[^}]*overflow-y:\s*auto;/);
  assert.match(css, /\.workspace-sidebar\.is-project-sidebar-controls-compact \.workspace-nav-button,\s*\.workspace-sidebar\.is-project-sidebar-controls-compact \.project-sidebar-link\s*\{[^}]*font-size:\s*12px;/);
  assert.match(app, /projectSidebar\.classList\.add\('is-project-sidebar-space-constrained'\)[\s\S]*?projectSidebar\.classList\.add\('is-project-sidebar-controls-compact'\)[\s\S]*?getProjectSidebarLayoutStage/);
});
