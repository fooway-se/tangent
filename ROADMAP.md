# Roadmap

Planned work, in no fixed order. Tangent is pre-alpha, so this list will change. See the [README](README.md) for what already works.

## Chat

- Add standalone channels and direct messages; decide whether group conversations are needed.
- Evaluate optional SSE or WebSocket updates for hosts that support persistent connections.

## Issues

- Add issue priorities and issue-level due dates, including quick-add syntax for both.
- Add dedicated discussion threads to issues.
- Consider structured context, expected outcomes and acceptance criteria, with an option to copy or export an issue as a prompt or Markdown.
- Add milestone deletion to the interface; the API already supports it.

## GitHub and other integrations

- Link issues to pull requests and commits. Process GitHub webhooks for opened or merged pull requests and commits that reference issue keys, and show those events in the inbox.
- Generate a branch name from an issue.
- Add GitLab support through a provider-neutral integration interface.
- Decide whether GitHub authentication should use a personal access token or a GitHub App. Two-way issue and comment sync is deferred.

## Client updates

- Add an automatic weekly summary and a shareable project status link.

## AI and API

- Define agent identities, permissions and any agent-specific issue statuses.
- Consider a CLI or MCP server for agents. The REST API is described in [docs/openapi.yaml](docs/openapi.yaml).
- Choose how browser credentials are stored, balancing local storage against secure cookies and CSRF protection.

## Installation and hosting

- Test the installer, upgrade flow and release archive on common shared-host providers, then publish versioned downloads.
- Decide whether to support Docker as a production option and whether to offer Tangent as a hosted service.
