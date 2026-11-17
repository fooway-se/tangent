# Tangent

Chat, projects and issues in one place for developers working remotely. Keep client work in separate workspaces, switch between them from the sidebar, and self-host on ordinary PHP + MySQL hosting.

> **Status: pre-alpha.** Auth, multiple client workspaces with switching, projects, project chat, issue creation/status/chat conversion, issue detail editing, and keyboard navigation are implemented; broader chat and issue workflows remain planned.

## Why

Most teams spread work across a chat app, an issue tracker and a project board. This tool puts them together and removes the mouse from the daily loop:

- **Keyboard-first workflow.** Use `g` then `w` to choose a workspace; press `Enter` to switch or `Esc` to cancel. Use `g` then `i`/`c`/`m` to switch project features, `↑`/`↓` or `j`/`k` to move through lists or chat messages, and `r`/`i` for chat replies and issue conversion. `Enter` opens a selected project or issue, submits forms, and sends chat messages; `Shift+Enter` inserts a newline in chat or description fields. `Esc` first leaves text fields with text intact, cancels staged workspace changes or drafts, and backs through views; Projects is the root. Press `Ctrl/Cmd+K` for commands or `?` for the full shortcut map.
- **Chat and issues are connected.** Create a Backlog issue from a chat message; the message thread stays linked as context.
- **Made for AI-assisted work.** Issue prompt export and agent tokens use the same API; those workflows are planned.
- **Client view (planned).** Guests will see shared progress and updates; internal work stays hidden.
- **Simple to host (planned).** The install wizard is not implemented yet. Production will need no Composer, npm, or framework.

## Planned features

| Area | What |
|---|---|
| Chat | Standalone channels, DMs and broader chat workflows |
| Issues | Quick-add syntax (`Fix login bug @niklas !high due:fri`), assignment, priorities, milestones and linked PRs |
| Inbox | Mentions, assignments, thread replies, status changes and PR events in one list |
| Guests | Restricted client view with progress, milestones, shared issues and updates; comments on shared content and approvals for designated deliveries |
| Integrations | GitHub via webhooks (GitLab later through the same interface) |
| API | REST under `/api/v1/`, opaque Bearer tokens, OpenAPI description |

See [`docs/SPEC.md`](docs/SPEC.md) for the full spec (Swedish) and phases.
The current API contract is in [`docs/openapi.yaml`](docs/openapi.yaml). Project issues support create, list, status updates and creation from chat; project chat supports threaded text messages and adaptive polling.

## Tech

- **Backend:** PHP >= 8.5.12, no framework, no runtime dependencies. PHPUnit for development only.
- **Database:** MySQL / MariaDB (`utf8mb4`, InnoDB).
- **Frontend:** plain HTML, CSS and TypeScript (ES modules). No React.
- **Realtime:** adaptive polling, with a swappable transport for WebSockets later.

Architecture and conventions: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Mockups

The current UI direction pairs warm sand-colored navigation and page surfaces with dark ink work panels and orange accents. The references cover sign-in, project list and work views, issue detail, members, keyboard overlays, administration, and a narrow mobile project view. See the [mockup guide in the spec](docs/SPEC.md#ui-referenser) for the screen index. Guest and inbox mockups are not in this set yet; their planned scope is still described in the spec.

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
