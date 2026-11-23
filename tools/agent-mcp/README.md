# Tangent agent MCP adapter

This optional Node.js stdio server exposes Tangent's existing scoped agent API to MCP hosts. It is separate from the PHP web app and does not add a dependency to Tangent itself.

## Where it runs

Install the adapter on the machine or container that runs the MCP host and coding agent. Tangent can stay on its existing PHP host, including shared hosting. The MCP host starts this adapter as a child process over stdio, so Tangent does not need Node.js, an extra web service, or an inbound port for MCP. The host must be able to reach the Tangent URL you configure.

`localhost` always means the machine running the adapter. Use a URL reachable from that machine when the agent runs remotely.

## Install

Use Node.js 20 or later on the MCP host machine:

```sh
cd tools/agent-mcp
npm ci
```

## Configure the MCP host

Configure the host to launch Node.js with the adapter's absolute entrypoint path. MCP host configuration formats differ; this shows the common `mcpServers` shape:

```json
{
  "mcpServers": {
    "tangent": {
      "command": "node",
      "args": ["/absolute/path/to/tangent/tools/agent-mcp/src/index.js"],
      "env": {
        "TANGENT_URL": "https://tangent.example",
        "TANGENT_AGENT_TOKEN": "paste-the-one-time-token-here"
      }
    }
  }
}
```

Replace the example path and URL. Keep the token in the MCP host's local secret configuration and out of source control. Add `TANGENT_WORKSPACE_ID` under `env` when the agent belongs to a non-default workspace.

The adapter reads these environment variables:

| Variable | Required | Purpose |
|---|---|---|
| `TANGENT_URL` | Yes | Tangent app URL, including any install subpath, such as `https://tangent.example` or `https://example.test/tangent`. |
| `TANGENT_AGENT_TOKEN` | Yes | The one-time token created for the named agent. Keep it in the MCP host's local secret configuration. |
| `TANGENT_WORKSPACE_ID` | No | Positive workspace ID when the token belongs to a non-default workspace. |

The adapter speaks MCP over stdio. Its stdout is reserved for protocol messages; diagnostics go to stderr. Tool calls use the configured Tangent URL and expose only the scoped agent operations, with no workspace administration tools. After restarting the MCP host, confirm it lists all six tools below.

## Tools

| Tool | Capability | Operation |
|---|---|---|
| `list_projects` | `issues.read` | List accessible project IDs, names, and statuses. |
| `list_project_issues` | `issues.read` | List open issues in a granted project. |
| `get_issue` | `issues.read` | Read issue details and saved agent context. |
| `get_issue_prompt` | `issues.read` | Return the copy-ready implementation prompt using the issue's saved details and context. |
| `post_issue_comment` | `issues.comment` | Add a progress note to issue discussion. |
| `update_issue_status` | `issues.status.update` | Move an open issue to `doing` or `testing`. |

`get_issue_prompt` uses the same formatter as the browser's **Copy prompt** action. It reads saved issue fields through Tangent's scoped issue API; unsaved text in an open browser prompt builder is not included. Tangent assembles the prompt locally and does not send it to an AI service.

All access checks remain in Tangent's agent API. The adapter forwards the bearer token and optional workspace ID; a tool call cannot expand the token's project or capability grants.

## Test

```sh
npm test
```
