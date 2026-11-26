import assert from 'node:assert/strict';
import test from 'node:test';
import { applyPresenceState } from '../../public/assets/presence-indicator.js';

function fakeIndicator() {
  const light = { classes: new Set(['is-off']), classList: {
    toggle(name, on) { if (on) light.classes.add(name); else light.classes.delete(name); },
  } };
  const attributes = new Map();
  return {
    light,
    className: '',
    title: '',
    attributes,
    querySelector: (selector) => (selector === '.chat-presence-light' ? light : null),
    setAttribute: (name, value) => attributes.set(name, value),
  };
}

test('presence indicator reflects each state with a matching class, lamp and label', () => {
  const indicator = fakeIndicator();

  applyPresenceState(indicator, 'active');
  assert.equal(indicator.className, 'chat-presence is-active');
  assert.ok(indicator.light.classes.has('is-on') && !indicator.light.classes.has('is-off'));
  assert.equal(indicator.attributes.get('aria-label'), 'Another person is viewing this project');
  assert.equal(indicator.title, 'Another person is viewing this project');

  applyPresenceState(indicator, 'alone');
  assert.equal(indicator.className, 'chat-presence is-alone');
  assert.ok(indicator.light.classes.has('is-off') && !indicator.light.classes.has('is-on'));
  assert.equal(indicator.attributes.get('aria-label'), 'No other active viewers');

  applyPresenceState(indicator, 'unknown');
  assert.equal(indicator.className, 'chat-presence is-unknown');
  assert.equal(indicator.attributes.get('aria-label'), 'Could not check whether anyone else is viewing this project');

  applyPresenceState(indicator, 'checking');
  assert.equal(indicator.className, 'chat-presence is-unknown');
  assert.ok(indicator.light.classes.has('is-off'));
  assert.equal(indicator.attributes.get('aria-label'), 'Checking project viewer status');
});
