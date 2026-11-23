import assert from 'node:assert/strict';
import test from 'node:test';
import { initRealtimeTransport } from '../../public/assets/realtime-transport.js';

class FakeTimers {
  tasks = new Map();
  now = 0;
  nextId = 1;

  setTimeout = (callback, delay) => {
    const id = this.nextId++;
    this.tasks.set(id, { callback, at: this.now + delay });
    return id;
  };

  clearTimeout = (id) => this.tasks.delete(id);

  tick(milliseconds) {
    const end = this.now + milliseconds;
    while (true) {
      const next = [...this.tasks.entries()]
        .filter(([, task]) => task.at <= end)
        .sort((left, right) => left[1].at - right[1].at)[0];
      if (next === undefined) break;
      const [id, task] = next;
      this.tasks.delete(id);
      this.now = task.at;
      task.callback();
    }
    this.now = end;
  }
}

class FakeEventSource {
  static instances = [];

  listeners = new Map();
  closed = false;
  readyState = 0;
  onopen = null;
  onerror = null;

  constructor(url) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(name, listener) {
    const listeners = this.listeners.get(name) ?? [];
    listeners.push(listener);
    this.listeners.set(name, listeners);
  }

  open() {
    this.onopen?.();
  }

  fail() {
    this.onerror?.();
  }

  failClosed() {
    this.readyState = 2;
    this.onerror?.();
  }

  emit(name, data = '{}') {
    for (const listener of this.listeners.get(name) ?? []) listener({ data });
  }

  close() {
    this.closed = true;
  }
}

function createTransport(timers, overrides = {}) {
  FakeEventSource.instances = [];
  return initRealtimeTransport({
    url: '/api/v1/events/stream',
    eventSourceFactory: (url) => new FakeEventSource(url),
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    connectionTimeoutMs: 5_000,
    heartbeatTimeoutMs: 30_000,
    reconnectDelayMs: 10_000,
    disconnectGraceMs: 2_000,
    ...overrides,
  });
}

test('SSE connection replaces poll transport and forwards refresh notifications', () => {
  const timers = new FakeTimers();
  const transport = createTransport(timers);
  const updates = [];
  const states = [];
  transport.onUpdate(() => updates.push('refresh'));
  transport.onConnectionChange((connected) => states.push(connected));

  transport.start();
  assert.equal(transport.isConnected(), false);
  assert.equal(FakeEventSource.instances[0].url, '/api/v1/events/stream');

  FakeEventSource.instances[0].open();
  FakeEventSource.instances[0].emit('refresh', '{"cursor":4}');

  assert.equal(transport.isConnected(), true);
  assert.deepEqual(states, [true]);
  assert.deepEqual(updates, ['refresh']);
});

test('failed SSE falls back to polling and retries until the stream reconnects', () => {
  const timers = new FakeTimers();
  const transport = createTransport(timers);
  const states = [];
  transport.onConnectionChange((connected) => states.push(connected));

  transport.start();
  timers.tick(5_000);
  assert.equal(transport.isConnected(), false);
  assert.equal(FakeEventSource.instances[0].closed, true);

  timers.tick(10_000);
  assert.equal(FakeEventSource.instances.length, 2);
  FakeEventSource.instances[1].open();
  assert.equal(transport.isConnected(), true);

  assert.deepEqual(states, [true]);
});

test('a server-disabled stream immediately falls back and retries after the configured delay', () => {
  const timers = new FakeTimers();
  const transport = createTransport(timers);
  const states = [];
  transport.onConnectionChange((connected) => states.push(connected));

  transport.start();
  FakeEventSource.instances[0].failClosed();
  assert.equal(FakeEventSource.instances[0].closed, true);
  assert.deepEqual(states, []);

  timers.tick(10_000);
  assert.equal(FakeEventSource.instances.length, 2);
  assert.deepEqual(states, []);
});

test('a broken live stream falls back only after a grace period and stop clears retries', () => {
  const timers = new FakeTimers();
  const transport = createTransport(timers);
  const states = [];
  transport.onConnectionChange((connected) => states.push(connected));

  transport.start();
  FakeEventSource.instances[0].open();
  FakeEventSource.instances[0].fail();
  timers.tick(1_999);
  assert.equal(transport.isConnected(), true);
  timers.tick(1);
  assert.equal(transport.isConnected(), false);
  assert.deepEqual(states, [true, false]);

  transport.stop();
  timers.tick(20_000);
  assert.equal(FakeEventSource.instances.length, 1);
});

test('a silent stream falls back when SSE heartbeats stop arriving', () => {
  const timers = new FakeTimers();
  const transport = createTransport(timers);
  const states = [];
  transport.onConnectionChange((connected) => states.push(connected));
  transport.start();
  FakeEventSource.instances[0].open();

  timers.tick(29_999);
  assert.equal(transport.isConnected(), true);
  timers.tick(1);

  assert.equal(transport.isConnected(), false);
  assert.equal(FakeEventSource.instances[0].closed, true);
  assert.deepEqual(states, [true, false]);
});

test('SSE heartbeat events extend the healthy connection window', () => {
  const timers = new FakeTimers();
  const transport = createTransport(timers);
  transport.start();
  FakeEventSource.instances[0].open();

  timers.tick(20_000);
  FakeEventSource.instances[0].emit('heartbeat');
  timers.tick(20_000);
  assert.equal(transport.isConnected(), true);
  timers.tick(10_000);

  assert.equal(transport.isConnected(), false);
});
