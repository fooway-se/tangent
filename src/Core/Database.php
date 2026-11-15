<?php

declare(strict_types=1);

namespace Tangent\Core;

use PDO;

final class Database
{
    public function __construct(private readonly PDO $connection)
    {
        $this->connection->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->connection->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $this->connection->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);
    }

    public static function connect(
        string $host,
        int $port,
        string $database,
        string $username,
        string $password,
    ): self {
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $host, $port, $database);
        return new self(new PDO($dsn, $username, $password));
    }

    public function pdo(): PDO
    {
        return $this->connection;
    }
}
