import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { createTangentClient } from './client.js';
import { formatIssuePrompt } from '../../../public/assets/issue-prompt.mjs';

export function createTangentMcpServer(config) {
  const tangent = createTangentClient(config);
  const server = new McpServer({ name: 'tangent-agent', version: '0.1.0' });

  server.registerTool(
    'list_projects',
    {
      title: 'List Tangent projects available to this agent',
      description: 'List project IDs, names, and statuses for projects this agent can read issues from. Requires issues.read.',
      inputSchema: z.object({}).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => textResult(await tangent.listProjects()),
  );

  server.registerTool(
    'list_project_issues',
    {
      title: 'List Tangent project issues',
      description: 'List open issues in one project granted to this Tangent agent. Requires issues.read.',
      inputSchema: z.object({
        project_id: z.number().int().positive().describe('Numeric ID of a project granted to this agent.'),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ project_id: projectId }) => textResult(await tangent.listIssues(projectId)),
  );

  server.registerTool(
    'get_issue',
    {
      title: 'Read a Tangent issue',
      description: 'Read an issue and its saved context, expected outcome, and acceptance criteria. Requires issues.read and a project grant.',
      inputSchema: z.object({
        issue_id: z.number().int().positive().describe('Numeric ID of the issue to read.'),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ issue_id: issueId }) => textResult(await tangent.getIssue(issueId)),
  );

  server.registerTool(
    'get_issue_prompt',
    {
      title: 'Get a ready-to-use coding prompt for a Tangent issue',
      description: 'Format an issue and its saved context as the same copy-ready implementation prompt shown by Tangent. Requires issues.read and a project grant.',
      inputSchema: z.object({
        issue_id: z.number().int().positive().describe('Numeric ID of the issue to prepare a prompt for.'),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ issue_id: issueId }) => {
      const { issue } = await tangent.getIssue(issueId);
      return { content: [{ type: 'text', text: formatIssuePrompt(issue) }] };
    },
  );

  server.registerTool(
    'post_issue_comment',
    {
      title: 'Post an issue progress comment',
      description: 'Post a progress note to issue discussion. Requires issues.comment and a project grant.',
      inputSchema: z.object({
        issue_id: z.number().int().positive().describe('Numeric ID of the issue to comment on.'),
        body: z.string().trim().min(1).max(10_000).describe('Progress note text.'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ issue_id: issueId, body }) => textResult(await tangent.addComment(issueId, body)),
  );

  server.registerTool(
    'update_issue_status',
    {
      title: 'Update a Tangent issue status',
      description: 'Move an open issue to doing or testing. Requires issues.status.update and a project grant. Agents cannot complete or cancel issues.',
      inputSchema: z.object({
        issue_id: z.number().int().positive().describe('Numeric ID of the issue to update.'),
        status: z.enum(['doing', 'testing']).describe('The status to set.'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ issue_id: issueId, status }) => textResult(await tangent.updateStatus(issueId, status)),
  );

  return server;
}

function textResult(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}
