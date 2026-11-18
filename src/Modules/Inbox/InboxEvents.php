<?php

declare(strict_types=1);

namespace Tangent\Modules\Inbox;

use Tangent\Core\ApiException;
use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Permissions;
use Tangent\Modules\Auth\UserRepository;
use Tangent\Modules\Projects\ProjectRepository;

final class InboxEvents
{
    public function __construct(
        private readonly InboxEventRepository $events,
        private readonly ProjectRepository $projects,
        private readonly UserRepository $users,
    ) {
    }

    public function list(AuthenticatedUser $user): array
    {
        $this->requireRead($user);
        return $this->events->listForUser($user->workspaceId, $user->id, $this->visibleProjectIds($user));
    }

    public function update(AuthenticatedUser $user, int $eventId, array $changes): array
    {
        $this->requireRead($user);
        if ($changes === []) throw new ApiException(422, 'validation_failed', 'At least one event field must be supplied.');
        foreach (['read', 'done'] as $field) {
            if (array_key_exists($field, $changes) && !is_bool($changes[$field])) {
                throw new ApiException(422, 'validation_failed', "Event {$field} must be a boolean.");
            }
        }
        if (array_diff(array_keys($changes), ['read', 'done']) !== []) {
            throw new ApiException(422, 'validation_failed', 'Only read and done can be changed.');
        }
        $event = $this->events->updateForUser(
            $user->workspaceId,
            $user->id,
            $eventId,
            $changes,
            $this->visibleProjectIds($user),
        );
        if ($event === null) throw new ApiException(404, 'not_found', 'The inbox event was not found.');
        return $event;
    }

    public function markAllRead(AuthenticatedUser $user): void
    {
        $this->requireRead($user);
        $this->events->markAllRead($user->workspaceId, $user->id, $this->visibleProjectIds($user));
    }

    public function recordMessage(
        int $workspaceId,
        int $projectId,
        int $actorId,
        array $message,
        array $threadParticipantIds,
    ): void {
        $members = $this->projects->members($workspaceId, $projectId);
        $matchesByOffset = [];
        foreach ($members as $member) {
            if (!(bool) ($member['is_active'] ?? true) || (int) $member['id'] === $actorId) continue;
            $nameParts = preg_split('/\s+/u', trim((string) $member['name'])) ?: [];
            $firstName = $nameParts[0] ?? '';
            $emailHandle = strstr((string) $member['email'], '@', true);
            foreach (array_unique(array_filter([implode(' ', $nameParts), $firstName, $emailHandle], static fn ($value): bool => is_string($value) && $value !== '')) as $candidate) {
                $parts = preg_split('/\s+/u', (string) $candidate) ?: [];
                $phrase = implode('\\s+', array_map(static fn (string $part): string => preg_quote($part, '/'), $parts));
                $pattern = '/(?<![\pL\pN_])@' . $phrase . '(?![\pL\pN_])/iu';
                if (preg_match_all($pattern, (string) $message['body'], $matches, PREG_OFFSET_CAPTURE) === false) {
                    continue;
                }
                foreach ($matches[0] as [$matchedText, $offset]) {
                    $matchesByOffset[$offset][] = [
                        'member_id' => (int) $member['id'],
                        'length' => strlen($matchedText),
                    ];
                }
            }
        }
        $byMention = [];
        foreach ($matchesByOffset as $matchesAtOffset) {
            $longestMatch = max(array_column($matchesAtOffset, 'length'));
            foreach ($matchesAtOffset as $match) {
                if ($match['length'] === $longestMatch) $byMention[$match['member_id']] = true;
            }
        }
        $detail = mb_substr((string) $message['body'], 0, 200, 'UTF-8');
        $messageId = (int) $message['id'];
        if ($byMention !== []) {
            $this->record($workspaceId, $projectId, array_keys($byMention), $actorId, 'mention', null, $messageId, 'mentioned you', $detail);
        }
        $replyRecipients = array_values(array_diff(array_unique(array_map('intval', $threadParticipantIds)), [$actorId], array_keys($byMention)));
        if ($replyRecipients !== []) {
            $this->record($workspaceId, $projectId, $replyRecipients, $actorId, 'reply', null, $messageId, 'replied in a thread', $detail);
        }
    }

