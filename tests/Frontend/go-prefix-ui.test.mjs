import assert from 'node:assert/strict';
import test from 'node:test';
import { initGoPrefixUi } from '../../public/assets/go-prefix-ui.js';

class FakeElement {
  constructor() {
    this.hidden = true;
  }
}

function createHarness(context = {}) {
  const hint = new FakeElement();
  const workspaceOption = new FakeElement();
  const projectOptions = new FakeElement();
  const adminOption = new FakeElement();
  const roadmapOption = new FakeElement();
  const timers = new Map();
  let nextTimerId = 1;
  const clearedTimers = [];
  const current = {
    workspaceCount: 1,
    hasProject: false,
    projectVisible: false,
    isAdmin: false,
    canUseRoadmap: false,
    ...context,
  };
  const ui = initGoPrefixUi({
    hint,
    workspaceOption,
    projectOptions,
    adminOption,
    roadmapOption,
    getContext: () => current,
    setTimeout: (callback, delay) => {
      const id = nextTimerId++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id) => {
      clearedTimers.push(id);
      timers.delete(id);
    },
  });
  return { ui, hint, workspaceOption, projectOptions, adminOption, roadmapOption, timers, clearedTimers, current };
}

test('starting the prefix shows only options available in the current workspace context', () => {
  const harness = createHarness({
    workspaceCount: 2,
    hasProject: true,
    projectVisible: true,
    isAdmin: true,
    canUseRoadmap: true,
  });

  harness.ui.start();

  assert.equal(harness.ui.isPending(), true);
  assert.equal(harness.hint.hidden, false);
  assert.equal(harness.workspaceOption.hidden, false);
  assert.equal(harness.projectOptions.hidden, false);
  assert.equal(harness.adminOption.hidden, false);
  assert.equal(harness.roadmapOption.hidden, false);
  assert.deepEqual([...harness.timers.values()].map((timer) => timer.delay), [1200]);
});

test('guest and single workspace contexts hide unavailable prefix options', () => {
  const harness = createHarness({
    workspaceCount: 1,
    hasProject: true,
    projectVisible: false,
    isAdmin: false,
    canUseRoadmap: false,
  });

  harness.ui.start();

  assert.equal(harness.workspaceOption.hidden, true);
  assert.equal(harness.projectOptions.hidden, true);
  assert.equal(harness.adminOption.hidden, true);
  assert.equal(harness.roadmapOption.hidden, true);
});

test('restarting replaces the old timeout and expiry clears the pending prefix', () => {
  const harness = createHarness();
  harness.ui.start();
  const [oldTimerId] = harness.timers.keys();

  harness.ui.start();
  assert.deepEqual(harness.clearedTimers, [oldTimerId]);
  assert.equal(harness.timers.size, 1);
  const [{ callback }] = harness.timers.values();
  callback();

  assert.equal(harness.ui.isPending(), false);
  assert.equal(harness.hint.hidden, true);
  assert.equal(harness.timers.size, 0);
});

test('clearing the prefix hides its hint and cancels its timeout', () => {
  const harness = createHarness();
  harness.ui.start();
  const [timerId] = harness.timers.keys();

  harness.ui.clear();

  assert.equal(harness.ui.isPending(), false);
  assert.equal(harness.hint.hidden, true);
  assert.deepEqual(harness.clearedTimers, [timerId]);
  assert.equal(harness.timers.size, 0);
});
