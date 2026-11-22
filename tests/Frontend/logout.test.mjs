import assert from 'node:assert/strict';
import test from 'node:test';
import { createLogoutController } from '../../public/assets/logout.js';

test('failed logout stays signed in, reports a retryable error, and clears pending state', async () => {
  const state = { signedOut: false, failures: [], pending: [] };
  const error = new Error('network unavailable');
  const signOut = createLogoutController({
    logout: async () => { throw error; },
    onSignedOut: () => { state.signedOut = true; },
    onFailure: (failure) => state.failures.push(failure),
    onPending: (pending) => state.pending.push(pending),
    isExpiredSession: () => false,
  });

  await assert.doesNotReject(() => signOut());
  assert.equal(state.signedOut, false);
  assert.deepEqual(state.failures, [error]);
  assert.deepEqual(state.pending, [true, false]);
});

test('successful logout transitions to signed out', async () => {
  const state = { signedOut: false, failures: [] };
  const signOut = createLogoutController({
    logout: async () => undefined,
    onSignedOut: () => { state.signedOut = true; },
    onFailure: (failure) => state.failures.push(failure),
    onPending: () => undefined,
    isExpiredSession: () => false,
  });

  await signOut();
  assert.equal(state.signedOut, true);
  assert.deepEqual(state.failures, []);
});

test('confirmed expired session transitions to signed out', async () => {
  const state = { signedOut: false, failures: [] };
  const error = Object.assign(new Error('expired'), { status: 401 });
  const signOut = createLogoutController({
    logout: async () => { throw error; },
    onSignedOut: () => { state.signedOut = true; },
    onFailure: (failure) => state.failures.push(failure),
    onPending: () => undefined,
    isExpiredSession: (failure) => failure?.status === 401,
  });

  await signOut();
  assert.equal(state.signedOut, true);
  assert.deepEqual(state.failures, []);
});

test('concurrent sign-out attempts share one request', async () => {
  let resolveLogout;
  let requests = 0;
  const signOut = createLogoutController({
    logout: () => {
      requests++;
      return new Promise((resolve) => { resolveLogout = resolve; });
    },
    onSignedOut: () => undefined,
    onFailure: () => undefined,
    onPending: () => undefined,
    isExpiredSession: () => false,
  });

  const first = signOut();
  await signOut();
  assert.equal(requests, 1);
  resolveLogout();
  await first;
});