    public function recordAssigned(int $workspaceId, int $projectId, int $actorId, ?int $recipientId, int $issueId, string $title): void
    {
        if ($recipientId !== null && $recipientId !== $actorId) {
            $this->record($workspaceId, $projectId, [$recipientId], $actorId, 'assigned', $issueId, null, 'assigned you an issue', $title);
        }
    }

    public function recordStatus(int $workspaceId, int $projectId, int $actorId, array $recipientIds, int $issueId, string $title, string $status): void
    {
        $this->record($workspaceId, $projectId, array_map('intval', array_filter($recipientIds)), $actorId, 'status', $issueId, null, 'changed issue status to ' . $status, $title);
    }

    public function recordClientComment(int $workspaceId, int $projectId, int $actorId, int $messageId, string $body): void
    {
        $recipients = array_map(static fn (array $member): int => (int) $member['id'], $this->projects->members($workspaceId, $projectId));
        $this->record($workspaceId, $projectId, $recipients, $actorId, 'reply', null, $messageId, 'left a client comment', mb_substr($body, 0, 200, 'UTF-8'));
    }

    public function recordApproval(int $workspaceId, int $projectId, int $actorId, int $creatorId, int $issueId, string $title): void
    {
        $this->record($workspaceId, $projectId, [$creatorId], $actorId, 'status', $issueId, null, 'approved a shared issue', $title);
    }

    public function recordGitHubPullRequest(int $workspaceId, int $projectId, int $issueId, string $summary, string $detail): void
    {
        $recipients = [];
        foreach ($this->projects->members($workspaceId, $projectId) as $member) {
            if ((bool) ($member['is_active'] ?? true) && in_array($member['role'] ?? '', ['admin', 'developer'], true)) {
                $recipients[] = (int) $member['id'];
            }
        }
        foreach ($this->users->list($workspaceId) as $user) {
            if ((bool) $user['is_active'] && $user['role'] === 'admin') $recipients[] = (int) $user['id'];
        }
        $this->record($workspaceId, $projectId, $recipients, null, 'pr', $issueId, null, $summary, $detail);
    }

    private function record(
        int $workspaceId,
        int $projectId,
        array $recipientIds,
        ?int $actorId,
        string $type,
        ?int $issueId,
        ?int $messageId,
        string $summary,
        ?string $detail,
    ): void {
        $allowed = [];
        foreach ($this->projects->members($workspaceId, $projectId) as $member) {
            if ((bool) ($member['is_active'] ?? true)) $allowed[(int) $member['id']] = true;
        }
        foreach ($this->users->list($workspaceId) as $user) {
            if ((bool) $user['is_active'] && $user['role'] === 'admin') $allowed[(int) $user['id']] = true;
        }
        $recipients = array_values(array_filter(array_unique($recipientIds), static fn (int $id): bool => $id !== $actorId && isset($allowed[$id])));
        if ($recipients === []) return;
        $this->events->record($workspaceId, $recipients, $actorId, $type, $projectId, $issueId, $messageId, $summary, $detail);
    }

    private function visibleProjectIds(AuthenticatedUser $user): array
    {
        $visible = [];
        foreach ($this->projects->visibilityForUser($user->workspaceId, $user->id) as $project) {
            if ($user->role === 'admin' || $project['is_member']) $visible[] = $project['id'];
        }
        return $visible;
    }

    private function requireRead(AuthenticatedUser $user): void
    {
        if (!Permissions::can($user, 'inbox.read')) throw new ApiException(403, 'forbidden', 'You cannot read inbox events.');
    }
}
