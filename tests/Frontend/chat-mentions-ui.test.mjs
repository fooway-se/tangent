import assert from 'node:assert/strict';
import test from 'node:test';
import { handleMentionKeydown } from '../../public/assets/chat-mentions-ui.js';

class FakeElement {
  constructor(id) {
    this.id = id;
    this.hidden = false;
    this.attributes = new Map();
    this.scrolled = false;
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  scrollIntoView() { this.scrolled = true; }
}

function keyboardEvent(key) {
  return {
    key,
    shiftKey: false,
    isComposing: false,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; },
  };
}

test('mention suggestions navigate with arrows and select with Enter', () => {
  const input = new FakeElement('input');
  const options = [new FakeElement('first'), new FakeElement('second')];
  const list = { hidden: false, querySelectorAll: () => options };
  const members = [{ id: 4, name: 'Rae' }, { id: 8, name: 'Tariq' }];
  let selectedIndex = 0;
  let selectedMember = null;
  const updateIndex = (index) => { selectedIndex = index; };
  const selectMember = (member) => { selectedMember = member; };

  const arrow = keyboardEvent('ArrowDown');
  assert.equal(handleMentionKeydown(arrow, input, list, members, selectedIndex, updateIndex, selectMember, () => {}), true);
  assert.equal(arrow.defaultPrevented, true);
  assert.equal(arrow.propagationStopped, true);
  assert.equal(selectedIndex, 1);
  assert.equal(options[0].attributes.get('aria-selected'), 'false');
  assert.equal(options[1].attributes.get('aria-selected'), 'true');
  assert.equal(input.attributes.get('aria-activedescendant'), 'second');
  assert.equal(options[1].scrolled, true);

  const enter = keyboardEvent('Enter');
  assert.equal(handleMentionKeydown(enter, input, list, members, selectedIndex, updateIndex, selectMember, () => {}), true);
  assert.equal(enter.defaultPrevented, true);
  assert.equal(selectedMember, members[1]);
});
