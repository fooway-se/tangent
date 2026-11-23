import assert from 'node:assert/strict';
import test from 'node:test';
import { initStatusMessageUi } from '../../public/assets/status-message-ui.js';

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.hidden = false;
    this.className = '';
    this.textContent = '';
    this.parentElement = null;
    this.classes = new Set();
    this.classList = {
      toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name),
      remove: (name) => this.classes.delete(name),
      contains: (name) => this.classes.has(name),
    };
  }

  append(...children) {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }

  replaceChildren(...children) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this.append(...children);
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  addEventListener(name, listener) {
    this.listeners.set(name, listener);
  }

  contains(target) {
    for (let element = target; element !== null; element = element.parentElement) {
      if (element === this) return true;
    }
    return false;
  }
}

function createHarness() {
  const created = [];
  const doc = {
    createElement: (tagName) => {
      const element = new FakeElement(tagName);
      created.push(element);
      return element;
    },
  };
  const loginStatusMessage = new FakeElement('div');
  const statusMessage = new FakeElement('div');
  const workspacePanel = new FakeElement('section');
  const timers = new Map();
  const clearedTimers = [];
  const calls = { moveStatus: 0, guestStatus: [] };
  let nextTimerId = 1;
  let guestVisible = false;
  const ui = initStatusMessageUi({
    doc,
    loginStatusMessage,
    statusMessage,
    workspacePanel,
    isGuestShellVisible: () => guestVisible,
    setGuestStatus: (message, isError) => calls.guestStatus.push({ message, isError }),
    moveWorkspaceStatusToCurrentHeading: () => { calls.moveStatus += 1; },
    setTimeout: (callback, delay) => {
      const id = nextTimerId++;
      timers.set(id, { callback: () => { timers.delete(id); callback(); }, delay });
      return id;
    },
    clearTimeout: (id) => {
      clearedTimers.push(id);
      timers.delete(id);
    },
  });
  return {
    ui, doc, created, loginStatusMessage, statusMessage, workspacePanel, timers, clearedTimers, calls,
    setGuestVisible: (value) => { guestVisible = value; },
  };
}

test('login status uses the terminal label, prompt, message, and ready cursor', () => {
  const harness = createHarness();
  harness.workspacePanel.hidden = true;

  harness.ui.report('Credentials rejected.', true);

  assert.equal(harness.loginStatusMessage.children[0].textContent, 'SIGN-IN FAILED.');
  assert.equal(harness.loginStatusMessage.children[1].children[0].textContent, '>');
  assert.equal(harness.loginStatusMessage.children[1].children[1].textContent, 'Credentials rejected.');
  assert.equal(harness.loginStatusMessage.classList.contains('error'), true);
  harness.ui.report('');
  assert.equal(harness.loginStatusMessage.children[0].textContent, 'READY.');
  assert.equal(harness.loginStatusMessage.children[1].children[1].className, 'login-terminal-cursor');
});

test('workspace notices move to the current heading and clear after four seconds', () => {
  const harness = createHarness();

  harness.ui.report('Saved changes.');

  assert.equal(harness.calls.moveStatus, 1);
  assert.equal(harness.statusMessage.children[0].textContent, 'Saved changes.');
  assert.deepEqual([...harness.timers.values()].map((timer) => timer.delay), [4000]);
  const [{ callback }] = harness.timers.values();
  callback();
  assert.equal(harness.statusMessage.children.length, 0);
  assert.equal(harness.timers.size, 0);
});

test('errors stay visible until dismissed and replace any existing timeout', () => {
  const harness = createHarness();
  harness.ui.report('Previous notice.');
  const [oldTimerId] = harness.timers.keys();

  harness.ui.report('Could not save.', true);

  assert.deepEqual(harness.clearedTimers, [oldTimerId]);
  assert.equal(harness.statusMessage.children[0].textContent, 'Could not save.');
  assert.equal(harness.statusMessage.classList.contains('error'), true);
  assert.equal(harness.timers.size, 0);
  const dismiss = harness.statusMessage.children[1];
  assert.equal(dismiss.attributes.get('aria-label'), 'Dismiss notification');
  dismiss.listeners.get('click')();
  assert.equal(harness.statusMessage.children.length, 0);
  assert.equal(harness.statusMessage.classList.contains('error'), false);
});

test('guest status is delegated without changing the workspace status area', () => {
  const harness = createHarness();
  harness.setGuestVisible(true);

  harness.ui.report('Review the shared update.', true);

  assert.deepEqual(harness.calls.guestStatus, [{ message: 'Review the shared update.', isError: true }]);
  assert.equal(harness.statusMessage.children.length, 0);
  assert.equal(harness.loginStatusMessage.children.length, 0);
  assert.equal(harness.timers.size, 0);
});
