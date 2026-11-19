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
The seed command is enabled only when `TANGENT_ENV=development`; enter an admin name, email, and password when prompted. Then open [http://localhost:8080](http://localhost:8080) to sign in. The first admin seed is for local development; production account bootstrap will be part of the later installer.
If port 8080 is already in use, start the stack with `TANGENT_HTTP_PORT=8081 docker compose up -d --build` and open [http://localhost:8081](http://localhost:8081).

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

Workspace admins create developer or guest invites from **Workspace admin**. A guest invite must select at least one active project. Tangent generates a random one-use link that expires after seven days and displays it once so the admin can copy and send it manually. Only the SHA-256 token hash is stored; pending invite lists never expose links. Admins can generate a replacement link, which invalidates the previous one, or revoke the invite. New accounts choose a password from the link. If the email already belongs to an account in another workspace, accepting the invite adds a membership to that account and leaves its password unchanged.

Tangent has no self-service **Forgot password?** form or mail delivery. The sign-in screen tells the user to contact a workspace admin only after the login attempt limit is reached. An admin can generate a one-use, one-hour password reset link from the member list, then copy and send it manually. Completing the reset revokes the account's active sessions across workspaces.

Configure these values in the host environment or in `config.php` for production:

| Environment variable | `config.php` key | Purpose | Default |
|---|---|---|---|
| `TANGENT_APP_URL` | `app_url` | Public base URL used to build copyable invite and reset links; set this to the exact HTTPS site address. | `http://localhost:8080` |
| `TANGENT_HIBP_ENABLED` | `hibp_enabled` | Enables the optional Have I Been Pwned Pwned Passwords range lookup. | `false` |
| `TANGENT_GITHUB_APP_ID` | — | Numeric GitHub App ID for repository selection and pull-request tracking. | unset |
| `TANGENT_GITHUB_APP_SLUG` | — | GitHub App URL slug. | unset |
| `TANGENT_GITHUB_PRIVATE_KEY` | — | GitHub App PEM private key; environment values may use `\n` for newlines. | unset |
| `TANGENT_GITHUB_WEBHOOK_SECRET` | — | Secret used to verify GitHub webhook signatures. | unset |

Tangent does not send email. Admins copy and manually deliver invite and reset links. The optional breach lookup sends only the first five hexadecimal characters of the password's SHA-1 hash to the service, verifies the full hash against the returned suffix list, and fails open when the network check is unavailable. Leave it disabled on hosts without outbound HTTPS access.

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
