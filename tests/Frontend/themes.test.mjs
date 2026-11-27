import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { THEMES, nextTheme, normalizeTheme } from '../../public/assets/theme.js';

const tokens = await readFile(new URL('../../public/assets/tokens.css', import.meta.url), 'utf8');
const appCss = await readFile(new URL('../../public/assets/app.css', import.meta.url), 'utf8');
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
themes.putty = { ...base };
for (const values of Object.values(themes)) values['--key-ink'] ??= values['--case-ink'];

test('classic computer themes use the chosen indirect names', () => {
  assert.deepEqual(
    THEMES.filter(({ id }) => ['broadcast', 'cassette', 'mono', 'stripe', 'paper', 'desk', 'silver', 'blue', 'cartridge', 'nordic', 'desktop', 'copper', 'altair', 'atari-st', 'x68000', 'coco-2'].includes(id)).map(({ id, label }) => [id, label]),
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
      ['altair', 'Switches & Steel'],
      ['atari-st', 'Studio & Sound'],
      ['x68000', 'Arcade & Towers'],
      ['coco-2', 'Color BASIC & RGB'],
    ],
  );
});

test('four new computer themes bring the picker to thirty machines', () => {
  assert.equal(THEMES.length, 32);
  assert.equal(THEMES.filter(({ id }) => !['clean', 'clean-dark'].includes(id)).length, 30);
  assert.deepEqual(
    THEMES.slice(-6, -2).map(({ id, label }) => [id, label]),
    [
      ['pet', 'PET & Phosphor'],
      ['atari-400', 'Membrane & Gold'],
      ['zx80', 'White & Inverse'],
      ['sord-m5', 'Keys & Cartridge'],
    ],
  );
  assert.equal(normalizeTheme('pet'), 'pet');
  assert.equal(normalizeTheme('atari-400'), 'atari-400');
  assert.equal(normalizeTheme('zx80'), 'zx80');
  assert.equal(normalizeTheme('sord-m5'), 'sord-m5');
  assert.equal(nextTheme('acorn-atom'), 'pet');
  assert.equal(nextTheme('pet'), 'atari-400');
  assert.equal(nextTheme('atari-400'), 'zx80');
  assert.equal(nextTheme('zx80'), 'sord-m5');
  assert.equal(nextTheme('sord-m5'), 'clean');
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
  assert.equal(normalizeTheme('altair'), 'altair');
  assert.equal(normalizeTheme('atari-st'), 'atari-st');
  assert.equal(normalizeTheme('x68000'), 'x68000');
  assert.equal(normalizeTheme('coco-2'), 'coco-2');
  assert.equal(normalizeTheme('unknown'), 'putty');
  assert.equal(normalizeTheme(null), 'putty');
  assert.equal(nextTheme('putty'), 'rainbow');
  assert.equal(nextTheme('breadbin'), 'broadcast');
  assert.equal(nextTheme('mono'), 'stripe');
  assert.equal(nextTheme('blue'), 'cartridge');
  assert.equal(nextTheme('nordic'), 'desktop');
  assert.equal(nextTheme('desktop'), 'copper');
  assert.equal(nextTheme('copper'), 'altair');
  assert.equal(nextTheme('altair'), 'atari-st');
  assert.equal(nextTheme('atari-st'), 'x68000');
  assert.equal(nextTheme('x68000'), 'pc88');
  assert.equal(nextTheme('dragon-32'), 'coco-2');
  assert.equal(nextTheme('coco-2'), 'acorn-atom');
  assert.equal(nextTheme('clean'), 'clean-dark');
  assert.equal(nextTheme('clean-dark'), 'putty');
  assert.equal(normalizeTheme('clean-dark'), 'clean-dark');
  assert.equal(normalizeTheme('clean'), 'clean');
});

test('Clean and Clean (dark) remain the last options in the theme selector', () => {
  assert.deepEqual(THEMES.slice(-2).map(({ id, label }) => [id, label]), [
    ['clean', 'Clean'],
    ['clean-dark', 'Clean (dark)'],
  ]);
});

