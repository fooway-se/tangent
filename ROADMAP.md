# Roadmap

Planned work, in no fixed order. Tangent is actively developed, so this list will change. See the [README](README.md) for implemented features and current project status.

## Chat

The project chat header has a privacy-preserving presence light: it shows whether another authorized viewer has an active heartbeat, without exposing their identity or a viewer count. Heartbeats run while the project page is visible and expire after 45 seconds. The workspace-wide **Lounge** is available for internal off-topic conversation, separate from project chats. No DMs or user-created channels are planned.

- Evaluate optional SSE or WebSocket updates for hosts that support persistent connections.

## GitHub and other integrations

- Add GitLab support through a provider-neutral integration interface.
- Expand the GitHub App integration beyond manual pull-request links. Two-way issue and comment sync is deferred.

## AI and API

- Named agents now have expiring tokens, project grants, three issue capabilities, and dedicated read, discussion, and status endpoints. Agents use the existing `doing` and `testing` statuses; human review remains the completion step. See [coding agent access](docs/AGENTS.md).
- Consider an optional CLI or MCP adapter for the agent endpoints. The REST API is described in [docs/openapi.yaml](docs/openapi.yaml).
- Choose how browser credentials are stored, balancing local storage against secure cookies and CSRF protection.

## Installation and hosting

- Test the release archive and verify the installer and upgrade flow on additional common shared-host providers and layouts before publishing supported stable downloads. The `v0.1.0-beta.1` tag is a pre-release snapshot; installation and repeated upgrades have already succeeded on one shared server.
- Decide whether to support Docker as a production option and whether to offer Tangent as a hosted service.
