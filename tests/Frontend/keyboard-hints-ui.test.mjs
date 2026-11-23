import assert from 'node:assert/strict';
import test from 'node:test';
import { initKeyboardHintsUi } from '../../public/assets/keyboard-hints-ui.js';

function createHarness({ stored = null, userRole = 'admin', workspaceVisible = true, readError = false, writeError = false } = {}) {
  const element = { hidden: true };
  const writes = [];
  const state = { userRole, workspaceVisible };
  const ui = initKeyboardHintsUi({
    element,
    getUserRole: () => state.userRole,
    isWorkspaceVisible: () => state.workspaceVisible,
    getStoredPreference: () => {
      if (readError) throw new Error('Storage unavailable');
      return stored;
    },
    setStoredPreference: (value) => {
      if (writeError) throw new Error('Storage unavailable');
      writes.push(value);
    },
  });
  return { ui, element, writes, state };
}

test('hints default to visible and respect sign-in, guest, and workspace visibility', () => {
  const harness = createHarness();
  harness.ui.updateVisibility();
  assert.equal(harness.ui.isPreferenceEnabled(), true);
  assert.equal(harness.element.hidden, false);

  harness.state.userRole = 'guest';
  harness.ui.updateVisibility();
  assert.equal(harness.element.hidden, true);
  harness.state.userRole = null;
  harness.state.workspaceVisible = false;
  harness.ui.updateVisibility();
  assert.equal(harness.element.hidden, true);
});

test('a stored preference initializes visibility and persists toggles', () => {
  const harness = createHarness({ stored: 'false' });
  harness.ui.updateVisibility();
  assert.equal(harness.ui.isPreferenceEnabled(), false);
  assert.equal(harness.element.hidden, true);

  harness.ui.toggle();
  assert.equal(harness.ui.isPreferenceEnabled(), true);
  assert.equal(harness.element.hidden, false);
  assert.deepEqual(harness.writes, ['true']);

  harness.ui.toggle();
  assert.equal(harness.element.hidden, true);
  assert.deepEqual(harness.writes, ['true', 'false']);
});

test('storage failures preserve defaults and do not prevent toggling', () => {
  const readFailure = createHarness({ readError: true });
  readFailure.ui.updateVisibility();
  assert.equal(readFailure.ui.isPreferenceEnabled(), true);
  assert.equal(readFailure.element.hidden, false);

  const writeFailure = createHarness({ writeError: true });
  assert.doesNotThrow(() => writeFailure.ui.toggle());
  assert.equal(writeFailure.ui.isPreferenceEnabled(), false);
  assert.equal(writeFailure.element.hidden, true);
});

test('guests and signed-out users cannot toggle the hint preference', () => {
  const guest = createHarness({ userRole: 'guest' });
  guest.ui.toggle();
  assert.equal(guest.ui.isPreferenceEnabled(), true);
  assert.deepEqual(guest.writes, []);

  const signedOut = createHarness({ userRole: null });
  signedOut.ui.toggle();
  assert.equal(signedOut.ui.isPreferenceEnabled(), true);
  assert.deepEqual(signedOut.writes, []);
});
