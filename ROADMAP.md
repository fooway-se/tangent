# Roadmap

Planned work, in no fixed order. Tangent is in limited alpha, so this list will change. See the [README](README.md) for what already works.

## Chat

The project chat header has a privacy-preserving presence light: it shows whether another authorized viewer has an active heartbeat, without exposing their identity or a viewer count. Heartbeats run while the project page is visible and expire after 45 seconds. The workspace-wide **Lounge** is available for internal off-topic conversation, separate from project chats. No DMs or user-created channels are planned.

- Evaluate optional SSE or WebSocket updates for hosts that support persistent connections.

## GitHub and other integrations

- Link commits to issues and show commit activity in the inbox.
- Generate a branch name from an issue.
- Add GitLab support through a provider-neutral integration interface.
- Expand the GitHub App integration beyond manual pull-request links. Two-way issue and comment sync is deferred.

## Client updates

- Let admins generate and copy a client-safe project summary.

## AI and API

- Define agent identities, permissions and any agent-specific issue statuses.
- Consider a CLI or MCP server for agents. The REST API is described in [docs/openapi.yaml](docs/openapi.yaml).
- Choose how browser credentials are stored, balancing local storage against secure cookies and CSRF protection.

## Installation and hosting

- Test the release archive and verify the installer and upgrade flow on additional common shared-host providers and layouts, then publish versioned downloads. Install and repeated upgrades have already succeeded on one shared server.
- Decide whether to support Docker as a production option and whether to offer Tangent as a hosted service.
