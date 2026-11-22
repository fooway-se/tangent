# Development

Local backend development and integration tests use Docker Compose. The default stack provides PHP 8.4.27 CLI and a real MySQL 8.4 test database. The same stack can be configured for PHP 8.5.12 or MariaDB 11.4. Production installation remains a PHP and MySQL or MariaDB upload for ordinary shared hosting; Composer is only used in the development container.

## Start the environment

```sh
docker compose up -d --build
docker compose exec php composer install
docker compose exec php php bin/migrate.php
docker compose exec -it php php bin/seed-admin.php
```

Composer installs PHPUnit from the `require-dev` section of `composer.json`. It does not add a runtime dependency to the release.
The seed command is enabled only when `TANGENT_ENV=development`; enter an admin name, email, and password when prompted. Then open [http://localhost:8080](http://localhost:8080) to sign in. The seed command is for local development; production setup creates the workspace and first admin through the installer, which also saves the public site URL and sender email address in the private config.
If port 8080 is already in use, start the stack with `TANGENT_HTTP_PORT=8081 docker compose up -d --build` and open [http://localhost:8081](http://localhost:8081).

To sign in from a phone on the same network, set `TANGENT_APP_URL` to the development machine’s LAN address and use that exact URL on the phone. For example, replace `192.168.1.50` with the machine’s address and run:

```sh
TANGENT_APP_URL=http://192.168.1.50:8081 docker compose up -d --build
```

The default development URL is `localhost`, which refers to the phone itself when opened there.

To test the PHP 8.5 baseline, rebuild and run the suite with:

```sh
TANGENT_PHP_VERSION=8.5.12 docker compose up -d --build
docker compose exec php composer install
docker compose exec php composer test
```

To run the database integration suite on MariaDB 11.4 instead of MySQL, use a separate volume so the engines never share database files:

```sh
export TANGENT_DB_IMAGE=mariadb
export TANGENT_DB_VERSION=11.4
export TANGENT_DB_VOLUME=mariadb_data
docker compose up -d --build
docker compose exec php composer test
```

Unset those three variables and run `docker compose up -d --build` to switch back to MySQL 8.4. MariaDB 11.4 is an LTS series maintained through May 2029.

Migration 011 stops before applying if one normalized email belongs to multiple legacy accounts. Reconcile those accounts explicitly before retrying; the migration will not silently combine their credentials.

## Workspace invites and password resets

Workspace admins create developer or guest invites from **Workspace admin**. A guest invite must select at least one active project. Tangent emails a random single-use link to the invited address; it expires after seven days and is never returned to the admin or shown in pending invite lists. Only the SHA-256 token hash is stored for new invites. New global accounts choose a password after opening the emailed link, which verifies access to the invited mailbox. Existing accounts must enter their current password before Tangent links the membership. Admins can resend an invite, which invalidates the previous link, or revoke it. Pending invites created before this email flow may still require their emailed verification code.

Tangent has no self-service **Forgot password?** form. After the login attempt limit is reached, the sign-in screen tells the user to contact a workspace admin. An admin can request a one-use, one-hour password reset email from the member list; the reset URL is sent directly to the account email and is never returned to the admin. Completing the reset revokes every active session and API token for the account across workspaces, so a reset also cuts off integrations using that account's tokens.

Configure these values in the host environment or in `config.php` for production:

| Environment variable | `config.php` key | Purpose | Default |
|---|---|---|---|
| `TANGENT_APP_URL` | `app_url` | Public base URL used to build invite links and emailed password recovery links; set this to the exact HTTPS site address. | `http://localhost:8080` |
| `TANGENT_MAIL_FROM` | `mail_from` | Sender address used for workspace invitations and password recovery email. The installer saves it in `config.php`; this environment variable overrides that value. | unset |
| `TANGENT_HIBP_ENABLED` | `hibp_enabled` | Enables the optional Have I Been Pwned Pwned Passwords range lookup. | `false` |
| `TANGENT_GITHUB_APP_ID` | — | Numeric GitHub App ID for repository selection and pull-request tracking. | unset |
| `TANGENT_GITHUB_APP_SLUG` | — | GitHub App URL slug. | unset |
| `TANGENT_GITHUB_PRIVATE_KEY` | — | GitHub App PEM private key; environment values may use `\n` for newlines. | unset |
| `TANGENT_GITHUB_OAUTH_CLIENT_ID` | `github_oauth_client_id` | OAuth client ID for the GitHub App user authorization step. | unset |
| `TANGENT_GITHUB_OAUTH_CLIENT_SECRET` | `github_oauth_client_secret` | OAuth client secret for the GitHub App user authorization step. | unset |
| `TANGENT_GITHUB_WEBHOOK_SECRET` | — | Secret used to verify GitHub webhook signatures. | unset |

Tangent sends plain-text invitation and recovery email through PHP's configured mail transport. Invites fail closed when delivery is unavailable, and no usable invite link is issued. Existing-account invite acceptance still requires the account password. The optional breach lookup sends only the first five hexadecimal characters of the password's SHA-1 hash to the service, verifies the full hash against the returned suffix list, and fails open when the network check is unavailable. Leave it disabled on hosts without outbound HTTPS access.

Configure the GitHub App's Setup URL as `{TANGENT_APP_URL}/api/v1/github/setup` and its OAuth callback URL as `{TANGENT_APP_URL}/api/v1/github/setup/authorize`. Use the App's OAuth client ID and secret for the OAuth settings above; the user who starts setup must remain signed into the same Tangent browser session and must be able to manage the selected GitHub installation.

Passwords are NFC-normalized and checked by one shared policy for seed, direct API account creation, invite acceptance, and reset: 15–128 Unicode code points, all characters allowed, no silent truncation, common-password and contextual checks, Argon2id hashing, and hash upgrades at login. This follows the password guidance in [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html): 15 characters for single-factor passwords, blocklist checks, Unicode code-point counting, and no composition rules. Paste and password-manager autofill are supported; scheduled password rotations are not used. The bundled common-password blocklist and its license attribution are in `resources/`.

Login attempts are limited to five per email and source address, plus 100 attempts per source address in 15 minutes. Expired rate-limit buckets are pruned after one day.

When enabled, the HIBP integration uses the [Pwned Passwords range API](https://haveibeenpwned.com/API/v3): it hashes locally with SHA-1, sends only the first five hex characters, then compares the returned suffixes locally.

For the TypeScript UI, install the development compiler and build the browser module using the optional Node container:

```sh
docker compose --profile frontend run --rm frontend ci --ignore-scripts
docker compose --profile frontend run --rm frontend run build
```

See [GitHub pull-request tracking](GITHUB.md) for GitHub App permissions and setup.

## Test-driven development

Write a failing test before implementing behavior, then make the smallest change that passes it and run the full suite:

```sh
docker compose exec php composer test
```

Tests use the MySQL or MariaDB service configured by Compose. The test database connection is provided through `TANGENT_TEST_DB_HOST`, `TANGENT_TEST_DB_PORT`, `TANGENT_TEST_DB_NAME`, `TANGENT_TEST_DB_USER`, and `TANGENT_TEST_DB_PASSWORD`. Tests must not mock database access; migrations run in setup and each test rolls back its transaction.

Open a shell in the PHP container with:

```sh
docker compose exec php sh
```

Stop the containers with `docker compose down`. Remove the test database volume as well with `docker compose down --volumes`.
