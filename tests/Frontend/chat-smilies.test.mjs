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

test('named shortcuts support the agreed food and drink tokens with or without a closing colon', () => {
  assert.deepEqual(splitChatSmilies('Coffee :coffee and :beer: :pizza :burger!'), [
    { text: 'Coffee ', icon: null },
    { text: ':coffee', icon: 'coffee' },
    { text: ' and ', icon: null },
    { text: ':beer:', icon: 'beer' },
    { text: ' ', icon: null },
    { text: ':pizza', icon: 'pizza' },
    { text: ' ', icon: null },
    { text: ':burger', icon: 'burger' },
    { text: '!', icon: null },
  ]);
});

test('unsupported and embedded shortcut-like text remains unchanged', () => {
  assert.deepEqual(splitChatSmilies('mail:coffeehouse :tea x:beer'), [
    { text: 'mail:coffeehouse :tea x:beer', icon: null },
  ]);
});

test('smiley artwork uses the active theme accent and its readable contrast color', () => {
  assert.match(css, /\.chat-smiley-icon \{[^}]*color: var\(--accent\)/);
  assert.match(css, /\.chat-smiley-outline \{[^}]*stroke: var\(--accent-ink\)/);
  assert.match(css, /\.chat-smiley \{[^}]*width:\s*1\.6em;[^}]*height:\s*1\.6em/);
  assert.match(css, /\.chat-smiley-outline \{[^}]*fill: var\(--accent\)/);
  assert.match(css, /\.chat-smiley-feature \{[^}]*stroke: var\(--accent-ink\)/);
  assert.match(css, /\.chat-smiley-icon-line \{[^}]*fill: var\(--accent\)/);
});
