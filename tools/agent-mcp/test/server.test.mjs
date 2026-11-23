import assert from 'node:assert/strict';
import test from 'node:test';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { start } from '../src/index.js';
import { createTangentMcpServer } from '../src/server.js';
import { formatIssuePrompt } from '../../../public/assets/issue-prompt.mjs';

const token = 'b'.repeat(64);

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function connectServer(t, fetchImpl) {
  const server = createTangentMcpServer({
    baseUrl: 'https://tangent.example',
    token,
    fetchImpl,
  });
  const client = new Client({ name: 'tangent-mcp-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.server.connect(serverTransport)]);
  t.after(async () => {
    await client.close();
    await server.close();
  });
  return { client, server };
}

test('MCP server exposes the scoped project discovery and issue tools', async (t) => {
  const requests = [];
  const projects = [{ id: 7, name: 'Docs refresh', status: 'active' }];
  const issue = {
    id: 42,
    title: 'Fix export',
    description: 'Keep exports portable.',
    status: 'testing',
    priority: 'high',
    due_date: '2027-01-02',
    type: 'bug',
    context: 'The current export omits saved context.',
    expected_outcome: 'The prompt includes the saved brief.',
    acceptance_criteria: 'Saved context is included.\nThe prompt is ready to copy.',
  };
  const { client } = await connectServer(t, async (url, init) => {
    requests.push({ url: String(url), init });
    if (String(url).endsWith('/agent/projects')) return jsonResponse(200, { projects });
    if (String(url).endsWith('/agent/projects/7/issues')) return jsonResponse(200, { issues: [issue] });
    if (String(url).endsWith('/agent/issues/42/discussion')) return jsonResponse(201, { message: { id: 8, body: 'Progress update' } });
    if (String(url).endsWith('/agent/issues/42/status')) return jsonResponse(200, { issue });
    if (String(url).endsWith('/agent/issues/42')) return jsonResponse(200, { issue });
    return jsonResponse(404, { error: { code: 'not_found', message: 'Route not found.' } });
  });

  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(({ name }) => name), [
    'list_projects',
    'list_project_issues',
    'get_issue',
    'get_issue_prompt',
    'post_issue_comment',
    'update_issue_status',
  ]);
  assert.equal(tools.find(({ name }) => name === 'list_projects').annotations.readOnlyHint, true);
  assert.equal(tools.find(({ name }) => name === 'list_project_issues').annotations.readOnlyHint, true);
  assert.equal(tools.find(({ name }) => name === 'get_issue_prompt').annotations.readOnlyHint, true);
  assert.equal(tools.find(({ name }) => name === 'post_issue_comment').annotations.readOnlyHint, false);

  const projectList = await client.callTool({ name: 'list_projects', arguments: {} });
  const listed = await client.callTool({ name: 'list_project_issues', arguments: { project_id: 7 } });
  const read = await client.callTool({ name: 'get_issue', arguments: { issue_id: 42 } });
  const prompt = await client.callTool({ name: 'get_issue_prompt', arguments: { issue_id: 42 } });
  const comment = await client.callTool({ name: 'post_issue_comment', arguments: { issue_id: 42, body: 'Progress update' } });
  const status = await client.callTool({ name: 'update_issue_status', arguments: { issue_id: 42, status: 'testing' } });

  assert.equal(projectList.isError, undefined);
  assert.deepEqual(JSON.parse(projectList.content[0].text), { projects });
  assert.equal(listed.isError, undefined);
  assert.deepEqual(JSON.parse(listed.content[0].text), { issues: [issue] });
  assert.deepEqual(JSON.parse(read.content[0].text), { issue });
  assert.equal(prompt.content[0].text, formatIssuePrompt(issue));
  assert.deepEqual(JSON.parse(comment.content[0].text), { message: { id: 8, body: 'Progress update' } });
  assert.deepEqual(JSON.parse(status.content[0].text), { issue });
  assert.equal(requests.every(({ init }) => init.headers.get('Authorization') === `Bearer ${token}`), true);
  assert.deepEqual(requests.map(({ url }) => new URL(url).pathname), [
    '/api/v1/agent/projects',
    '/api/v1/agent/projects/7/issues',
    '/api/v1/agent/issues/42',
    '/api/v1/agent/issues/42',
    '/api/v1/agent/issues/42/discussion',
    '/api/v1/agent/issues/42/status',
  ]);
  assert.deepEqual(JSON.parse(requests[4].init.body), { body: 'Progress update' });
  assert.deepEqual(JSON.parse(requests[5].init.body), { status: 'testing' });
});

test('MCP input validation rejects completed statuses before calling Tangent', async (t) => {
  let requestCount = 0;
  const { client } = await connectServer(t, async () => {
    requestCount += 1;
    return jsonResponse(200, {});
  });

  const result = await client.callTool({
    name: 'update_issue_status',
    arguments: { issue_id: 42, status: 'done' },
  });

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /doing.*testing/);
  assert.equal(requestCount, 0);
});

test('MCP tools return scoped API errors as tool errors', async (t) => {
  const { client } = await connectServer(t, async () => jsonResponse(403, {
    error: { code: 'forbidden', message: 'This agent has no access to that issue.' },
  }));

  const result = await client.callTool({ name: 'get_issue', arguments: { issue_id: 42 } });
  const prompt = await client.callTool({ name: 'get_issue_prompt', arguments: { issue_id: 42 } });

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /no access to that issue/);
  assert.doesNotMatch(result.content[0].text, new RegExp(token));
  assert.equal(prompt.isError, true);
  assert.match(prompt.content[0].text, /no access to that issue/);
  assert.doesNotMatch(prompt.content[0].text, new RegExp(token));
});

test('MCP entrypoint serves configured tools through the protocol router', async (t) => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const serverHandle = start({
    TANGENT_URL: 'http://localhost:8081',
    TANGENT_AGENT_TOKEN: token,
  }, serverTransport);
  const client = new Client({ name: 'tangent-stdio-test', version: '1.0.0', versionNegotiation: { mode: 'legacy' } });
  t.after(async () => {
    await client.close();
    await serverHandle.close();
  });
  await client.connect(clientTransport, { timeout: 1_000 });

  const { tools } = await client.listTools();

  assert.equal(tools.length, 6);
  assert.equal(tools[0].name, 'list_projects');
});
