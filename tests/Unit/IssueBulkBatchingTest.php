<?php

declare(strict_types=1);

namespace Tangent\Tests\Unit;

use PDO;
use PDOStatement;
use Tangent\Modules\Inbox\InboxEventRepository;
use Tangent\Modules\Issues\IssueRepository;
use Tangent\Modules\Projects\MilestoneRepository;
use PHPUnit\Framework\TestCase;

final class IssueBulkBatchingTest extends TestCase
{
    public function testBulkIssueOperationsUseSingleStatementsPerBatch(): void
    {
        $pdo = new RecordingPdo();
        $issues = new IssueRepository($pdo);
        $milestones = new MilestoneRepository($pdo);
        $events = new InboxEventRepository($pdo);
        $issueIds = [11, 12, 13];

        $issues->findManyForProjectForUpdate(4, 5, $issueIds);
        $issues->bulkSetShared(4, 5, $issueIds, true);
        $issues->bulkAssignToMember(4, 5, $issueIds, 9);
        $issues->moveUnassignedToMilestoneBatch(4, 5, $issueIds, 7, 20);
        $milestones->findForUpdate(4, 5, 7);
        $events->recordAssignedBatch(4, 5, 2, 9, [
            ['id' => 11, 'title' => 'First issue'],
            ['id' => 12, 'title' => 'Second issue'],
            ['id' => 13, 'title' => 'Third issue'],
        ]);

        self::assertCount(6, $pdo->queries, 'Each bulk operation should prepare one SQL statement for its batch.');
        self::assertStringContainsString('id IN (', $pdo->queries[0]['sql']);
        self::assertStringContainsString('UPDATE issues SET is_shared', $pdo->queries[1]['sql']);
        self::assertStringContainsString('UPDATE issues SET assignee_id', $pdo->queries[2]['sql']);
        self::assertStringContainsString('CASE id', $pdo->queries[3]['sql']);
        self::assertStringContainsString('FOR UPDATE', $pdo->queries[4]['sql']);
        self::assertStringContainsString('INSERT INTO inbox_events', $pdo->queries[5]['sql']);
        self::assertSame(3, substr_count($pdo->queries[5]['sql'], '(:workspace_id_'));
        self::assertSame([11, 12, 13], array_values(array_intersect_key(
            $pdo->queries[5]['parameters'],
            ['issue_id_0' => true, 'issue_id_1' => true, 'issue_id_2' => true],
        )));
        self::assertSame(['First issue', 'Second issue', 'Third issue'], array_values(array_intersect_key(
            $pdo->queries[5]['parameters'],
            ['detail_0' => true, 'detail_1' => true, 'detail_2' => true],
        )));
    }
}

final class RecordingPdo extends PDO
{
    /** @var list<array{sql: string, parameters: array}> */
    public array $queries = [];

    public function __construct()
    {
    }

    public function prepare(string $query, array $options = []): PDOStatement|false
    {
        return new RecordingPdoStatement($this, $query);
    }
}

final class RecordingPdoStatement extends PDOStatement
{
    public function __construct(private readonly RecordingPdo $pdo, private readonly string $sql)
    {
    }

    public function execute(?array $params = null): bool
    {
        $this->pdo->queries[] = ['sql' => $this->sql, 'parameters' => $params ?? []];
        return true;
    }

    public function fetchAll(int $mode = PDO::FETCH_DEFAULT, mixed ...$args): array
    {
        return [];
    }

    public function fetch(int $mode = PDO::FETCH_DEFAULT, int $cursorOrientation = PDO::FETCH_ORI_NEXT, int $cursorOffset = 0): mixed
    {
        return false;
    }

    public function rowCount(): int
    {
        return 3;
    }
}
