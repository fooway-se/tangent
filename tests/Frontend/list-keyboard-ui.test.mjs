import assert from 'node:assert/strict';
import test from 'node:test';
import {
  moveFocusByPage,
  moveFocusToBoundary,
  moveFocusWithin,
  visibleRowsInViewport,
} from '../../public/assets/list-keyboard-ui.js';

class FakeElement {
  constructor(className = '', rect = { top: 0, bottom: 20 }) {
    this.className = className;
    this.parentElement = null;
    this.rect = rect;
    this.classList = {
      values: new Set(className.split(' ').filter(Boolean)),
      contains: (value) => this.classList.values.has(value),
      add: (value) => this.classList.values.add(value),
      remove: (value) => this.classList.values.delete(value),
    };
  }

  closest(selector) {
    let element = this;
    const className = selector.startsWith('.') ? selector.slice(1) : '';
    while (element !== null) {
      if (element.classList?.contains(className)) return element;
      element = element.parentElement;
    }
    return null;
  }

  contains(target) {
    for (let element = target; element !== null; element = element.parentElement) {
      if (element === this) return true;
    }
    return false;
  }

  getBoundingClientRect() {
    return this.rect;
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }
}

globalThis.HTMLElement = FakeElement;

function createRows(count, rowSelector = '.row', rowHeight = 20) {
  const doc = { activeElement: null };
  const rows = [];
  const buttons = [];
  for (let index = 0; index < count; index += 1) {
    const top = index * rowHeight;
    const row = new FakeElement(rowSelector.slice(1), { top, bottom: top + rowHeight });
    const button = new FakeElement('button');
    row.ownerDocument = doc;
    button.ownerDocument = doc;
    button.parentElement = row;
    rows.push(row);
    buttons.push(button);
  }
  return { doc, rows, buttons };
}

test('list navigation advances from focus or the keyboard-selected row and clamps at the ends', () => {
  const { doc, rows, buttons } = createRows(3);
  doc.activeElement = buttons[1];

  moveFocusWithin(doc, buttons, '.row', 1);
  assert.equal(doc.activeElement, buttons[2]);
  assert.equal(rows[1].classList.contains('is-keyboard-selected'), false);
  assert.equal(rows[2].classList.contains('is-keyboard-selected'), true);

  moveFocusWithin(doc, buttons, '.row', 1);
  assert.equal(doc.activeElement, buttons[2]);
});

test('boundary navigation clears the old selection and focuses the requested edge', () => {
  const { doc, rows, buttons } = createRows(3);
  rows[1].classList.add('is-keyboard-selected');

  moveFocusToBoundary(buttons, '.row', 'first');
  assert.equal(doc.activeElement, buttons[0]);
  assert.equal(rows[1].classList.contains('is-keyboard-selected'), false);
  assert.equal(rows[0].classList.contains('is-keyboard-selected'), true);

  moveFocusToBoundary(buttons, '.row', 'last');
  assert.equal(doc.activeElement, buttons[2]);
  assert.equal(rows[2].classList.contains('is-keyboard-selected'), true);
});

test('page navigation uses the visible row count minus one and keeps a one-row minimum', () => {
  const { doc, rows, buttons } = createRows(6, '.row', 20);
  const viewport = new FakeElement('', { top: 0, bottom: 60 });
  viewport.clientTop = 0;
  viewport.clientHeight = 60;
  doc.activeElement = buttons[0];

  assert.equal(visibleRowsInViewport(buttons, viewport, '.row'), 3);
  moveFocusByPage(doc, buttons, '.row', viewport, 1);
  assert.equal(doc.activeElement, buttons[2]);
  assert.equal(rows[2].classList.contains('is-keyboard-selected'), true);

  const shortViewport = new FakeElement('', { top: 0, bottom: 1 });
  shortViewport.clientTop = 0;
  shortViewport.clientHeight = 1;
  moveFocusByPage(doc, buttons, '.row', shortViewport, 1);
  assert.equal(doc.activeElement, buttons[3]);
});

test('empty lists and empty viewports do not throw or move focus', () => {
  const { doc, buttons } = createRows(1);
  const originalFocus = new FakeElement('button');
  doc.activeElement = originalFocus;
  const viewport = new FakeElement('', { top: 0, bottom: 0 });
  viewport.clientTop = 0;
  viewport.clientHeight = 0;

  moveFocusWithin(doc, [], '.row', 1);
  moveFocusToBoundary([], '.row', 'last');
  moveFocusByPage(doc, [], '.row', viewport, 1);
  assert.equal(doc.activeElement, originalFocus);
  assert.doesNotThrow(() => moveFocusByPage(doc, buttons, '.row', viewport, 1));
  assert.equal(doc.activeElement, buttons[0]);
});
