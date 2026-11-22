import assert from 'node:assert/strict';
import test from 'node:test';
import { initCommandPaletteUi } from '../../public/assets/command-palette-ui.js';

class FakeElement extends EventTarget {
  constructor(tagName = 'div') {
    super();
    this.tagName = tagName;
    this.children = [];
    this.attributes = new Map();
    this.className = '';
    this.classList = {
      values: new Set(),
      toggle(name, force) {
        if (force) this.values.add(name);
        else this.values.delete(name);
      },
    };
    this.open = false;
    this.value = '';
    this.textContent = '';
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = [...children]; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  focus() { this.focused = true; }
  querySelectorAll(selector) {
    if (selector !== '.command-item') return [];
    return this.children.flatMap((child) => [child, ...child.children])
      .filter((element) => element.className === 'command-item');
  }
}

function keyEvent(key) {
  const event = new Event('keydown', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'key', { value: key });
  return event;
}

test('command palette filters, navigates, runs commands, and toggles its dialogs', (t) => {
  const ids = ['command-palette', 'command-palette-close', 'command-search', 'command-results', 'shortcut-help', 'shortcut-help-close'];
  const elements = new Map(ids.map((id) => [`#${id}`, new FakeElement(id.includes('palette') || id === 'shortcut-help' ? 'dialog' : 'button')]));
  const doc = {
    querySelector: (selector) => elements.get(selector) ?? null,
    createElement: (tagName) => new FakeElement(tagName),
  };
  const ui = initCommandPaletteUi({ doc });
  const runs = [];
  const commands = [
    { label: 'Open Projects', detail: 'Show all projects', shortcut: 'g p', run: () => runs.push('projects') },
    { label: 'Switch theme', detail: 'Choose the next theme', shortcut: '', run: () => runs.push('theme') },
  ];
  const palette = elements.get('#command-palette');
  const search = elements.get('#command-search');
  const results = elements.get('#command-results');
  const help = elements.get('#shortcut-help');

  t.after(() => ui.dispose());
  ui.togglePalette(() => commands);
  assert.equal(ui.isPaletteOpen(), true);
  assert.equal(search.focused, true);
  assert.equal(results.children.length, 2);

  search.value = 'THEME';
  search.dispatchEvent(new Event('input'));
  assert.equal(results.children.length, 1);
  assert.equal(results.children[0].children[0].children[0].textContent, 'Switch theme');

  search.value = '';
  search.dispatchEvent(new Event('input'));
  palette.dispatchEvent(keyEvent('ArrowDown'));
  assert.equal(results.querySelectorAll('.command-item')[1].focused, true);
  palette.dispatchEvent(keyEvent('Enter'));
  assert.equal(ui.isPaletteOpen(), false);
  assert.deepEqual(runs, ['theme']);

  ui.togglePalette(() => commands);
  ui.togglePalette(() => commands);
  assert.equal(ui.isPaletteOpen(), false);
  ui.toggleShortcutHelp();
  assert.equal(help.open, true);
  assert.equal(ui.isShortcutHelpOpen(), true);
  ui.toggleShortcutHelp();
  assert.equal(help.open, false);
});
