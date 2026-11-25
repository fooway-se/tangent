import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { splitChatSmilies } from '../../public/assets/chat-smilies.js';

const css = await readFile(new URL('../../public/assets/app.css', import.meta.url), 'utf8');

test('Lounge emoticon shortcuts map to themed face types', () => {
  assert.deepEqual(splitChatSmilies(':) :-) ;) ;-) :( :-( :D :-D :P :-P'), [
    { text: ':)', icon: 'smile' },
    { text: ' ', icon: null },
    { text: ':-)', icon: 'smile' },
    { text: ' ', icon: null },
    { text: ';)', icon: 'wink' },
    { text: ' ', icon: null },
    { text: ';-)', icon: 'wink' },
    { text: ' ', icon: null },
    { text: ':(', icon: 'frown' },
    { text: ' ', icon: null },
    { text: ':-(', icon: 'frown' },
    { text: ' ', icon: null },
    { text: ':D', icon: 'grin' },
    { text: ' ', icon: null },
    { text: ':-D', icon: 'grin' },
    { text: ' ', icon: null },
    { text: ':P', icon: 'tongue' },
    { text: ' ', icon: null },
    { text: ':-P', icon: 'tongue' },
  ]);
});

test('additional face shortcuts cover neutral, surprised, uncertain, crying, and angry expressions', () => {
  const faces = splitChatSmilies(`:| :-| :o :-o :/ :-/ :'( :'-(' >:( >:-(`)
    .filter((segment) => segment.icon !== null)
    .map((segment) => segment.icon);
  assert.deepEqual(faces, [
    'neutral', 'neutral', 'surprised', 'surprised', 'uncertain', 'uncertain',
    'crying', 'crying', 'angry', 'angry',
  ]);
});

test('named shortcuts support the agreed food and drink tokens with or without a closing colon', () => {
  assert.deepEqual(splitChatSmilies('Coffee :coffee and :beer: :pizza :burger :sushi :chinese:!'), [
    { text: 'Coffee ', icon: null },
    { text: ':coffee', icon: 'coffee' },
    { text: ' and ', icon: null },
    { text: ':beer:', icon: 'beer' },
    { text: ' ', icon: null },
    { text: ':pizza', icon: 'pizza' },
    { text: ' ', icon: null },
    { text: ':burger', icon: 'burger' },
    { text: ' ', icon: null },
    { text: ':sushi', icon: 'sushi' },
    { text: ' ', icon: null },
    { text: ':chinese:', icon: 'chinese' },
    { text: '!', icon: null },
  ]);
});

test('unsupported and embedded shortcut-like text remains unchanged', () => {
  assert.deepEqual(splitChatSmilies('mail:coffeehouse :tea :orange x:beer :sushimi :chinesefood'), [
    { text: 'mail:coffeehouse :tea :orange x:beer :sushimi :chinesefood', icon: null },
  ]);
});

test('smiley artwork stays theme-colored and remains clear at chat size', () => {
  assert.match(css, /\.chat-smiley-icon \{[^}]*--smiley-face:\s*var\(--accent\)/);
  assert.match(css, /--smiley-face:\s*color-mix\(in srgb, var\(--accent\) 85%, white\)/);
  assert.match(css, /--smiley-line:\s*var\(--accent-ink\)/);
  assert.match(css, /\.chat-smiley-outline \{[^}]*fill: var\(--smiley-face\); stroke: none;/);
  assert.match(css, /\.chat-smiley-icon:has\(\.chat-smiley-outline\) \{ filter: none;/);
  assert.match(css, /\.chat-smiley \{[^}]*width:\s*1\.85em;[^}]*height:\s*1\.85em/);
  assert.match(css, /\.chat-smiley-feature \{[^}]*stroke: var\(--smiley-line\);[^}]*stroke-width: 2/);
  assert.match(css, /\.chat-smiley-mouth \{[^}]*fill: var\(--smiley-line\); stroke: none/);
  assert.match(css, /\.chat-smiley-tongue \{[^}]*fill: var\(--smiley-tongue\); stroke: var\(--smiley-line\); stroke-width: 1\.25/);
  assert.match(css, /\.chat-smiley-tear \{[^}]*fill: var\(--smiley-tongue\); stroke: var\(--smiley-line\)/);
  assert.match(css, /--smiley-tongue:\s*color-mix\(in srgb, var\(--accent\) 45%, var\(--screen-ink\)\)/);
  assert.match(css, /\.chat-smiley-icon-line \{[^}]*fill: var\(--smiley-face\); stroke: var\(--smiley-line\);[^}]*stroke-width: 1\.6/);
  assert.match(css, /\.chat-smiley-icon-detail \{[^}]*stroke: var\(--smiley-line\);[^}]*stroke-width: 1\.8/);
  assert.match(css, /\.chat-smiley-foam \{[^}]*fill: var\(--smiley-foam\);/);
  assert.match(css, /--smiley-foam:\s*color-mix\(in srgb, var\(--accent\) 48%, var\(--screen-ink\)\)/);
  assert.match(css, /\.chat-smiley-beer-fill \{[^}]*fill: var\(--accent\)/);
  assert.match(css, /--smiley-layer:\s*color-mix\(in srgb, var\(--accent\) 58%, var\(--screen-panel\)\)/);
  assert.match(css, /--smiley-crust:\s*color-mix\(in srgb, var\(--accent\) 58%, var\(--accent-ink\)\)/);
  assert.match(css, /\.chat-smiley-lettuce \{[^}]*fill: var\(--smiley-layer\)/);
  assert.match(css, /\.chat-smiley-tomato \{[^}]*fill: var\(--smiley-crust\)/);
  assert.match(css, /\.chat-smiley-coffee-surface \{[^}]*fill: var\(--accent-edge\)/);
  assert.match(css, /\.chat-smiley-pizza-topping \{[^}]*fill: var\(--smiley-line\)/);
});
