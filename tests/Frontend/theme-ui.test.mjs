import assert from 'node:assert/strict';
import test from 'node:test';
import { initThemeUi } from '../../public/assets/theme-ui.js';

class FakeElement extends EventTarget {
  constructor() {
    super();
    this.children = [];
    this.attributes = new Map();
    this.classList = {
      values: new Set(),
      toggle: (name, force) => {
        const enabled = force ?? !this.classList.values.has(name);
        if (enabled) this.classList.values.add(name);
        else this.classList.values.delete(name);
        return enabled;
      },
    };
    this.value = '';
    this.textContent = '';
    this.hidden = false;
    this.open = false;
    this.visible = true;
  }

  replaceChildren(...children) { this.children = children; }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  closest() { return null; }
  getClientRects() { return this.visible ? [{}] : []; }
  focus() { this.focused = true; }
  showModal() { this.open = true; }
  close() { this.open = false; }
}

class FakeOption extends FakeElement {
  constructor(label, value) {
    super();
    this.textContent = label;
    this.value = value;
  }
}

function createDocument() {
  const elements = new Map([
    ['#theme-about-dialog', new FakeElement()],
    ['#theme-about-heading', new FakeElement()],
    ['#theme-about-era', new FakeElement()],
    ['#theme-about-image', new FakeElement()],
    ['#theme-about-image-fallback', new FakeElement()],
    ['#theme-about-facts', new FakeElement()],
    ['#theme-about-image-credit', new FakeElement()],
    ['#theme-about-image-license', new FakeElement()],
    ['#theme-about-history-source', new FakeElement()],
    ['#theme-about-close', new FakeElement()],
  ]);
  const themeSelects = [new FakeElement(), new FakeElement()];
  const aboutButtons = [new FakeElement(), new FakeElement()];
  const root = new FakeElement();
  return {
    elements,
    themeSelects,
    aboutButtons,
    document: {
      documentElement: root,
      querySelector: (selector) => elements.get(selector) ?? null,
      querySelectorAll: (selector) => selector === '.theme-select' ? themeSelects : aboutButtons,
      createElement: () => new FakeElement(),
    },
  };
}

function withBrowserGlobals(t) {
  const previous = {
    document: globalThis.document,
    window: globalThis.window,
    Option: globalThis.Option,
  };
  const storage = new Map();
  const fixture = createDocument();
  globalThis.document = fixture.document;
  globalThis.window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
  };
  globalThis.Option = FakeOption;
  t.after(() => {
    if (previous.document === undefined) delete globalThis.document;
    else globalThis.document = previous.document;
    if (previous.window === undefined) delete globalThis.window;
    else globalThis.window = previous.window;
    if (previous.Option === undefined) delete globalThis.Option;
    else globalThis.Option = previous.Option;
  });
  return { ...fixture, storage };
}

test('theme controls synchronize selection and display the themed computer card', (t) => {
  const { elements, themeSelects, aboutButtons, storage } = withBrowserGlobals(t);
  const ui = initThemeUi();

  themeSelects[0].value = 'breadbin';
  themeSelects[0].dispatchEvent(new Event('change'));
  assert.equal(ui.getActiveTheme(), 'breadbin');
  assert.equal(themeSelects[1].value, 'breadbin');
  assert.equal(storage.get('tangent.theme'), 'breadbin');
  assert.equal(document.documentElement.attributes.get('data-theme'), 'breadbin');

  aboutButtons[0].dispatchEvent(new Event('click'));
  assert.equal(elements.get('#theme-about-dialog').open, true);
  assert.equal(elements.get('#theme-about-heading').textContent, 'Commodore 64');
  assert.equal(elements.get('#theme-about-image').src, './assets/machines/commodore-64.jpg');
  assert.equal(elements.get('#theme-about-facts').children.length, 2);
  assert.equal(elements.get('#theme-about-image-license').hidden, true);

  elements.get('#theme-about-image').dispatchEvent(new Event('error'));
  assert.equal(elements.get('#theme-about-image').hidden, true);
  assert.equal(elements.get('#theme-about-image-fallback').hidden, false);

  ui.dispose();
});

test('CoCo 2 computer card links Bilby credit and CC BY 3.0 license separately', (t) => {
  const { elements, aboutButtons } = withBrowserGlobals(t);
  const ui = initThemeUi();

  ui.setTheme('coco-2');
  aboutButtons[0].dispatchEvent(new Event('click'));

  assert.equal(elements.get('#theme-about-image').src, './assets/machines/tandy-color-computer-2.jpg');
  assert.equal(elements.get('#theme-about-image-credit').textContent, 'Photo: Bilby · Wikimedia Commons');
  assert.equal(elements.get('#theme-about-image-credit').href, 'https://commons.wikimedia.org/wiki/File:TRS-80_Color_Computer_2_(PAL)_4x3.jpg');
  assert.equal(elements.get('#theme-about-image-license').textContent, 'CC BY 3.0');
  assert.equal(elements.get('#theme-about-image-license').href, 'https://creativecommons.org/licenses/by/3.0/');
  assert.equal(elements.get('#theme-about-image-license').hidden, false);

  ui.dispose();
});

test('theme selector shortcut focuses the first visible picker and dispose removes listeners', (t) => {
  const { themeSelects } = withBrowserGlobals(t);
  const ui = initThemeUi();
  themeSelects[0].visible = false;

  ui.focusSelector();
  assert.equal(themeSelects[0].focused, undefined);
  assert.equal(themeSelects[1].focused, true);

  ui.dispose();
  const current = ui.getActiveTheme();
  themeSelects[1].value = 'nordic';
  themeSelects[1].dispatchEvent(new Event('change'));
  assert.equal(ui.getActiveTheme(), current);
});
