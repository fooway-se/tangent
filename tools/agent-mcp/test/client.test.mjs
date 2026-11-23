import assert from 'node:assert/strict';
import test from 'node:test';
import { createTangentClient } from '../src/client.js';

const token = 'a'.repeat(64);

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

test('agent API client preserves a Tangent install path and uses the scoped bearer token', async () => {
  const requests = [];
  const client = createTangentClient({
    baseUrl: 'https://tangent.example/workspace/',
    token,
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init });
      return jsonResponse(200, { issues: [{ id: 12, title: 'Fix export' }] });
    },
  });

  const result = await client.listIssues(7);

  assert.deepEqual(result, { issues: [{ id: 12, title: 'Fix export' }] });
  assert.equal(requests[0].url, 'https://tangent.example/workspace/api/v1/agent/projects/7/issues');
  assert.equal(requests[0].init.method, 'GET');
  assert.equal(requests[0].init.headers.get('Authorization'), `Bearer ${token}`);
  assert.equal(requests[0].init.headers.get('Cookie'), null);
});

test('agent API client lists only the projects available to the agent', async () => {
  const requests = [];
  const projects = [{ id: 7, name: 'Docs refresh', status: 'active' }];
  const client = createTangentClient({
    baseUrl: 'http://localhost:8081',
    token,
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init });
      return jsonResponse(200, { projects });
    },
  });

  const result = await client.listProjects();

  assert.deepEqual(result, { projects });
  assert.equal(requests[0].url, 'http://localhost:8081/api/v1/agent/projects');
  assert.equal(requests[0].init.method, 'GET');
  assert.equal(requests[0].init.headers.get('Authorization'), `Bearer ${token}`);
});

test('agent API client selects a non-default workspace only when configured', async () => {
  const headers = [];
  const fetchImpl = async (_url, init) => {
    headers.push(init.headers);
    return jsonResponse(200, { issues: [] });
  };
  const selected = createTangentClient({ baseUrl: 'http://localhost:8081', token, workspaceId: 23, fetchImpl });
  const defaultWorkspace = createTangentClient({ baseUrl: 'http://localhost:8081', token, fetchImpl });

  await selected.listIssues(7);
  await defaultWorkspace.listIssues(7);

  assert.equal(headers[0].get('X-Tangent-Workspace'), '23');
  assert.equal(headers[1].get('X-Tangent-Workspace'), null);
});

test('agent API client maps read and write operations to the dedicated agent routes', async () => {
  const requests = [];
  const client = createTangentClient({
    baseUrl: 'http://localhost:8081',
    token,
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init });
      return jsonResponse(200, { ok: true });
    },
  });

  await client.getIssue(42);
  await client.addComment(42, 'Progress update');
  await client.updateStatus(42, 'testing');

  assert.deepEqual(requests.map(({ url, init }) => [url, init.method]), [
    ['http://localhost:8081/api/v1/agent/issues/42', 'GET'],
    ['http://localhost:8081/api/v1/agent/issues/42/discussion', 'POST'],
    ['http://localhost:8081/api/v1/agent/issues/42/status', 'PATCH'],
  ]);
  assert.deepEqual(JSON.parse(requests[1].init.body), { body: 'Progress update' });
  assert.deepEqual(JSON.parse(requests[2].init.body), { status: 'testing' });
});

test('agent API client rejects invalid IDs and statuses before making a request', async () => {
  let requestCount = 0;
  const client = createTangentClient({
    baseUrl: 'http://localhost:8081',
    token,
    fetchImpl: async () => {
      requestCount += 1;
      return jsonResponse(200, {});
    },
  });

  await assert.rejects(client.listIssues('../users'), /positive integer/);
  await assert.rejects(client.getIssue(0), /positive integer/);
  await assert.rejects(client.updateStatus(42, 'done'), /doing or testing/);
  assert.equal(requestCount, 0);
});

test('agent API client reports API errors without exposing the bearer token', async () => {
  const client = createTangentClient({
    baseUrl: 'http://localhost:8081',
    token,
    fetchImpl: async () => jsonResponse(403, { error: { code: 'forbidden', message: 'The agent cannot read this project.' } }),
  });

  await assert.rejects(client.getIssue(42), (error) => {
    assert.match(error.message, /cannot read this project/);
    assert.doesNotMatch(error.message, new RegExp(token));
    assert.equal(error.status, 403);
    return true;
  });
});

test('agent API client refuses unsafe configuration', () => {
  assert.throws(() => createTangentClient({ baseUrl: 'file:///etc', token, fetchImpl: fetch }), /http or https/);
  assert.throws(() => createTangentClient({ baseUrl: 'https://user:pass@example.test', token, fetchImpl: fetch }), /credentials/);
  assert.throws(() => createTangentClient({ baseUrl: 'http://localhost:8081', token: 'short', fetchImpl: fetch }), /64-character/);
});
