<?php

declare(strict_types=1);

use Tangent\Core\AppBasePath;
use Tangent\Core\Runtime;
use Tangent\Modules\Installer\InstallRequirements;
use Tangent\Modules\Installer\InstallService;
use Tangent\Modules\Installer\PdoInstallDatabase;

$appRoot = require __DIR__ . '/app-root.php';
require $appRoot . '/bootstrap.php';

header('Content-Security-Policy: default-src \'none\'; style-src \'self\'; form-action \'self\'; base-uri \'none\'; frame-ancestors \'none\'');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('Cache-Control: no-store');

$host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
$isLocalhost = in_array(preg_replace('/:\\d+$/', '', $host), ['localhost', '127.0.0.1', '[::1]'], true);
$requestIsHttps = (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off')
    || strtolower((string) ($_SERVER['REQUEST_SCHEME'] ?? '')) === 'https';
$secureRequest = $requestIsHttps || $isLocalhost;
$scriptName = $_SERVER['SCRIPT_NAME'] ?? '';
$scriptPath = is_string($scriptName) ? parse_url($scriptName, PHP_URL_PATH) : null;
$basePath = is_string($scriptPath) && $scriptPath !== ''
    ? AppBasePath::fromScriptName($scriptName)
    : AppBasePath::fromFilesystemPaths(__DIR__, $_SERVER['DOCUMENT_ROOT'] ?? '');
if ($basePath === '' && (!is_string($scriptPath) || $scriptPath === '')) {
    $basePath = AppBasePath::fromScriptName($_SERVER['SCRIPT_NAME'] ?? '');
}
$appHost = is_string($_SERVER['HTTP_HOST'] ?? null) ? $_SERVER['HTTP_HOST'] : '';
$defaultScheme = $requestIsHttps ? 'https://' : 'http://';
$defaultAppUrl = filter_var($defaultScheme . $appHost, FILTER_VALIDATE_URL)
    ? $defaultScheme . $appHost . $basePath
    : '';

ini_set('session.use_strict_mode', '1');
session_name('tangent_installer');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => AppBasePath::csrfCookiePath($basePath),
    'secure' => $requestIsHttps,
    'httponly' => true,
    'samesite' => 'Strict',
]);
session_start();

if (!isset($_SESSION['installer_csrf']) || !is_string($_SESSION['installer_csrf'])) {
    $_SESSION['installer_csrf'] = bin2hex(random_bytes(32));
}
$csrf = $_SESSION['installer_csrf'];
$errors = [];
$requirements = InstallRequirements::check();
$configPath = Runtime::configPath();
$keyPath = $appRoot . '/.install-key';
$isConfigured = Runtime::isConfigured() || file_exists($configPath);

if ($isConfigured) {
    http_response_code(409);
    $errors[] = 'Tangent is already configured. Use the upgrade page to apply a release update.';
} elseif (!$secureRequest) {
    $errors[] = 'Open this page over HTTPS before entering setup credentials.';
} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $submittedCsrf = $_POST['csrf_token'] ?? '';
    if (!is_string($submittedCsrf) || !hash_equals($csrf, $submittedCsrf)) {
        http_response_code(400);
        $errors[] = 'The setup form expired. Reload this page and try again.';
    } elseif ($requirements !== []) {
        http_response_code(503);
        $errors = $requirements;
    } else {
        try {
            $installer = new InstallService(
                $keyPath,
                $configPath,
                new PdoInstallDatabase($appRoot . '/migrations'),
            );
            $installer->install($_POST, is_string($_POST['install_key'] ?? null) ? $_POST['install_key'] : '');
            $_SESSION = [];
            session_regenerate_id(true);
            header('Location: ' . ($basePath === '' ? '/' : $basePath . '/'), true, 303);
            exit;
        } catch (\InvalidArgumentException | \RuntimeException $exception) {
            http_response_code(422);
            $errors[] = $exception->getMessage();
        } catch (\Throwable $exception) {
            error_log('Tangent installer failed: ' . get_class($exception) . ': ' . $exception->getMessage());
            http_response_code(500);
            $errors[] = 'Setup could not complete. Check the database and server error log, then retry.';
        }
    }
} elseif ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    header('Allow: GET, POST');
    http_response_code(405);
    $errors[] = 'This request method is not supported.';
}

