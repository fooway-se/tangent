import assert from 'node:assert/strict';
import test from 'node:test';
import { configFromEnvironment, start } from '../src/index.js';

const token = 'c'.repeat(64);

test('MCP configuration reads app URL, token, and optional workspace ID', () => {
  assert.deepEqual(configFromEnvironment({
    TANGENT_URL: 'https://tangent.example',
    TANGENT_AGENT_TOKEN: token,
    TANGENT_WORKSPACE_ID: '23',
  }), {
    baseUrl: 'https://tangent.example',
    token,
    workspaceId: 23,
  });
});

test('MCP configuration defaults the workspace ID and rejects invalid values', () => {
  assert.deepEqual(configFromEnvironment({ TANGENT_URL: 'http://localhost:8081', TANGENT_AGENT_TOKEN: token }), {
    baseUrl: 'http://localhost:8081',
    token,
    workspaceId: undefined,
  });
  assert.throws(() => configFromEnvironment({ TANGENT_URL: 'http://localhost:8081' }), /TANGENT_AGENT_TOKEN/);
  assert.throws(() => configFromEnvironment({ TANGENT_URL: 'http://localhost:8081', TANGENT_AGENT_TOKEN: token, TANGENT_WORKSPACE_ID: '0' }), /positive integer/);
});

test('MCP server rejects malformed credentials before opening stdio', () => {
  assert.throws(() => start({
    TANGENT_URL: 'http://localhost:8081',
    TANGENT_AGENT_TOKEN: 'not-a-token',
  }), /64-character/);
});
