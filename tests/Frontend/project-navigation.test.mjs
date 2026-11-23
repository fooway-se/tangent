import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ProjectNavigationOwner, runOwnedRequest } from '../../public/assets/project-navigation.js';

const app = await readFile(new URL('../../frontend/src/app.ts', import.meta.url), 'utf8');
const navigation = await readFile(new URL('../../frontend/src/project-navigation.ts', import.meta.url), 'utf8');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test('only the latest project navigation applies its result', async () => {
  const owner = new ProjectNavigationOwner();
  const firstRequest = deferred();
  const secondRequest = deferred();
  const applied = [];
  const first = runOwnedRequest(owner, owner.begin(), () => firstRequest.promise, (value) => applied.push(value), () => undefined);
  const second = runOwnedRequest(owner, owner.begin(), () => secondRequest.promise, (value) => applied.push(value), () => undefined);

  secondRequest.resolve('new project');
  await second;
  firstRequest.resolve('old project');
  await first;
  assert.deepEqual(applied, ['new project']);
});

test('superseding or invalidating a navigation aborts its request signal', async () => {
  const owner = new ProjectNavigationOwner();
  const firstRequest = deferred();
  const firstTicket = owner.begin();
  let firstSignal;
  const first = runOwnedRequest(
    owner,
    firstTicket,
    (signal) => { firstSignal = signal; return firstRequest.promise; },
    () => undefined,
    () => undefined,
  );
  const secondTicket = owner.begin();
  assert.equal(firstSignal.aborted, true);

  const secondRequest = deferred();
  let secondSignal;
  const second = runOwnedRequest(
    owner,
    secondTicket,
    (signal) => { secondSignal = signal; return secondRequest.promise; },
    () => undefined,
    () => undefined,
  );
  owner.changeSession();
  assert.equal(secondSignal.aborted, true);
  firstRequest.resolve('stale');
  secondRequest.resolve('signed out');
  await Promise.all([first, second]);
});

test('a stale navigation failure cannot replace the current view', async () => {
  const owner = new ProjectNavigationOwner();
  const request = deferred();
  const failures = [];
  const pending = runOwnedRequest(owner, owner.begin(), () => request.promise, () => undefined, (error) => failures.push(error));

  owner.begin();
  request.reject(new Error('stale failure'));
  await pending;
  assert.deepEqual(failures, []);
});

test('a request completing after sign-out cannot restore project data', async () => {
  const owner = new ProjectNavigationOwner();
  const request = deferred();
  const applied = [];
  const pending = runOwnedRequest(owner, owner.begin(), () => request.promise, (value) => applied.push(value), () => undefined);

  owner.changeSession();
  request.resolve('private project data');
  await pending;
  assert.deepEqual(applied, []);
});

test('the current navigation still applies results and reports failures', async () => {
  const owner = new ProjectNavigationOwner();
  const applied = [];
  const failures = [];
  await runOwnedRequest(owner, owner.begin(), async () => 'current project', (value) => applied.push(value), () => undefined);
  const error = new Error('current request failed');
  await runOwnedRequest(owner, owner.begin(), async () => { throw error; }, () => undefined, (failure) => failures.push(failure));
  assert.deepEqual(applied, ['current project']);
  assert.deepEqual(failures, [error]);
});

test('project detail wiring aborts obsolete requests and invalidates on navigation or session changes', () => {
  const loader = app.slice(app.indexOf('async function loadProjectDetail('), app.indexOf('\nfunction switchProjectTab(', app.indexOf('async function loadProjectDetail(')));
  assert.match(loader, /runOwnedRequest\(/);
  assert.match(loader, /async \(signal\)/);
  assert.match(loader, /signal \}/);
  assert.doesNotMatch(app, /projectDetailAbortController/);
  assert.match(navigation, /this\.controller\?\.abort\(\)/);
  assert.match(app, /function showSignedOut\(\): void \{\s*realtimeTransport\.stop\(\);\s*invalidateProjectNavigation\(true\)/);
  assert.match(app, /function showSignedIn\(user: User\): void \{\s*realtimeTransport\.stop\(\);\s*invalidateProjectNavigation\(true\)/);
  assert.match(app, /if \(view !== 'project'\) invalidateProjectNavigation\(\)/);
});