function installerEscape(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function installerValue(string $key, string $default = ''): string
{
    $value = $_POST[$key] ?? $default;
    return is_string($value) ? $value : $default;
}

?><!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Install Tangent</title>
    <link rel="icon" href="./favicon.ico" type="image/x-icon">
    <link rel="icon" href="./assets/icons/tangent-icon.svg" type="image/svg+xml">
    <link rel="icon" href="./assets/icons/tangent-32.png" sizes="32x32" type="image/png">
    <link rel="stylesheet" href="./assets/tokens.css">
    <link rel="stylesheet" href="./install.css">
</head>
<body>
<main class="installer">
    <h1>Install Tangent</h1>
    <p>Set up Tangent on this server. Use an empty, dedicated MySQL or MariaDB database.</p>

    <?php if ($requirements !== []): ?>
        <section class="notice error" aria-labelledby="requirements-heading">
            <h2 id="requirements-heading">Server requirements</h2>
            <ul><?php foreach ($requirements as $problem): ?><li><?= installerEscape($problem) ?></li><?php endforeach; ?></ul>
        </section>
    <?php endif; ?>

    <?php if ($errors !== []): ?>
        <section class="notice error" role="alert">
            <ul><?php foreach ($errors as $error): ?><li><?= installerEscape($error) ?></li><?php endforeach; ?></ul>
        </section>
    <?php endif; ?>

    <?php if (!is_file($keyPath) && !$isConfigured): ?>
        <section class="notice">
            <h2>Prepare the one-time setup key</h2>
            <p>Generate a 64-character key on your computer with <code>openssl rand -hex 32</code>. Create a file named <code>.install-key</code> in the private Tangent application directory, outside the public web folder, and put only that key in it. Keep a copy to enter below.</p>
        </section>
    <?php endif; ?>

    <?php if (!$isConfigured && is_file($keyPath)): ?>
        <?php if (!$secureRequest): ?>
            <p class="notice error">HTTPS is required for setup. Localhost is allowed for development.</p>
        <?php elseif ($requirements === []): ?>
            <form method="post" autocomplete="off">
                <input type="hidden" name="csrf_token" value="<?= installerEscape($csrf) ?>">
                <fieldset>
                    <legend>Database</legend>
                    <label>Host <input name="db_host" required maxlength="255" value="<?= installerEscape(installerValue('db_host', 'localhost')) ?>"></label>
                    <label>Port <input name="db_port" inputmode="numeric" required maxlength="5" value="<?= installerEscape(installerValue('db_port', '3306')) ?>"></label>
                    <label>Database name <input name="db_name" required maxlength="64" value="<?= installerEscape(installerValue('db_name')) ?>"></label>
                    <label>Database user <input name="db_user" required maxlength="128" value="<?= installerEscape(installerValue('db_user')) ?>"></label>
                    <label>Database password <input name="db_password" type="password" autocomplete="new-password"></label>
                </fieldset>
                <fieldset>
                    <legend>Workspace</legend>
                    <label>Workspace name <input name="workspace_name" required maxlength="120" value="<?= installerEscape(installerValue('workspace_name')) ?>"></label>
                    <label>Workspace URL name <input name="workspace_slug" required maxlength="100" pattern="[a-z0-9]+(-[a-z0-9]+)*" value="<?= installerEscape(installerValue('workspace_slug')) ?>"></label>
                    <p class="help">Use lowercase letters and numbers separated by single hyphens.</p>
                </fieldset>
                <fieldset>
                    <legend>First admin</legend>
                    <label>Name <input name="admin_name" required minlength="2" maxlength="120" value="<?= installerEscape(installerValue('admin_name')) ?>"></label>
                    <label>Email <input name="admin_email" type="email" required maxlength="254" value="<?= installerEscape(installerValue('admin_email')) ?>"></label>
                    <label>Password <input name="admin_password" type="password" required minlength="15" maxlength="128" autocomplete="new-password"></label>
                    <label>Confirm password <input name="admin_password_confirm" type="password" required minlength="15" maxlength="128" autocomplete="new-password"></label>
                    <p class="help">Use at least 15 characters. Tangent checks common and context-based passwords.</p>
                </fieldset>
                <fieldset>
                    <legend>Site</legend>
                    <label>Public site URL <input name="app_url" type="url" required maxlength="500" placeholder="https://example.com/tangent" value="<?= installerEscape(installerValue('app_url', $defaultAppUrl)) ?>"></label>
                </fieldset>
                <fieldset>
                    <legend>Email</legend>
                    <label>Sender email address <input name="mail_from" type="email" required maxlength="254" placeholder="no-reply@example.com" value="<?= installerEscape(installerValue('mail_from')) ?>"></label>
                    <p class="help">Used as the From address for workspace invitations and password recovery emails.</p>
                </fieldset>
                <label>One-time setup key <input name="install_key" type="password" required minlength="64" maxlength="64" autocomplete="off"></label>
                <p class="help">Setup runs the migrations and creates the workspace and admin. Tangent stores the config outside the public web directory and consumes the key.</p>
                <button type="submit">Install Tangent</button>
            </form>
        <?php endif; ?>
    <?php endif; ?>
</main>
</body>
</html>
