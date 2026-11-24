# GitHub pull-request tracking

Tangent can optionally connect one GitHub repository to a project. When a pull request is opened from a Tangent issue branch, Tangent links it to that issue automatically. Internal admins and developers can also manually link pull requests from other branches, see their current state, and receive inbox events when a linked pull request opens, closes, merges, or changes review readiness. They can copy a branch name from an issue; pushes to that branch are attached to the issue and create one grouped inbox event. The issue shows up to 50 recent commits per issue and the 20 most recently updated check runs per linked pull request. Check runs appear as links with their current status or conclusion. Linking a pull request does not change the Tangent issue status. Guests cannot see GitHub repository, pull-request, commit, or check-run data.

## Create a GitHub App

Create a GitHub App for your Tangent installation and configure:

- **Homepage URL:** your Tangent base URL, for example `https://tangent.example`.
- **Setup URL:** `{TANGENT_APP_URL}/api/v1/github/setup`, for example `https://tangent.example/api/v1/github/setup`.
- **Callback URL:** `{TANGENT_APP_URL}/api/v1/github/setup/authorize`.
- **Webhook URL:** `{TANGENT_APP_URL}/api/v1/github/webhook`.
- **Webhook secret:** generate a long random secret and keep it for the Tangent environment setting below.
- **Repository permissions:** `Metadata: Read-only`, `Pull requests: Read-only`, and `Checks: Read-only`. To enable commit tracking, also grant `Contents: Read-only`.
- **Subscribe to events:** `Pull request` and `Check run`; add `Push` to enable commit tracking.

Generate a private key for the app. Note the app's numeric ID and URL slug from its settings. Install the app on the GitHub account or organization that owns the repository, granting access only to repositories Tangent should offer for project selection.

## Configure Tangent

Set these values in the PHP process environment. In Docker Compose, they can be supplied in the shell or a local `.env` file before starting the PHP service. Environment variables take precedence over `config.php`. On shared hosting without environment-variable controls, add the listed keys to the private `config.php` returned array. The installer keeps this file alongside `bootstrap.php` and `src/`, outside the public web directory.

| Environment variable | `config.php` key | Value |
|---|---|---|
| `TANGENT_GITHUB_APP_ID` | `github_app_id` | The GitHub App's numeric ID. |
| `TANGENT_GITHUB_APP_SLUG` | `github_app_slug` | The GitHub App URL slug used in `github.com/apps/{slug}`. |
| `TANGENT_GITHUB_PRIVATE_KEY` | `github_private_key` | The complete PEM private key. For an environment variable or a single-quoted PHP string, encode line breaks as `\n`; Tangent converts those to newlines. |
| `TANGENT_GITHUB_OAUTH_CLIENT_ID` | `github_oauth_client_id` | The GitHub App OAuth client ID. |
| `TANGENT_GITHUB_OAUTH_CLIENT_SECRET` | `github_oauth_client_secret` | The GitHub App OAuth client secret. |
| `TANGENT_GITHUB_WEBHOOK_SECRET` | `github_webhook_secret` | The same secret configured in GitHub App settings. |

When entering the PEM in `config.php`, keep it private and preserve the full `BEGIN` and `END` lines. For example, encode its line breaks as `\n` in a single-quoted PHP string. Do not replace the rest of the installer-generated config array. Restart the PHP service after changing its environment; file-based config is read on the next request, though host OPcache settings may delay changes.

### Limit repositories by workspace

By default, every repository granted to the GitHub App installation is available in every Tangent workspace connected to that installation. To show different repositories to different workspaces, add an optional `github_repository_allowlist` entry to the private `config.php`. Map each Tangent workspace slug to the canonical GitHub `owner/repository` names it may use:

```php
'github_repository_allowlist' => [
    'team-alpha' => ['fooway-se/myfi'],
    'team-beta' => ['fooway-se/allmeter'],
],
```

Replace the example slugs with the workspace slugs from Tangent. When this setting exists, a missing workspace entry allows no repositories. The allowlist filters the repository picker, rejects attempts to attach another repository, and hides existing repository, pull-request, commit, and webhook updates for repositories outside that workspace's list. The GitHub App installation still needs access to each listed repository.

The GitHub App credentials are configured once for the Tangent installation. A workspace admin starts the connection from a project's create or edit form, installs or selects the existing App installation, then authorizes their GitHub account in the same browser session. One GitHub installation can be connected to multiple Tangent workspaces; each workspace stores its own association and projects choose repositories from that installation. Pull-request and check-run updates are applied to every matching linked PR in the relevant workspaces, while issues, inbox events, and repository settings remain workspace-scoped. Project developers can link and unlink pull requests on issues after a repository is selected.

The webhook endpoint is public and verifies every request against the raw body using `X-Hub-Signature-256`. GitHub delivery IDs are stored for 30 days to ignore retries. Automatic pull-request linking and commit tracking use the branch name `tangent/issue-{id}-{title-slug}`, as provided by **Copy branch name** on the issue. Pull requests are linked when GitHub reports them as opened; Tangent does not change the issue status. Check-run tracking requires the Checks read permission and the Check run event subscription. Tangent stores check runs GitHub associates with linked pull requests and shows the 20 most recently updated runs per linked pull request. Runs delivered before a pull request is linked are not backfilled; they appear after GitHub sends a later check-run event. Commit tracking is opt-in through the connected repository: the App needs read-only Contents access and the Push event subscription. Tangent links commits only when a push targets the matching issue branch. It keeps commit history and shows the 50 most recent commits per issue, and sends one inbox event for each push that adds commits. If an issue is unlinked from a pull request, its associated check runs are deleted and later webhook events no longer update it.
