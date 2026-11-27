import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { THEMES } from '../../public/assets/theme.js';
import { THEME_MACHINES } from '../../public/assets/theme-machines.js';

const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');
const htaccess = await readFile(new URL('../../public/.htaccess', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const themeUiSource = await readFile(new URL('../../frontend/src/theme-ui.ts', import.meta.url), 'utf8');
const css = await readFile(new URL('../../public/assets/app.css', import.meta.url), 'utf8');

test('every theme has a locally hosted, credited computer photo and two short facts', async () => {
  assert.deepEqual(Object.keys(THEME_MACHINES).sort(), THEMES.map(({ id }) => id).sort());
  assert.equal(THEME_MACHINES.putty.model, 'Atari 800');
  assert.equal(THEME_MACHINES.putty.year, '1979');
  assert.equal(THEME_MACHINES.cartridge.model, 'Spectravideo SVI-728');
  assert.equal(THEME_MACHINES.cartridge.year, '1984');
  assert.equal(THEME_MACHINES.cartridge.photoCredit, 'MKFI');
  assert.equal(THEME_MACHINES.nordic.model, 'Luxor ABC 80');
  assert.equal(THEME_MACHINES.nordic.year, '1978');
  assert.equal(THEME_MACHINES.nordic.photoCredit, 'Ellinor Algin · Tekniska museet · resized for Tangent');
  assert.equal(THEME_MACHINES.desktop.model, 'Apple Macintosh 128K');
  assert.equal(THEME_MACHINES.desktop.year, '1984');
  assert.equal(THEME_MACHINES.desktop.photoCredit, 'Benoît Prieur');
  assert.equal(THEME_MACHINES.copper.model, 'Commodore Amiga 500');
  assert.equal(THEME_MACHINES.copper.year, '1987');
  assert.equal(THEME_MACHINES.copper.photoCredit, 'Bill Bertram');
  assert.equal(THEME_MACHINES['coco-2'].model, 'TRS-80 Color Computer 2');
  assert.equal(THEME_MACHINES['coco-2'].year, '1983');
  assert.equal(THEME_MACHINES['coco-2'].imageFile, 'tandy-color-computer-2.jpg');
  assert.equal(THEME_MACHINES['coco-2'].photoCredit, 'Bilby · Wikimedia Commons');
  assert.equal(THEME_MACHINES['coco-2'].license, 'CC BY 3.0');
  assert.equal(THEME_MACHINES['coco-2'].licenseUrl, 'https://creativecommons.org/licenses/by/3.0/');
  assert.equal(THEME_MACHINES['coco-2'].imagePage, 'https://commons.wikimedia.org/wiki/File:TRS-80_Color_Computer_2_(PAL)_4x3.jpg');
  for (const [id, machine] of Object.entries(THEME_MACHINES)) {
    assert.ok(machine.model, `${id} has a model name`);
    assert.ok(machine.year, `${id} has a year`);
    assert.ok(machine.imageFile, `${id} has an image file`);
    if (machine.illustration) {
      assert.match(machine.imageUrl, /^\.\/assets\/machines\/[a-z0-9-]+\.svg$/);
      assert.match(machine.imagePage, /^https:\/\//);
    } else {
      assert.match(machine.imageUrl, /^\.\/assets\/machines\/[a-z0-9-]+\.(?:jpg|png|webp)$/);
      assert.match(machine.imagePage, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    }
    assert.ok(machine.photoCredit, `${id} has a photo credit`);
    assert.ok(machine.license, `${id} has a photo license`);
    assert.equal(machine.facts.length, 2, `${id} has two facts`);
    assert.ok(machine.historyUrl.startsWith('https://'), `${id} has a history source`);
    const image = await readFile(new URL(`../../public/${machine.imageUrl.slice(2)}`, import.meta.url));
    if (machine.illustration) {
      const svg = image.toString('utf8');
      assert.match(svg, /^<svg\b/);
      assert.match(svg, /\bviewBox=/);
    } else {
      assert.ok(image.length > 1000, `${id} has a bundled photo`);
    }
  }
});

test('Altair, Atari ST, and X68000 themes have sourced machine cards', () => {
  assert.equal(THEME_MACHINES.altair.model, 'MITS Altair 8800');
  assert.equal(THEME_MACHINES.altair.year, '1975');
  assert.equal(THEME_MACHINES.altair.photoCredit, 'Michael Holley / Swtpc6800');
  assert.equal(THEME_MACHINES.altair.license, 'Public domain');
  assert.equal(THEME_MACHINES['atari-st'].model, 'Atari 520ST');
  assert.equal(THEME_MACHINES['atari-st'].year, '1985');
  assert.equal(THEME_MACHINES['atari-st'].photoCredit, 'Blake Patterson');
  assert.equal(THEME_MACHINES['atari-st'].license, 'CC BY 2.0');
  assert.equal(THEME_MACHINES.x68000.model, 'Sharp X68000 XVI');
  assert.equal(THEME_MACHINES.x68000.year, '1991');
  assert.equal(THEME_MACHINES.x68000.photoCredit, 'htomari');
  assert.equal(THEME_MACHINES.x68000.license, 'CC BY-SA 2.0');
});

test('PET, Atari 400, ZX80, and Sord M5 have credited machine photos', () => {
  assert.deepEqual(
    ['pet', 'atari-400', 'zx80', 'sord-m5'].map((id) => [THEME_MACHINES[id].model, THEME_MACHINES[id].year]),
    [
      ['Commodore PET 2001', '1977'],
      ['Atari 400', '1979'],
      ['Sinclair ZX80', '1980'],
      ['Sord M5', '1982'],
    ],
  );
  assert.equal(THEME_MACHINES.pet.photoCredit, 'Sandra Fauconnier');
  assert.equal(THEME_MACHINES.pet.license, 'CC BY 4.0');
  assert.equal(THEME_MACHINES['atari-400'].photoCredit, 'McCormick');
  assert.equal(THEME_MACHINES['atari-400'].license, 'Public domain');
  assert.equal(THEME_MACHINES.zx80.photoCredit, 'Daniel Ryde');
  assert.equal(THEME_MACHINES.zx80.license, 'CC BY-SA 3.0');
  assert.equal(THEME_MACHINES['sord-m5'].photoCredit, 'Liftarn; retouched by Ubcule');
  assert.equal(THEME_MACHINES['sord-m5'].license, 'CC BY-SA 2.0');
  assert.equal(THEME_MACHINES['sord-m5'].licenseUrl, 'https://creativecommons.org/licenses/by-sa/2.0/');
});

test('theme selectors have a silent computer icon that opens the accessible card', () => {
  assert.equal((html.match(/data-theme-about\b/g) ?? []).length, 2);
  assert.equal((html.match(/class="theme-about-button"/g) ?? []).length, 2);
  const loginMarkup = html.split('id="login-shell"')[1].split('id="guest-shell"')[0];
  const guestMarkup = html.split('id="guest-shell"')[1].split('id="workspace-panel"')[0];
  assert.doesNotMatch(loginMarkup, /data-theme-about/);
  assert.match(guestMarkup, /data-theme-about/);
  assert.match(html, /aria-label="About this computer"/);
  assert.match(html, /<dialog id="theme-about-dialog"[^>]*aria-labelledby="theme-about-heading"/);
  assert.match(html, /id="theme-about-image"[^>]*alt=""/);
  assert.match(html, /id="theme-about-facts"/);
  assert.match(html, /id="theme-about-image-license"/);
  assert.match(html, /img-src 'self' data:/);
  assert.match(htaccess, /img-src 'self' data:/);
  assert.doesNotMatch(html, /img-src[^>]*wikimedia\.org/);
  assert.doesNotMatch(htaccess, /img-src[^\n]*wikimedia\.org/);
  assert.match(themeUiSource, /THEME_MACHINES\[activeTheme\]/);
  assert.match(themeUiSource, /themeAboutDialog\.showModal\(\)/);
  assert.match(themeUiSource, /themeAboutImage\.src\s*=\s*machine\.imageUrl/);
  assert.match(css, /\.theme-about-button/);
  assert.match(css, /\.retro-computer-icon/);
});

test('computer card handles Escape before workspace navigation', () => {
  const shortcutContext = appSource.slice(appSource.indexOf('function shortcutContext'), appSource.indexOf('function clearGoPrefix'));
  const keyboardHandler = appSource.slice(appSource.indexOf('function handleKeyboardShortcut'), appSource.indexOf('function movePaletteCommandSelection'));
  const commandPaletteHandler = appSource.slice(appSource.indexOf('function openCommandPalette'), appSource.indexOf('function showShortcutHelp'));
  const dismissHandler = appSource.slice(appSource.indexOf('function dismissCurrentView'), appSource.indexOf('function focusIssueQuickAddReturnTarget'));
  assert.match(shortcutContext, /modalOpen:[\s\S]*themeUi\.aboutDialog\.open/);
  assert.match(keyboardHandler, /themeUi\.aboutDialog\.open/);
  assert.match(commandPaletteHandler, /if \(themeUi\.aboutDialog\.open\) themeUi\.aboutDialog\.close\(\);/);
  assert.match(dismissHandler, /if \(themeUi\.aboutDialog\.open\)\s*\{\s*themeUi\.aboutDialog\.close\(\);/);
});

test('computer card button is joined to the theme selector with the same height and key style', () => {
  const shared = css.split('\n').find((line) => line.startsWith('.theme-select, .theme-about-button {')) ?? '';
  assert.match(shared, /height:\s*28px/, 'both controls share one height');
  assert.match(shared, /border-bottom-width:\s*2px/);
  assert.match(css, /\.theme-picker-controls\s*\{[^}]*gap:\s*0/, 'controls are joined');
});

test('retro computer icon is a crisp square-cornered monitor that fits the joined control', () => {
  assert.match(css, /\.retro-computer-icon\s*\{[^}]*width:\s*14px;[^}]*height:\s*10px;/);
  assert.doesNotMatch(css.match(/\.retro-computer-icon\s*\{([^}]+)\}/)?.[1] ?? '', /border-radius/);
});
