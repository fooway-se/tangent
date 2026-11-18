<?php

declare(strict_types=1);

namespace Tangent\Modules\Installer;

interface InstallDatabase
{
    /** Run migrations and create or recover the first workspace admin. */
    public function initialize(array $input): int;
}
