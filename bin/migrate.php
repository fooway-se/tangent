<?php

declare(strict_types=1);

use Tangent\Core\MigrationRunner;
use Tangent\Core\Runtime;

require dirname(__DIR__) . '/bootstrap.php';

$database = Runtime::database();
(new MigrationRunner($database->pdo(), dirname(__DIR__) . '/migrations'))->migrate();
fwrite(STDOUT, "Migrations are up to date.\n");
