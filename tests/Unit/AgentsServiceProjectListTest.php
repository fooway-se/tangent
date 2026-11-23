<?php

declare(strict_types=1);

namespace Tangent\Tests\Unit;

use PDO;
use PDOStatement;
use PHPUnit\Framework\TestCase;
use Tangent\Core\ApiException;
use Tangent\Core\AuthenticatedUser;
use Tangent\Modules\Agents\AgentRepository;
use Tangent\Modules\Agents\AgentsService;
use Tangent\Modules\Auth\PasswordSecurity;
use Tangent\Modules\Auth\RateLimiter;
use Tangent\Modules\Auth\TokenRepository;
use Tangent\Modules\Auth\UserRepository;
use Tangent\Modules\Inbox\InboxEventRepository;
use Tangent\Modules\Inbox\InboxEvents;
use Tangent\Modules\Issues\IssueDiscussionRepository;
use Tangent\Modules\Issues\IssueRepository;
use Tangent\Modules\Projects\ProjectRepository;

final class AgentsServiceProjectListTest extends TestCase
{
    public function testListsOnlyGrantedReadableActiveOrPausedProjects(): void
    {
        $service = $this->service([
            $this->projectRow(1, 'Granted project', 'active', false),
            $this->projectRow(2, 'Ungrant project', 'paused', false),
            $this->projectRow(3, 'Completed project', 'completed', false),
        ]);

        $projects = $service->listProjects($this->agent([1, 3], ['issues.read']));

        self::assertSame([
            'projects' => [['id' => 1, 'name' => 'Granted project', 'status' => 'active']],
        ], $projects);
    }

    public function testDeveloperAgentOnlyListsProjectsWhereItsOwnerIsStillAMember(): void
    {
        $service = $this->service([$this->projectRow(1, 'Granted project', 'active', false)]);

        self::assertSame(['projects' => []], $service->listProjects($this->agent(
            [1],
            ['issues.read'],
            'developer',
        )));
    }

    public function testProjectListingRequiresAnAgentTokenAndIssueReadCapability(): void
    {
        $service = $this->service([$this->projectRow(1, 'Granted project', 'active', true)]);

        try {
            $service->listProjects($this->human());
            self::fail('Expected a human principal to be rejected.');
        } catch (ApiException $exception) {
            self::assertSame(403, $exception->status);
        }

        try {
            $service->listProjects($this->agent([1], ['issues.comment']));
            self::fail('Expected an agent without issue read access to be rejected.');
        } catch (ApiException $exception) {
            self::assertSame(403, $exception->status);
        }
    }

    private function service(array $projectRows): AgentsService
    {
        $pdo = new ProjectRowsPdo($projectRows);
        $projects = new ProjectRepository($pdo);

        return new AgentsService(
            new AgentRepository($pdo),
            $projects,
            new TokenRepository($pdo),
            new RateLimiter($pdo),
            new IssueRepository($pdo),
            new IssueDiscussionRepository($pdo),
            new InboxEvents(
                new InboxEventRepository($pdo),
                $projects,
                new UserRepository($pdo, new PasswordSecurity(false)),
            ),
            $pdo,
        );
    }

    private function agent(array $projectIds, array $capabilities, string $role = 'admin'): AuthenticatedUser
    {
        return new AuthenticatedUser(
            id: 10,
            workspaceId: 3,
            name: 'Agent owner',
            email: 'agent-owner@example.test',
            role: $role,
            authenticationMethod: 'api',
            tokenId: 1,
            csrfHash: null,
            accountId: 4,
            agentId: 20,
            agentName: 'Build agent',
            agentProjectIds: $projectIds,
            agentCapabilities: $capabilities,
        );
    }

    private function human(): AuthenticatedUser
    {
        return new AuthenticatedUser(
            id: 10,
            workspaceId: 3,
            name: 'Workspace admin',
            email: 'admin@example.test',
            role: 'admin',
            authenticationMethod: 'session',
            tokenId: 1,
            csrfHash: null,
            accountId: 4,
        );
    }

    private function projectRow(int $id, string $name, string $status, bool $isMember): array
    {
        return [
            'id' => $id,
            'workspace_id' => 3,
            'name' => $name,
            'slug' => strtolower(str_replace(' ', '-', $name)),
            'description' => '',
            'status' => $status,
            'archived_from_status' => null,
            'github_installation_id' => null,
            'github_repository_id' => null,
            'github_repository_owner' => null,
            'github_repository_name' => null,
            'github_repository_full_name' => null,
            'github_repository_url' => null,
            'created_by' => 10,
            'created_at' => '2026-01-01 00:00:00',
            'updated_at' => '2026-01-01 00:00:00',
            'is_member' => $isMember,
        ];
    }
}

final class ProjectRowsPdo extends PDO
{
    public function __construct(private readonly array $projectRows)
    {
    }

    public function prepare(string $query, array $options = []): PDOStatement|false
    {
        return new ProjectRowsStatement($this->projectRows);
    }
}

final class ProjectRowsStatement extends PDOStatement
{
    public function __construct(private readonly array $projectRows)
    {
    }

    public function execute(?array $params = null): bool
    {
        return true;
    }

    public function fetchAll(int $mode = PDO::FETCH_DEFAULT, mixed ...$args): array
    {
        return $this->projectRows;
    }
}
