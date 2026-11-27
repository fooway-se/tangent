import assert from 'node:assert/strict';
import test from 'node:test';
import { initGoPrefixUi } from '../../public/assets/go-prefix-ui.js';

function createHarness() {
  const timers = new Map();
  let nextTimerId = 1;
  const clearedTimers = [];
  const ui = initGoPrefixUi({
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
  return { ui, timers, clearedTimers };
}

test('starting the prefix only starts its timeout and does not reveal a transient hint row', () => {
  const harness = createHarness();
  harness.ui.start();

  assert.equal(harness.ui.isPending(), true);
  assert.deepEqual([...harness.timers.values()].map((timer) => timer.delay), [1200]);
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
  assert.equal(harness.timers.size, 0);
});

test('clearing the prefix cancels its timeout', () => {
  const harness = createHarness();
  harness.ui.start();
  const [timerId] = harness.timers.keys();

  harness.ui.clear();

  assert.equal(harness.ui.isPending(), false);
  assert.deepEqual(harness.clearedTimers, [timerId]);
  assert.equal(harness.timers.size, 0);
});
