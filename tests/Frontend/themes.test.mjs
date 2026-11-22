import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { THEMES, nextTheme, normalizeTheme } from '../../public/assets/theme.js';

const tokens = await readFile(new URL('../../public/assets/tokens.css', import.meta.url), 'utf8');
const init = await readFile(new URL('../../public/assets/theme-init.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../../public/app.html', import.meta.url), 'utf8');

function block(selector) {
  const start = tokens.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `${selector} block exists`);
  return tokens.slice(start, tokens.indexOf('\n}', start));
}

function declarations(text) {
  return Object.fromEntries([...text.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const base = declarations(block(':root'));
const themeIds = THEMES.map((theme) => theme.id).filter((id) => id !== 'putty');
const themes = Object.fromEntries(themeIds.map((id) => [id, { ...base, ...declarations(block(`:root[data-theme="${id}"]`)) }]));
themes.putty = base;

test('classic computer themes use the chosen indirect names', () => {
  assert.deepEqual(
    THEMES.filter(({ id }) => ['broadcast', 'cassette', 'mono', 'stripe', 'paper', 'desk', 'silver', 'blue', 'cartridge', 'nordic', 'desktop', 'copper'].includes(id)).map(({ id, label }) => [id, label]),
    [
      ['broadcast', 'Broadcast & Beige'],
      ['cassette', 'Cassette & Colour'],
      ['mono', 'Mono & Membrane'],
      ['stripe', 'Stripe & Signal'],
      ['paper', 'Paper & Rainbow'],
      ['desk', 'Desk & Phosphor'],
      ['silver', 'Silver & Speech'],
      ['blue', 'Blue & Byte'],
      ['cartridge', 'Cartridge & Cobalt'],
      ['nordic', 'Nordic & Phosphor'],
      ['desktop', 'Icon & Mouse'],
      ['copper', 'Copper & Chroma'],
    ],
  );
});

test('theme helpers normalise and cycle', () => {
  assert.equal(normalizeTheme('breadbin'), 'breadbin');
  assert.equal(normalizeTheme('broadcast'), 'broadcast');
  assert.equal(normalizeTheme('cassette'), 'cassette');
  assert.equal(normalizeTheme('mono'), 'mono');
  assert.equal(normalizeTheme('stripe'), 'stripe');
  assert.equal(normalizeTheme('paper'), 'paper');
  assert.equal(normalizeTheme('desk'), 'desk');
  assert.equal(normalizeTheme('silver'), 'silver');
  assert.equal(normalizeTheme('blue'), 'blue');
  assert.equal(normalizeTheme('cartridge'), 'cartridge');
  assert.equal(normalizeTheme('nordic'), 'nordic');
  assert.equal(normalizeTheme('desktop'), 'desktop');
  assert.equal(normalizeTheme('copper'), 'copper');
  assert.equal(normalizeTheme('unknown'), 'putty');
  assert.equal(normalizeTheme(null), 'putty');
  assert.equal(nextTheme('putty'), 'rainbow');
  assert.equal(nextTheme('breadbin'), 'broadcast');
  assert.equal(nextTheme('mono'), 'stripe');
  assert.equal(nextTheme('blue'), 'cartridge');
  assert.equal(nextTheme('nordic'), 'desktop');
  assert.equal(nextTheme('desktop'), 'copper');
  assert.equal(nextTheme('copper'), 'clean');
  assert.equal(nextTheme('clean'), 'clean-dark');
  assert.equal(nextTheme('clean-dark'), 'putty');
  assert.equal(normalizeTheme('clean-dark'), 'clean-dark');
  assert.equal(normalizeTheme('clean'), 'clean');
});

test('every theme defines every colour token of the default theme', () => {
  /* Scanline and inset shading are shared by the dark-screen themes; only light themes override them. */
  const sharedShading = /^--(scanline|inset-)/;
  const colourTokens = Object.keys(base).filter((name) => /^#|^rgba?\(|^linear-gradient/.test(base[name]) && !sharedShading.test(name));
  for (const id of themeIds) {
    const own = declarations(block(`:root[data-theme="${id}"]`));
    for (const name of colourTokens) assert.ok(name in own, `${id} defines ${name}`);
  }
});

test('early theme script and the picker cover all themes', () => {
  for (const id of themeIds) assert.ok(init.includes(`'${id}'`), `theme-init knows ${id}`);
  assert.match(html, /<script src="\.\/assets\/theme-init\.js"><\/script>/);
  assert.ok((html.match(/class="theme-select"/g) ?? []).length >= 3);
});

function luminance(hex) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const pairs = [
  ['--screen-ink', '--screen'], ['--screen-ink', '--screen-panel'], ['--screen-ink', '--screen-field'],
  ['--screen-muted', '--screen'], ['--screen-muted', '--screen-panel'], ['--screen-muted', '--screen-group'],
  ['--accent', '--screen'], ['--accent', '--screen-panel'], ['--danger', '--screen'], ['--danger', '--screen-panel'], ['--success', '--screen'],
  ['--accent-ink', '--accent'], ['--case-ink', '--case-mid'], ['--case-muted', '--case-mid'], ['--case-muted', '--case-bottom'],
  ['--case-ink', '--key-top'], ['--case-ink', '--key-bottom'], ['--plate-ink', '--plate'], ['--night-muted', '--night'],
];

for (const [id, values] of Object.entries(themes)) {
  test(`${id}: text contrast is at least 4.5:1`, () => {
    for (const [fg, bg] of pairs) {
      const ratio = contrast(values[fg], values[bg]);
      assert.ok(ratio >= 4.5, `${id} ${fg} on ${bg} is ${ratio.toFixed(2)}:1`);
    }
  });
}

test('clean theme is a light, flat theme that keeps code monospaced', () => {
  const clean = themes.clean;
  assert.ok(clean, 'clean theme exists');
  assert.match(block(':root[data-theme="clean"]'), /color-scheme:\s*light/);
  assert.match(clean['--font-mono'], /system-ui/, 'interface text uses a sans font');
  assert.match(base['--font-code'], /ui-monospace/, 'code keeps a monospace font');
  assert.equal(clean['--key-depth'], '1px');
  assert.match(clean['--inset-shade'], /, 0\)$/, 'recessed fields have no dark inset shadow');
  for (const [top, bottom] of [['--case-top', '--case-bottom'], ['--key-top', '--key-bottom'], ['--cap-top', '--cap-bottom']]) {
    assert.equal(clean[top], clean[bottom], `${top} and ${bottom} match, so the surface is flat`);
  }
  assert.ok(luminance(clean['--screen']) > 0.8, 'the screen area is light');
});

test('clean-dark theme is the flat sans-serif Clean theme on a dark palette', () => {
  const dark = themes['clean-dark'];
  assert.ok(dark, 'clean-dark theme exists');
  assert.match(block(':root[data-theme="clean-dark"]'), /color-scheme:\s*dark/);
  assert.equal(dark['--font-mono'], themes.clean['--font-mono'], 'interface text uses the same sans font as Clean');
  assert.equal(dark['--key-depth'], '1px');
  assert.match(dark['--inset-shade'], /, 0\)$/, 'recessed fields have no inset shadow');
  for (const [top, bottom] of [['--case-top', '--case-bottom'], ['--key-top', '--key-bottom'], ['--cap-top', '--cap-bottom']]) {
    assert.equal(dark[top], dark[bottom], `${top} and ${bottom} match, so the surface is flat`);
  }
  assert.ok(luminance(dark['--screen']) < 0.05, 'the screen area is dark');
  assert.equal(dark['--radius-panel'], themes.clean['--radius-panel'], 'corners match Clean');
});
