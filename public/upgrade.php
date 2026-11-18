<?php

declare(strict_types=1);

use Tangent\Core\MigrationRunner;
use Tangent\Core\AppBasePath;
use Tangent\Core\Runtime;
use Tangent\Modules\Installer\InstallRequirements;
use Tangent\Modules\Installer\UpgradeService;

$appRoot = require __DIR__ . '/app-root.php';
require $appRoot . '/bootstrap.php';

$basePath = Runtime::isConfigured()
    ? AppBasePath::fromPublicUrl(Runtime::appConfig()->publicAppUrl)
    : AppBasePath::fromScriptName($_SERVER['SCRIPT_NAME'] ?? '');
if (!Runtime::isConfigured() && $basePath === '') {
    $basePath = AppBasePath::fromFilesystemPaths(__DIR__, $_SERVER['DOCUMENT_ROOT'] ?? '');
}

header('Content-Security-Policy: default-src \'none\'; style-src \'self\'; form-action \'self\'; base-uri \'none\'; frame-ancestors \'none\'');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('Cache-Control: no-store');

if (!Runtime::isConfigured()) {
    header('Location: ' . $basePath . '/install.php', true, 302);
    exit;
}

$host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
$isLocalhost = in_array(preg_replace('/:\\d+$/', '', $host), ['localhost', '127.0.0.1', '[::1]'], true);
$requestIsHttps = (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off')
    || strtolower((string) ($_SERVER['REQUEST_SCHEME'] ?? '')) === 'https';
$secureRequest = $requestIsHttps || $isLocalhost;

ini_set('session.use_strict_mode', '1');
session_name('tangent_upgrade');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => AppBasePath::csrfCookiePath($basePath),
    'secure' => $requestIsHttps,
    'httponly' => true,
    'samesite' => 'Strict',
]);
session_start();

if (!isset($_SESSION['upgrade_csrf']) || !is_string($_SESSION['upgrade_csrf'])) {
    $_SESSION['upgrade_csrf'] = bin2hex(random_bytes(32));
}
$csrf = $_SESSION['upgrade_csrf'];
$keyPath = $appRoot . '/.upgrade-key';
$errors = [];
$complete = false;
$requirements = InstallRequirements::check();

if (!$secureRequest) {
    $errors[] = 'Open this page over HTTPS before running an upgrade.';
} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $submittedCsrf = $_POST['csrf_token'] ?? '';
    if (!is_string($submittedCsrf) || !hash_equals($csrf, $submittedCsrf)) {
        http_response_code(400);
        $errors[] = 'The upgrade form expired. Reload this page and try again.';
    } elseif ($requirements !== []) {
        http_response_code(503);
        $errors = $requirements;
    } elseif (($_POST['backup_confirmed'] ?? null) !== '1') {
        http_response_code(422);
        $errors[] = 'Confirm that you created a database backup before running migrations.';
    } else {
        try {
            (new UpgradeService($keyPath, static function () use ($appRoot): void {
                (new MigrationRunner(Runtime::database()->pdo(), $appRoot . '/migrations'))->migrate();
            }))->run(is_string($_POST['upgrade_key'] ?? null) ? $_POST['upgrade_key'] : '');
            $complete = true;
        } catch (\RuntimeException $exception) {
            http_response_code(422);
            $errors[] = $exception->getMessage();
        } catch (\Throwable $exception) {
            error_log('Tangent upgrade failed: ' . get_class($exception) . ': ' . $exception->getMessage());
            http_response_code(500);
            $errors[] = 'The upgrade could not complete. Restore the database backup if needed, then check the server error log.';
        }
    }
} elseif ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    header('Allow: GET, POST');
    http_response_code(405);
    $errors[] = 'This request method is not supported.';
}

function upgradeEscape(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

?><!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Upgrade Tangent</title>
    <link rel="stylesheet" href="./install.css">
</head>
<body>
<main class="installer">
    <h1>Upgrade Tangent</h1>
    <?php if ($complete): ?>
        <section class="notice" role="status"><p>Migrations are up to date. The one-time key was removed.</p></section>
        <p><a href="<?= upgradeEscape($basePath === '' ? '/' : $basePath . '/') ?>">Return to Tangent</a></p>
    <?php else: ?>
        <p>Back up the database before applying a new release. Tangent runs only migrations that have not already been applied.</p>
        <?php if ($requirements !== []): ?>
            <section class="notice error" aria-labelledby="requirements-heading">
                <h2 id="requirements-heading">Server requirements</h2>
                <ul><?php foreach ($requirements as $problem): ?><li><?= upgradeEscape($problem) ?></li><?php endforeach; ?></ul>
            </section>
        <?php endif; ?>
        <?php if ($errors !== []): ?>
            <section class="notice error" role="alert"><ul><?php foreach ($errors as $error): ?><li><?= upgradeEscape($error) ?></li><?php endforeach; ?></ul></section>
        <?php endif; ?>
        <?php if (!is_file($keyPath)): ?>
            <section class="notice">
                <h2>Prepare a one-time upgrade key</h2>
                <p>Generate a 64-character key on your computer with <code>openssl rand -hex 32</code>. Upload it in a file named <code>.upgrade-key</code> in the private Tangent application directory, outside the public web folder.</p>
            </section>
        <?php elseif ($secureRequest && $requirements === []): ?>
            <form method="post" autocomplete="off">
                <input type="hidden" name="csrf_token" value="<?= upgradeEscape($csrf) ?>">
                <label>One-time upgrade key <input name="upgrade_key" type="password" required minlength="64" maxlength="64" autocomplete="off"></label>
                <label class="check"><input name="backup_confirmed" type="checkbox" value="1" required> I backed up the database.</label>
                <button type="submit">Apply migrations</button>
            </form>
        <?php endif; ?>
    <?php endif; ?>
</main>
</body>
</html>
