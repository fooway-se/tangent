# Coding agent access

Tangent supports named coding-agent identities with workspace-admin-managed tokens. Each identity is restricted to selected active or paused projects and one or more issue capabilities. Agent tokens are separate from human API tokens, expire after 90 days by default, and are stored only as hashes.

Available capabilities:

| Capability | Access |
|---|---|
| `issues.read` | List open issues in a granted project and read issue details, including saved prompt context and acceptance criteria. |
| `issues.comment` | Post progress notes to issue discussion. |
| `issues.status.update` | Move an open issue to `doing` or `testing`. Agents cannot mark work done or cancelled, or reopen a closed issue. |

Agents use only the `/api/v1/agent/...` endpoints. Their tokens cannot use the general workspace, project, member, inbox, guest, or issue mutation APIs. Project access and the token owner's current membership are checked on every request. Discussion notes and status history identify the named agent.

## Create an agent

Workspace admins can manage agents from **Workspace admin → Agents**. Choose a name, one or more active or paused projects, the capabilities, and a token lifetime. Read access is selected by default; comments and status updates require explicit selection. Tangent shows the raw token once in a dialog, so copy it into the coding agent's secret store before closing the dialog. The agent list shows grants, token expiry, and last use without exposing the token.

The same operation is available through the API using a workspace admin's API token or browser session. A human API token can be created through `POST /api/v1/tokens` while signed in as the admin. The raw agent token is returned once; keep it in the coding agent's secret store.

```sh
curl --fail-with-body -sS "$TANGENT_URL/api/v1/agents" \
  -H "Authorization: Bearer $TANGENT_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Build agent",
    "project_ids": [12],
    "capabilities": ["issues.read", "issues.comment", "issues.status.update"],
    "expires_in_days": 90
  }'
```

`project_ids` must contain 1–100 unique project IDs. `expires_in_days` can be from 1 to 365 and defaults to 90. To list identities without exposing token secrets:

```sh
curl --fail-with-body -sS "$TANGENT_URL/api/v1/agents" \
  -H "Authorization: Bearer $TANGENT_ADMIN_TOKEN"
```

## Discover projects and use the issue tools

Store the one-time token as `TANGENT_AGENT_TOKEN` in the agent runtime. Agents with `issues.read` can list the projects they are allowed to read, then use the returned project ID to list issues:

```sh
curl --fail-with-body -sS "$TANGENT_URL/api/v1/agent/projects" \
  -H "Authorization: Bearer $TANGENT_AGENT_TOKEN"
```

The response includes only active or paused projects granted to this agent, with each project's `id`, `name`, and `status`. Use that ID for the project-scoped issue list:

```sh
curl --fail-with-body -sS "$TANGENT_URL/api/v1/agent/projects/12/issues" \
  -H "Authorization: Bearer $TANGENT_AGENT_TOKEN"

curl --fail-with-body -sS "$TANGENT_URL/api/v1/agent/issues/345" \
  -H "Authorization: Bearer $TANGENT_AGENT_TOKEN"

curl --fail-with-body -sS -X POST "$TANGENT_URL/api/v1/agent/issues/345/discussion" \
  -H "Authorization: Bearer $TANGENT_AGENT_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"body":"Implementation is ready for review; the acceptance criteria are covered."}'

curl --fail-with-body -sS -X PATCH "$TANGENT_URL/api/v1/agent/issues/345/status" \
  -H "Authorization: Bearer $TANGENT_AGENT_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"status":"testing"}'
```

Replace the example IDs with IDs returned by Tangent. The issue detail response includes its prompt context, expected outcome, and acceptance criteria. A human should review work in `testing` and mark it `done` after verification.

## Optional MCP server

The separate stdio MCP adapter in [`tools/agent-mcp`](../tools/agent-mcp/README.md) exposes five agent operations as MCP tools: list accessible projects, list project issues, read an issue, post a progress comment, and set an issue to `doing` or `testing`. It requires Node.js 20 or later and does not add a dependency to Tangent's PHP web app. Install it where the MCP host runs; Tangent can remain on shared PHP hosting. No inbound MCP port is needed, but the MCP host must be able to reach Tangent's configured URL.

The MCP host launches the adapter with `TANGENT_URL` and `TANGENT_AGENT_TOKEN` in its environment. Set `TANGENT_WORKSPACE_ID` when the agent belongs to a non-default workspace. Keep the token in the host's local secret configuration; the adapter sends it only as a bearer token to the configured Tangent URL and never logs it. Tangent still enforces the agent's project and capability grants on every request.

## Rotate or revoke access

From **Workspace admin → Agents**, admins can rotate a token or revoke the identity. Rotation immediately invalidates the old token and shows the replacement secret once. Revocation requires confirmation and disables the identity and all its active tokens.

The API can also rotate an agent token, immediately invalidating its current active tokens and returning a new secret once:

```sh
curl --fail-with-body -sS -X POST "$TANGENT_URL/api/v1/agents/7/tokens" \
  -H "Authorization: Bearer $TANGENT_ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"expires_in_days":90}'
```

Revoke the identity and all its active tokens:

```sh
curl --fail-with-body -sS -X DELETE "$TANGENT_URL/api/v1/agents/7" \
  -H "Authorization: Bearer $TANGENT_ADMIN_TOKEN"
```

The REST endpoints are described in [the OpenAPI file](openapi.yaml). Tangent's web app remains a REST API; agent runtimes can call it directly or use the optional MCP adapter.