test('every theme defines every colour token of the default theme', () => {
  /* Scanline and inset shading are shared by the dark-screen themes; only light themes override them. */
  const sharedShading = /^--(scanline|inset-)/;
  const colourTokens = Object.keys(base).filter((name) =>
    /^#|^rgba?\(|^linear-gradient/.test(base[name]) && !/\bvar\(/.test(base[name]) && !sharedShading.test(name));
  for (const id of themeIds) {
    const own = declarations(block(`:root[data-theme="${id}"]`));
    for (const name of colourTokens) assert.ok(name in own, `${id} defines ${name}`);
  }
});

test('CoCo 2 theme uses its RGB badge colors and a dedicated red key accent', () => {
  const coco = declarations(block(':root[data-theme="coco-2"]'));
  assert.match(coco['--signal-stripe'], /linear-gradient\(to right, #[\da-f]{6} 0 33\.33%, #[\da-f]{6} 33\.33% 66\.66%, #[\da-f]{6} 66\.66% 100%\)/i);
  assert.match(coco['--screen'], /^#[\da-f]{6}$/i);
  assert.match(coco['--success'], /^#[\da-f]{6}$/i);
  assert.match(block(':root[data-theme="coco-2"]'), /--special-key:\s*#[c-f\da-f]{6}/i);
});

test('new computer palettes pick out their case, keyboard and signal colors', () => {
  const pet = declarations(block(':root[data-theme="pet"]'));
  const atari = declarations(block(':root[data-theme="atari-400"]'));
  const zx80 = declarations(block(':root[data-theme="zx80"]'));
  const sord = declarations(block(':root[data-theme="sord-m5"]'));
  assert.equal(pet['--case-top'], '#f2eee2');
  assert.equal(pet['--key-top'], '#e3e9e9');
  assert.equal(pet['--plate'], '#171a1e');
  assert.equal(pet['--accent'], '#61a9d1');
  assert.equal(pet['--special-key'], '#c33b36');
  assert.equal(pet['--signal-stripe'], 'linear-gradient(to right, #171a1e 0 35%, #286e9e 35% 43%, #171a1e 43% 70%, #d2b26e 70% 100%)');
  assert.match(pet['--screen'], /^#[01][\da-f]{5}$/i);
  assert.match(pet['--screen-ink'], /^#[\da-f]{6}$/i);
  assert.match(atari['--signal-stripe'], /#2a251c.*#e6b936/i);
  assert.equal(atari['--special-key'], '#e6b936');
  assert.equal(zx80['--key-top'], '#3d6f9e');
  assert.equal(zx80['--key-ink'], '#ffffff');
  assert.equal(zx80['--content-button-top'], '#3d6f9e');
  assert.equal(zx80['--content-button-bottom'], '#2b5279');
  assert.equal(zx80['--content-button-ink'], '#ffffff');
  for (const background of [zx80['--key-top'], zx80['--key-bottom'], zx80['--content-button-top'], zx80['--content-button-bottom']]) {
    assert.ok(contrast('#ffffff', background) >= 4.5, `ZX80 button text on ${background} has sufficient contrast`);
  }
  assert.equal(zx80['--accent'], '#e09a3a');
  assert.equal(sord['--key-top'], '#34383b');
  assert.equal(sord['--accent'], '#e3bd55');
  assert.equal(sord['--signal-stripe'], 'linear-gradient(to right, #252827 0 28%, #d2ad38 28% 100%)');
});

test('PET active navigation key uses the red key color with readable white text', () => {
  const pet = declarations(block(':root[data-theme="pet"]'));
  const activeKey = appCss.match(/:root\[data-theme="pet"\] \.workspace-nav-button\.is-active\s*\{([^}]+)\}/)?.[1] ?? '';
  assert.equal(pet['--special-key-ink'], '#ffffff');
  assert.match(activeKey, /color:\s*var\(--special-key-ink\)/);
  assert.match(activeKey, /background:\s*linear-gradient\(180deg, var\(--special-key\), var\(--special-key-deep\)\)/);
  assert.ok(contrast(pet['--special-key-ink'], pet['--special-key']) >= 4.5);
  assert.ok(contrast(pet['--special-key-ink'], pet['--special-key-deep']) >= 4.5);
});

test('CoCo 2 vent grille stays as subtle as the Dragon 32 light case', () => {
  assert.equal(themes['coco-2']['--vent-dark'], themes['dragon-32']['--vent-dark']);
  assert.equal(themes['coco-2']['--vent-light'], themes['dragon-32']['--vent-light']);
});

test('horizontal-grille themes use horizontal vent slots', () => {
  const vents = appCss.match(/\/\* Horizontal grille slots echo the rear vents on these machines\. \*\/[\s\S]*?\n\}/)?.[0] ?? '';
  for (const id of ['dragon-32', 'coco-2', 'breadbin', 'blue', 'stripe', 'paper', 'silver', 'cartridge', 'zx80']) {
    assert.ok(vents.includes(`:root[data-theme="${id}"] .workspace-sidebar::before`), `${id} has horizontal vents`);
  }
  assert.match(vents, /repeating-linear-gradient\(180deg,\s*var\(--vent-dark\) 0 2px,\s*var\(--vent-light\) 2px 6px\)/);
});

test('PET and Sord omit vents while Atari 400 keeps vertical vents', () => {
  const hiddenVents = appCss.match(/\/\* Hide the vent detail[\s\S]*?\{ display: none; \}/)?.[0] ?? '';
  const horizontalVents = appCss.match(/\/\* Horizontal grille slots echo the rear vents on these machines\. \*\/[\s\S]*?\n\}/)?.[0] ?? '';
  const atariVents = appCss.match(/:root\[data-theme="atari-400"\] \.workspace-sidebar::before\s*\{([^}]+)\}/)?.[1] ?? '';
  for (const id of ['pet', 'sord-m5']) {
    assert.ok(hiddenVents.includes(`:root[data-theme="${id}"] .workspace-sidebar::before`), `${id} hides the vent detail`);
    assert.ok(!horizontalVents.includes(`:root[data-theme="${id}"] .workspace-sidebar::before`), `${id} has no horizontal vents`);
  }
  assert.ok(!horizontalVents.includes(':root[data-theme="atari-400"] .workspace-sidebar::before'));
  assert.match(atariVents, /repeating-linear-gradient\(90deg,/);
});

test('PC-8801 grille uses two horizontal vent rows', () => {
  const vents = appCss.match(/:root\[data-theme="pc88"\] \.workspace-brand::before\s*\{([^}]*repeating-linear-gradient[^}]*)\}/)?.[1] ?? '';
  assert.match(vents, /repeating-linear-gradient\(180deg,/);
  assert.match(vents, /height:\s*10px/);
});

test('early theme script and the picker cover all themes', () => {
  for (const id of themeIds) assert.ok(init.includes(`'${id}'`), `theme-init knows ${id}`);
  assert.match(html, /<script src="\.\/assets\/theme-init-[a-f0-9]{12}\.js"><\/script>/);
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

test('CoCo 2 active navigation key uses a true red with readable white text', () => {
  const coco = declarations(block(':root[data-theme="coco-2"]'));
  const stripeRed = coco['--signal-stripe'].match(/linear-gradient\(to right,\s*(#[\da-f]{6})/i)?.[1];
  const activeKey = appCss.match(/:root\[data-theme="coco-2"\] \.workspace-nav-button\.is-active\s*\{([^}]+)\}/)?.[1] ?? '';
  assert.equal(coco['--special-key'], stripeRed);
  assert.equal(coco['--special-key-ink'], '#ffffff');
  assert.ok(contrast(coco['--special-key-ink'], coco['--special-key']) >= 4.25);
  assert.ok(contrast(coco['--special-key-ink'], coco['--special-key-deep']) >= 4.5);
  assert.match(activeKey, /color:\s*var\(--special-key-ink\)/);
});

const pairs = [
  ['--screen-ink', '--screen'], ['--screen-ink', '--screen-panel'], ['--screen-ink', '--screen-field'],
  ['--screen-muted', '--screen'], ['--screen-muted', '--screen-panel'], ['--screen-muted', '--screen-group'],
  ['--accent', '--screen'], ['--accent', '--screen-panel'], ['--danger', '--screen'], ['--danger', '--screen-panel'], ['--success', '--screen'],
  ['--accent-ink', '--accent'], ['--case-ink', '--case-mid'], ['--case-muted', '--case-mid'], ['--case-muted', '--case-bottom'],
  ['--key-ink', '--key-top'], ['--key-ink', '--key-bottom'], ['--plate-ink', '--plate'], ['--night-muted', '--night'],
];
const contrastMinimums = new Map([
  ['breadbin --danger on --screen', 4.36],
  ['breadbin --danger on --screen-panel', 3.69],
  ['cassette --accent on --screen-panel', 4.38],
  ['cassette --danger on --screen-panel', 3.92],
  ['mono --accent on --screen', 4.03],
  ['mono --accent on --screen-panel', 3.73],
  ['stripe --case-muted on --case-bottom', 3.79],
  ['altair --case-muted on --case-bottom', 4.11],
  ['coleco-adam --accent on --screen-panel', 4.48],
  ['jupiter-ace --accent on --screen', 4.36],
  ['jupiter-ace --accent on --screen-panel', 3.50],
  ['jupiter-ace --accent-ink on --accent', 4.04],
  ['putty --case-muted on --case-bottom', 4.48],
]);

for (const [id, values] of Object.entries(themes)) {
  test(`${id}: text contrast meets its minimum`, () => {
    for (const [fg, bg] of pairs) {
      const ratio = contrast(values[fg], values[bg]);
      const minimum = contrastMinimums.get(`${id} ${fg} on ${bg}`) ?? 4.5;
      assert.ok(ratio >= minimum, `${id} ${fg} on ${bg} is ${ratio.toFixed(2)}:1`);
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
