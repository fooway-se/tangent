import assert from 'node:assert/strict';
import test from 'node:test';
import { bindRealtimePolling, shouldUsePolling } from '../../public/assets/realtime-polling.js';

function fakeRealtime() {
  let connected = false;
  const updates = new Set();
  const state = new Set();
  return {
    isConnected: () => connected,
    onUpdate: (listener) => { updates.add(listener); return () => updates.delete(listener); },
    onConnectionChange: (listener) => { state.add(listener); return () => state.delete(listener); },
    setConnected: (value) => { connected = value; for (const listener of state) listener(value); },
    refresh: () => { for (const listener of updates) listener(); },
  };
}

test('polling is disabled only while the shared SSE transport is healthy', () => {
  const realtime = fakeRealtime();
  assert.equal(shouldUsePolling(realtime), true);
  realtime.setConnected(true);
  assert.equal(shouldUsePolling(realtime), false);
  realtime.setConnected(false);
  assert.equal(shouldUsePolling(realtime), true);
});

test('shared realtime updates pause polling, refresh active views, and restore fallback polling', () => {
  const realtime = fakeRealtime();
  let active = true;
  const calls = [];
  const unsubscribe = bindRealtimePolling({
    realtime,
    isActive: () => active,
    pausePolling: () => calls.push('pause'),
    resumePolling: () => calls.push('resume'),
    refresh: () => calls.push('refresh'),
  });

  realtime.setConnected(true);
  realtime.refresh();
  active = false;
  realtime.refresh();
  active = true;
  realtime.setConnected(false);
  unsubscribe();

  assert.deepEqual(calls, ['pause', 'refresh', 'refresh', 'resume']);
});

test('an SSE connection immediately catches up active views after polling is paused', () => {
  const realtime = fakeRealtime();
  const calls = [];
  bindRealtimePolling({
    realtime,
    isActive: () => true,
    pausePolling: () => calls.push('pause'),
    resumePolling: () => calls.push('resume'),
    refresh: () => calls.push('refresh'),
  });

  realtime.setConnected(true);

  assert.deepEqual(calls, ['pause', 'refresh']);
});
