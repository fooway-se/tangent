<?php

declare(strict_types=1);

namespace Tangent\Modules\Chat;

use Tangent\Core\ApiException;
use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Permissions;
use Tangent\Modules\Projects\ProjectRepository;

final class ChatService
{
    public function __construct(
        private readonly ChatRepository $chat,
        private readonly ProjectRepository $projects,
    ) {
    }

    public function createProjectChannel(int $workspaceId, int $projectId): void
    {
        $this->chat->createProjectChannel($workspaceId, $projectId);
    }

    /** @return array{messages: list<array<string, mixed>>, etag: string, not_modified: bool} */
    public function messages(
        AuthenticatedUser $user,
        int $projectId,
        ?int $sinceId,
        ?string $ifNoneMatch,
    ): array {
        $channelId = $this->visibleProjectChannel($user, $projectId);
        $latestId = $this->chat->latestMessageId($user->workspaceId, $channelId);
        $etag = '"chat-' . $channelId . '-' . $latestId . '"';
        $messages = $this->chat->listMessages($user->workspaceId, $channelId, $sinceId);
        $notModified = $ifNoneMatch !== null
            && hash_equals($etag, trim($ifNoneMatch))
            && ($sinceId === null || $messages === []);

        return [
            'messages' => $messages,
            'etag' => $etag,
            'not_modified' => $notModified,
        ];
    }

    /** @return array{events: list<array<string, mixed>>, etag: string, not_modified: bool} */
    public function events(AuthenticatedUser $user, int $sinceId, ?string $ifNoneMatch): array
    {
        $projectIds = [];
        foreach ($this->projects->visibilityForUser($user->workspaceId, $user->id) as $project) {
            if (Permissions::can($user, 'chat.read', ['is_member' => $project['is_member']])) {
                $projectIds[] = $project['id'];
            }
        }

        $latestId = $this->chat->latestEventId($user->workspaceId, $projectIds);
        $etag = '"events-' . $user->workspaceId . '-' . $latestId . '"';
        $events = $this->chat->listEvents($user->workspaceId, $projectIds, $sinceId);
        $notModified = $ifNoneMatch !== null
            && hash_equals($etag, trim($ifNoneMatch))
            && $events === [];

        return [
            'events' => $events,
            'etag' => $etag,
            'not_modified' => $notModified,
        ];
    }

    /** @param array<string, mixed> $input @return array<string, mixed> */
    public function sendMessage(AuthenticatedUser $user, int $projectId, array $input): array
    {
        $channelId = $this->visibleProjectChannel($user, $projectId, 'chat.send');
        $body = is_string($input['body'] ?? null) ? trim($input['body']) : '';
        if ($body === '' || mb_strlen($body, 'UTF-8') > 10_000) {
            throw new ApiException(422, 'validation_failed', 'Message must be between 1 and 10000 characters.');
        }

        $parentId = null;
        if (array_key_exists('parent_id', $input) && $input['parent_id'] !== null) {
            $parentId = self::positiveInteger($input['parent_id']);
            if (!$this->chat->messageExists($user->workspaceId, $channelId, $parentId)) {
                throw new ApiException(404, 'not_found', 'The parent message was not found.');
            }
        }

        return $this->chat->createMessage(
            $user->workspaceId,
            $channelId,
            $user->id,
            $parentId,
            $body,
        );
    }

    private function visibleProjectChannel(
        AuthenticatedUser $user,
        int $projectId,
        string $action = 'chat.read',
    ): int {
        $project = $this->projects->find($user->workspaceId, $projectId);
        $isMember = $project !== null && $this->projects->isMember($user->workspaceId, $projectId, $user->id);
        if ($project === null || !Permissions::can($user, $action, ['is_member' => $isMember])) {
            throw new ApiException(404, 'not_found', 'The project was not found.');
        }

        $channelId = $this->chat->findProjectChannel($user->workspaceId, $projectId);
        if ($channelId === null) {
            throw new ApiException(500, 'internal_error', 'The project channel is not available.');
        }

        return $channelId;
    }

    private static function positiveInteger(mixed $value): int
    {
        if (!is_int($value) && !(is_string($value) && ctype_digit($value))) {
            throw new ApiException(422, 'validation_failed', 'Parent message ID must be a positive integer.');
        }

        $parsed = filter_var((string) $value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($parsed === false) {
            throw new ApiException(422, 'validation_failed', 'Parent message ID must be a positive integer.');
        }

        return $parsed;
    }
}
