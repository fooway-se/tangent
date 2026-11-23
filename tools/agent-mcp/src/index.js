import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { validateTangentClientConfig } from './client.js';
import { createTangentMcpServer } from './server.js';

export function configFromEnvironment(environment = process.env) {
  const baseUrl = environment.TANGENT_URL;
  const token = environment.TANGENT_AGENT_TOKEN;
  if (typeof baseUrl !== 'string' || baseUrl.trim() === '') {
    throw new Error('Set TANGENT_URL to the Tangent app URL.');
  }
  if (typeof token !== 'string' || token === '') {
    throw new Error('Set TANGENT_AGENT_TOKEN to the one-time agent token.');
  }
  const workspaceValue = environment.TANGENT_WORKSPACE_ID;
  let workspaceId;
  if (workspaceValue !== undefined && workspaceValue !== '') {
    if (!/^\d+$/.test(workspaceValue)) {
      throw new Error('TANGENT_WORKSPACE_ID must be a positive integer.');
    }
    workspaceId = Number(workspaceValue);
    if (!Number.isSafeInteger(workspaceId) || workspaceId <= 0) {
      throw new Error('TANGENT_WORKSPACE_ID must be a positive integer.');
    }
  }
  const config = { baseUrl, token, workspaceId };
  validateTangentClientConfig(config);
  return config;
}

export function start(environment = process.env, transport) {
  const config = configFromEnvironment(environment);
  return serveStdio(
    () => createTangentMcpServer(config),
    transport === undefined ? {} : { transport },
  );
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    start();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid Tangent MCP server configuration.';
    console.error(`Tangent MCP server: ${message}`);
    process.exitCode = 1;
  }
}
