<?php

declare(strict_types=1);

use Tangent\Core\MigrationRunner;
use Tangent\Core\Runtime;
use Tangent\Modules\Auth\UserRepository;

require dirname(__DIR__) . '/bootstrap.php';

if (getenv('TANGENT_ENV') !== 'development') {
    fwrite(STDERR, "The development admin seed is disabled outside TANGENT_ENV=development.\n");
    exit(1);
}

$database = Runtime::database();
$pdo = $database->pdo();
(new MigrationRunner($pdo, dirname(__DIR__) . '/migrations'))->migrate();

$workspaceId = max(1, (int) (getenv('TANGENT_WORKSPACE_ID') ?: 1));
$workspaceQuery = $pdo->prepare('SELECT id FROM workspaces WHERE id = :id LIMIT 1');
$workspaceQuery->execute(['id' => $workspaceId]);
if ($workspaceQuery->fetchColumn() === false) {
    $name = getenv('TANGENT_WORKSPACE_NAME') ?: 'My workspace';
    $slug = getenv('TANGENT_WORKSPACE_SLUG') ?: 'my-workspace';
    $workspaceInsert = $pdo->prepare('INSERT INTO workspaces (id, name, slug) VALUES (:id, :name, :slug)');
    $workspaceInsert->execute(['id' => $workspaceId, 'name' => $name, 'slug' => $slug]);
}

$name = prompt('Admin name: ');
$email = UserRepository::normalizeEmail(prompt('Admin email: '));
$password = promptSecret();
if (mb_strlen($name, 'UTF-8') < 2 || mb_strlen($name, 'UTF-8') > 120) {
    fwrite(STDERR, "Name must be between 2 and 120 characters.\n");
    exit(1);
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    fwrite(STDERR, "Enter a valid email address.\n");
    exit(1);
}
if (strlen($password) < 12) {
    fwrite(STDERR, "Password must be at least 12 characters.\n");
    exit(1);
}

(new UserRepository($pdo))->createAdmin($workspaceId, $name, $email, $password);
fwrite(STDOUT, "Development admin created for workspace {$workspaceId}.\n");

function prompt(string $label): string
{
    fwrite(STDOUT, $label);
    return trim((string) fgets(STDIN));
}

function promptSecret(): string
{
    $canHide = function_exists('stream_isatty') && stream_isatty(STDIN) && function_exists('shell_exec');
    if ($canHide) {
        shell_exec('stty -echo 2>/dev/null');
    }
    $password = prompt('Admin password (12+ characters): ');
    if ($canHide) {
        shell_exec('stty echo 2>/dev/null');
        fwrite(STDOUT, PHP_EOL);
    }
    return $password;
}
