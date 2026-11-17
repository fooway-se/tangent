# Tangent

Tangent is a self-hosted workspace for planning and discussing software projects. It brings project chat, issue tracking, and a guest view for sharing progress with clients into one place.

## Who it’s for

Tangent is aimed at freelancers, small remote development teams, and studios or agencies coordinating client work. Team members manage issues and project conversations; invited client guests can see shared progress, comment, and approve requested work.

## Installation

Tangent is designed for a shared PHP and MySQL/MariaDB server. **A production release and shared-server installer are not ready yet**, so it cannot currently be installed for production use. The planned host requirements are PHP 8.5.12 or later with `pdo_mysql`, `mbstring`, `iconv`, and `intl`, plus Argon2id support.

To try the pre-alpha locally, use Docker Compose:

```sh
docker compose up -d --build
docker compose exec php php bin/migrate.php
docker compose exec -it php php bin/seed-admin.php
```

Open [http://localhost:8081](http://localhost:8081). The seed command prompts you to create a development admin account.

## Project status

Tangent is pre-alpha. Authentication, workspaces, project chat, issue tracking, inbox events, and the restricted client guest view are implemented. Remaining planned work is listed below.

## TODO

### Chat

- Add standalone channels and direct messages; decide whether group conversations are needed.
- Evaluate optional SSE or WebSocket updates for hosts that support persistent connections.

### Issues

- Add issue priorities and issue-level due dates, including quick-add syntax for both.
- Add dedicated discussion threads to issues.
- Consider structured context, expected outcomes, and acceptance criteria, with an option to copy or export an issue as a prompt or Markdown.
- Add milestone deletion to the interface; the API already supports it.

### GitHub and other integrations

- Link issues to pull requests and commits. Process GitHub webhooks for opened or merged pull requests and commits that reference issue keys, and show those events in the inbox.
- Generate a branch name from an issue.
- Add GitLab support through a provider-neutral integration interface.
- Decide whether GitHub authentication should use a personal access token or a GitHub App. Two-way issue and comment sync is deferred.

### Client updates

- Add an automatic weekly summary and a shareable project status link.

### AI and API

- Define agent identities, permissions, and any agent-specific issue statuses.
- Publish an OpenAPI description and consider a CLI or MCP server for agents.
- Choose how browser credentials are stored, balancing local storage against secure cookies and CSRF protection.

### Installation and hosting

- Create a production release archive and shared-server installation guide and wizard, including environment checks, database setup, migrations, and initial admin creation.
- Decide whether to support Docker as a production option and whether to offer Tangent as a hosted service.

## License

[Apache License 2.0](LICENSE)
