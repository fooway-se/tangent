# Tangent

Chat, projects and issues in one place for developers working remotely. Keyboard-first, built for AI-assisted development, and simple to self-host on ordinary PHP + MySQL hosting.

> **Status: pre-alpha.** Auth, projects, and the initial project-chat slice are implemented; broader chat workflows and later spec phases remain planned.

## Why

Most teams spread work across a chat app, an issue tracker and a project board. This tool puts them together and removes the mouse from the daily loop:

- **Keyboard-first.** Change status, assign, create and navigate with shortcuts and a command palette (`Ctrl/Cmd+K`). No drag and drop.
- **Chat and issues are linked.** Turn any message into an issue (`/issue` or one keypress). The issue keeps its thread.
- **Made for AI-assisted work.** Issues work as specs. Copy an issue as a prompt for an agent. Agents are users with their own tokens and use the same API.
- **Client view.** Customers (guests) get a restricted view of progress, milestones and shared updates. They can comment on shared content and approve designated deliveries; internal work stays hidden.
- **Simple to host.** Upload files to shared hosting, run the install wizard. No Composer, no npm, no framework in production.

## Planned features

| Area | What |
|---|---|
| Chat | Standalone channels, DMs, chat-to-issue actions and broader chat workflows |
| Issues | Backlog / Todo / Doing / Done, quick-add syntax (`Fix login bug @niklas !high due:fri`), milestones, linked PRs |
| Inbox | Mentions, assignments, thread replies, status changes and PR events in one list |
| Guests | Restricted client view with progress, milestones, shared issues and updates; comments on shared content and approvals for designated deliveries |
| Integrations | GitHub via webhooks (GitLab later through the same interface) |
| API | REST under `/api/v1/`, opaque Bearer tokens, OpenAPI description |

See [`docs/SPEC.md`](docs/SPEC.md) for the full spec (Swedish) and phases.
The current API contract is in [`docs/openapi.yaml`](docs/openapi.yaml). Project chat supports threaded text messages and adaptive polling.

## Tech

- **Backend:** PHP >= 8.5.12, no framework, no runtime dependencies. PHPUnit for development only.
- **Database:** MySQL / MariaDB (`utf8mb4`, InnoDB).
- **Frontend:** plain HTML, CSS and TypeScript (ES modules). No React.
- **Realtime:** adaptive polling, with a swappable transport for WebSockets later.

Architecture and conventions: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Mockups

Dark "charcoal" theme, in [`docs/mockups/`](docs/mockups/): project view, command palette, issue detail, client view, inbox.

## Installation

Not available yet. The plan:

1. Download the release zip (PHP code and prebuilt JavaScript).
2. Upload it to your web host.
3. Open the install wizard. It checks PHP version and extensions, takes database details, runs migrations, creates the first admin and writes `config.php`.

Requirements: PHP >= 8.5.12 with `pdo_mysql`, `mbstring`, and `iconv`, plus a MySQL/MariaDB database.

## Development

Backend development and tests use Docker Compose with PHP 8.5.12 and a real MySQL database. PHPUnit is a development-only Composer dependency. See [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) for setup and TDD commands.

```sh
docker compose up -d --build
docker compose exec php composer install
docker compose exec php php bin/migrate.php
docker compose exec -it php php bin/seed-admin.php
docker compose exec php composer test
docker compose --profile frontend run --rm frontend ci --ignore-scripts
docker compose --profile frontend run --rm frontend run build
```

The TypeScript compiler is a development-only dependency. The build writes the browser module to `public/assets/app.js`.

## Contributing

Read [`AGENTS.md`](docs/AGENTS.md) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) first. They apply to people and AI agents alike: tests first, small classes that add behavior, every permission check through `can()`, every query scoped by `workspace_id`.

## License

[MIT](LICENSE)
