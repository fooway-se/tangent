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

Set these variables in the PHP process environment. In Docker Compose, they can be supplied in the shell or a local `.env` file before starting the PHP service.

| Variable | Value |
|---|---|
| `TANGENT_GITHUB_APP_ID` | The GitHub App's numeric ID. |
| `TANGENT_GITHUB_APP_SLUG` | The GitHub App URL slug used in `github.com/apps/{slug}`. |
| `TANGENT_GITHUB_PRIVATE_KEY` | The complete PEM private key. For an environment variable, encode line breaks as `\n`; Tangent converts those to newlines. |
| `TANGENT_GITHUB_OAUTH_CLIENT_ID` | The GitHub App OAuth client ID. |
| `TANGENT_GITHUB_OAUTH_CLIENT_SECRET` | The GitHub App OAuth client secret. |
| `TANGENT_GITHUB_WEBHOOK_SECRET` | The same secret configured in GitHub App settings. |

Restart the PHP service after changing its environment. GitHub connection is workspace-scoped: a workspace admin starts the connection from a project's create or edit form, installs the App, then authorizes their GitHub account. Tangent binds both callbacks to the same browser session and associates the installation only if the authorized GitHub user can access it. Project developers can link and unlink pull requests on issues after a repository is selected.

The webhook endpoint is public and verifies every request against the raw body using `X-Hub-Signature-256`. GitHub delivery IDs are stored for 30 days to ignore retries. Automatic pull-request linking and commit tracking use the branch name `tangent/issue-{id}-{title-slug}`, as provided by **Copy branch name** on the issue. Pull requests are linked when GitHub reports them as opened; Tangent does not change the issue status. Check-run tracking requires the Checks read permission and the Check run event subscription. Tangent stores check runs GitHub associates with linked pull requests and shows the 20 most recently updated runs per linked pull request. Runs delivered before a pull request is linked are not backfilled; they appear after GitHub sends a later check-run event. Commit tracking is opt-in through the connected repository: the App needs read-only Contents access and the Push event subscription. Tangent links commits only when a push targets the matching issue branch. It keeps commit history and shows the 50 most recent commits per issue, and sends one inbox event for each push that adds commits. If an issue is unlinked from a pull request, its associated check runs are deleted and later webhook events no longer update it.
