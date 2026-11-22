# Installing Tangent on shared hosting

Tangent is designed to support different shared-hosting directory layouts. Its public files and private application files can live in separate locations. The installer also stores the public URL independently, so the URL path does not have to match a server filesystem path.

Tangent requires PHP 8.4.27 or later within PHP 8, with `pdo_mysql`, `mbstring`, `iconv`, and `intl`, Argon2id password hashing, and an empty MySQL or MariaDB database. PHP 8.5.0 through 8.5.11 and PHP 9 are not supported; use PHP 8.5.12 or later on that branch. Enable HTTPS for the site before installation.

## First installation

1. Build the release archive with `php bin/build-release.php`. The build machine needs the PHP `zip` extension. The archive contains the prebuilt browser assets and does not require Composer or npm on the server.
2. Put the archive's `tangent-app/` files in a private directory outside the public web root. Put the contents of `public_html/` in the directory that should serve Tangent. These locations can be anywhere your hosting account permits. Tangent detects a few conventional sibling layouts. For any other layout, create a file named `.tangent-app-root` in the Tangent public directory. Its only content should be the absolute server filesystem path to the private directory containing `bootstrap.php`, `src/`, and `migrations/`.
3. For example, if your files are physically deployed as `/fooway/tangent/` and `/tangent-backend/`, place the public files in `/fooway/tangent/`, place the private application files in `/tangent-backend/`, and set `/fooway/tangent/.tangent-app-root` to the actual absolute path of `/tangent-backend/`. On hosting accounts that prefix paths with a username, use that full path instead (for example, `/home/account/tangent-backend`). Keep the private application directory outside the public web root.
4. Create an empty database and database user in your hosting control panel. Grant that user access to the database.
5. Generate a 64-character setup key on your own computer with `openssl rand -hex 32`. Create `.install-key` inside the private application directory and put only the key in the file. Keep the key available for the setup form. Do not put it in the public directory.
6. Visit the public URL for Tangent, such as `https://fooway.se/tangent/install.php`. Enter that URL's base (`https://fooway.se/tangent` in this example), the setup key, database settings, workspace details, and first admin credentials. The public URL is a web address; it is separate from the filesystem paths above. Tangent checks the server, runs the migrations, creates the workspace and admin, and writes `config.php` in the private application directory with private file permissions. It removes the setup key after success.
7. Sign in. The installer cannot be used again after `config.php` has been created.

Use a dedicated database. If setup is interrupted after migrations begin, correct the reported issue and retry with the same key and database. The migration runner reconciles existing add-column, add-index, and add-constraint steps so covered partial migrations can resume. If the failed step left an incompatible schema object, restore a known-good database backup before retrying. Do not edit migration records manually.

## Updating an installation

1. Back up the database and application files.
2. Upload the new release's private application files to the existing private application directory and replace the public files in the existing public directory. Preserve the private `config.php` and `.tangent-app-root` file.
3. Generate a new key with `openssl rand -hex 32` and put it in `.upgrade-key` inside the private application directory.
4. Visit the same public URL with `/upgrade.php`, such as `https://fooway.se/tangent/upgrade.php`, enter the key, confirm the backup, and apply migrations. Tangent runs only migrations not recorded as complete and removes the key after success.

If an upgrade fails, keep the key in place, check the server error log, and restore the database backup if necessary before retrying.
