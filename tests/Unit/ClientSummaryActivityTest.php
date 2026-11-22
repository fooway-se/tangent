<?php

declare(strict_types=1);

namespace Tangent\Tests\Unit;

use PDO;
use PDOStatement;
use Tangent\Modules\Issues\IssueRepository;
use PHPUnit\Framework\TestCase;

final class ClientSummaryActivityTest extends TestCase
{
    public function testSummaryActivityUsesOneGuestFilteredDateRangeQuery(): void
    {
        $pdo = new SummaryRecordingPdo();
        $repository = new IssueRepository($pdo);

        $activity = $repository->sharedStatusUpdatesBetween(5, 8, '2026-11-01', '2026-11-30');

        self::assertCount(1, $pdo->queries);
        self::assertSame(7, $activity['total_count']);
        self::assertCount(2, $activity['updates']);
        self::assertStringContainsString('i.is_shared = 1', $pdo->queries[0]['sql']);
        self::assertStringContainsString('i.is_ongoing = 0', $pdo->queries[0]['sql']);
        self::assertStringContainsString('i.deleted_at IS NULL', $pdo->queries[0]['sql']);
        self::assertStringContainsString("i.status <> 'cancelled'", $pdo->queries[0]['sql']);
        self::assertStringContainsString('COUNT(*) OVER()', $pdo->queries[0]['sql']);
        self::assertStringContainsString('LIMIT 5', $pdo->queries[0]['sql']);
        self::assertSame('2026-11-01 00:00:00', $pdo->queries[0]['parameters']['from_at']);
        self::assertSame('2026-12-01 00:00:00', $pdo->queries[0]['parameters']['until_at']);
        self::assertSame('Completed: Shared work', $activity['updates'][0]['text']);
    }
}

final class SummaryRecordingPdo extends PDO
{
    /** @var list<array{sql: string, parameters: array}> */
    public array $queries = [];

    public function __construct()
    {
    }

    public function prepare(string $query, array $options = []): PDOStatement|false
    {
        return new SummaryRecordingPdoStatement($this, $query);
    }
}

final class SummaryRecordingPdoStatement extends PDOStatement
{
    public function __construct(private readonly SummaryRecordingPdo $pdo, private readonly string $sql)
    {
    }

    public function execute(?array $params = null): bool
    {
        $this->pdo->queries[] = ['sql' => $this->sql, 'parameters' => $params ?? []];
        return true;
    }

    public function fetchAll(int $mode = PDO::FETCH_DEFAULT, mixed ...$args): array
    {
        return [
            [
                'id' => '12',
                'title' => 'Shared work',
                'to_status' => 'done',
                'created_at' => '2026-11-22 10:00:00',
                'total_count' => '7',
            ],
            [
                'id' => '11',
                'title' => 'Other shared work',
                'to_status' => 'doing',
                'created_at' => '2026-11-20 10:00:00',
                'total_count' => '7',
            ],
        ];
    }
}
