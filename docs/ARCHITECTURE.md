# Architecture and conventions

This document is for contributors and AI agents. Follow it unless there is a good reason not to, and then update this file in the same change.

## Hard constraints (and why)

- **PHP 8.4.27 or later within PHP 8, with PHP 8.5.0 through 8.5.11 excluded; no framework or runtime dependencies.** The tool must install on a plain PHP + MySQL or MariaDB webhost by uploading files. No Composer in production. PHPUnit is a dev-only dependency.
- **The backend is a REST API only.** It serves JSON, never HTML.
- **Frontend is plain HTML, CSS and TypeScript** (ES modules). No React or other framework. `tsc` is a dev tool; the release ships compiled JavaScript.
- **Authentication uses opaque tokens.** API and session tokens, invite links, and password-reset links are generated with `random_bytes`; only hashes are stored. Browser credential tokens are carried in the URL fragment, then sent in request bodies. Passwords are account-level credentials in `user_accounts`, normalized to NFC and hashed with Argon2id. A single policy covers seed, direct API creation, invite acceptance, and reset. Login upgrades older password hashes.
- **Realtime is adaptive polling** against a small, cheap endpoint (`GET /api/v1/events?since=<id>`). The client uses one transport interface, so WebSockets can be added later as an optional extra.
- **Project chat presence is a separate heartbeat.** While the project page is visible, the client posts to `POST /api/v1/projects/{id}/presence` every 15 seconds. The server checks normal chat access and returns only whether a different user has checked in within 45 seconds; it never returns names or counts. Presence expires after 45 seconds, and rows older than a day are cleaned on the next heartbeat for that project.
- **Issue lists use conditional polling** while a project issue view is open. `ETag`/`If-None-Match` avoids resending unchanged active and deleted issue collections; the frontend retains unchanged row elements and defers remote changes while issue controls are being edited.
- **Open source and self-hostable.** Prefer simple over clever.

## Structure

```
public/index.php            builds Request, hands it to the gateway
src/Core/                   Request, Response, Router, Database, Gateway
src/Modules/Auth/           routes, handlers, repository, rules
src/Modules/Workspaces/     workspace membership, creation and switching
src/Modules/Projects/
src/Modules/Chat/
src/Modules/Issues/
src/Modules/Inbox/
src/Modules/Integrations/   GitHub webhooks, later GitLab
migrations/                 numbered SQL files
tests/                      mirrors src/
```

## Request flow

1. `public/index.php` creates a `Request` from the PHP superglobals. This is the only place they are read.
2. The gateway matches the route, runs middleware (token auth, rate limiting, error formatting) and calls the module's handler.
3. The handler returns a `Response`.

Each module registers its own routes. Modules do not touch each other's tables; they call each other's public classes.

## Class design

- Keep classes small and clear: `Database`, `Request`, `Router`, `Response`.
- **A class must add behavior, or have a second implementation that is actually planned.** No thin wrappers or adapter classes that only forward calls.
- Do not add a service layer that only forwards to a repository. Simple CRUD handlers may call the repository directly. Add a service where there is logic: permissions, status transitions, creating an issue from a message.
- Use an interface only where a second implementation is expected (for example GitHub and GitLab).
- `Request` and `Response` are plain value objects.
- The only small class allowed purely for testability is `Clock`.

## Rules that always apply

- Every tenant-data query is scoped by `workspace_id`. The workspace membership directory may span workspaces, but must be scoped to the authenticated `account_id` and return only memberships for that account.
- Use prepared statements only.
- Never use `innerHTML` with user data. Use `textContent` or escape.
- All permission checks go through `can(user, action, resource)`.
- Guest visibility is filtered in the API, never in the client.
- Strict Content-Security-Policy, no inline scripts.

## API conventions

- Resource-oriented, versioned under `/api/v1/`.
- Use sensible action endpoints where something is not a pure resource, for example `PATCH /issues/{id}` for issue field changes, `DELETE /issues/{id}` plus `POST /issues/{id}/restore` for recoverable deletion, and `POST /messages/{id}/issue` to create an issue from a message.
- The polling endpoint supports `ETag` and `304` so empty polls are almost free.
- Browser sessions use the `tangent_workspace` cookie to select the active workspace. Bearer tokens are workspace-scoped; non-default workspaces use the `X-Tangent-Workspace` header.
- Workspace admins generate one-use invite and password-reset links to copy and send manually; Tangent has no mail integration. Invite acceptance creates or links the global account, workspace membership, guest project access, and session in one transaction. Admin-generated password reset links use the same typed, one-use credential-token table and revoke sessions after a successful reset.
- Cursor-based pagination.
- One consistent JSON error format.
- OpenAPI is the contract.

## Database and migrations

- MySQL or MariaDB, `utf8mb4`, InnoDB.
- Migrations are numbered SQL files in `migrations/`, with a table that records which have run. The installer and later upgrades use the same mechanism.

## Inbox events and guest visibility

- Inbox events are recipient-scoped records. Producers write them in the same database transaction as the message, assignment, status change, client comment, or approval that caused them.
- Event recipients are filtered at creation to active project members and active admins; the actor never receives their own event. Reads are filtered again by recipient, workspace, and current project visibility. Leaving a project hides its old events.
- Guest permissions use an allowlist: a project member guest can read the client view, write a client comment, and approve a requested shared issue. All internal actions remain denied, including workspace, member, issue, chat, token, and inbox access.
- Guest project lists return only the member's projects and only `id`, `name`, and `slug`. All client-view queries filter `is_shared = 1`, `deleted_at IS NULL`, and exclude cancelled issues before calculating progress, approvals, milestones, or updates.
- Issues and messages default to internal (`is_shared = 0`, `is_client_visible = 0`). Guest comments are stored in the existing project channel with `is_client_visible = 1`; replies in a thread started by a guest-visible message are also visible in the client view. Guests still cannot read project chat endpoints or unrelated project messages.
- `issue_status_history` records each real status transition. The client timeline and seven-day completion count must use this table because an issue's `updated_at` also changes for title or description edits. The history starts with transitions made after migration 009; past status-change times cannot be reconstructed from `updated_at`.
- Milestone references use a composite `(workspace_id, milestone_id)` foreign key with its default restrict behavior. Deleting a milestone clears matching issue references and deletes the milestone in one transaction; `ON DELETE SET NULL` would also try to null the non-null workspace key.

## Testing (TDD)

- Write the failing test first, then the code.
- **Do not mock the database.** Tests run against a real MySQL test database. Migrations run in setup and each test is rolled back in a transaction.
- **Test the API without HTTP:** build a `Request`, pass it through the gateway, assert on the `Response`.
- Pure logic (router, `can()`, quick-add parser, status transitions) gets plain unit tests.
- Permission and guest-visibility tests are mandatory.
- Frontend tests: use Node's built-in test runner on compiled TypeScript, to avoid new dependencies (to be confirmed).

## Working method

- Build one vertical slice first (auth + projects, from migration to simple UI). It becomes the template for everything else.
- Fix problems in the template or in this file, not repeatedly in later code.
- Run the full test suite before finishing a change.
