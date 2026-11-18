<?php

declare(strict_types=1);

namespace Tangent\Modules\Chat;

use Tangent\Core\ApiException;
use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Permissions;
use Tangent\Modules\Inbox\InboxEvents;
use Tangent\Modules\Projects\ProjectLifecycle;
use Tangent\Modules\Projects\ProjectRepository;
use PDO;
use Throwable;

final class ChatService
{
    public function __construct(
        private readonly ChatRepository $chat,
        private readonly ProjectRepository $projects,
        private readonly InboxEvents $inboxEvents,
        private readonly PDO $pdo,
    ) {
    }

    public function createProjectChannel(int $workspaceId, int $projectId): void
    {
        $this->chat->createProjectChannel($workspaceId, $projectId);
    }

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

    public function message(AuthenticatedUser $user, int $projectId, int $messageId): array
    {
        $channelId = $this->visibleProjectChannel($user, $projectId);
        $message = $this->chat->getMessage($user->workspaceId, $channelId, $messageId);
        if ($message === null) throw new ApiException(404, 'not_found', 'The message was not found.');
        return $message;
    }

    public function heartbeatProjectPresence(AuthenticatedUser $user, int $projectId): array
    {
        $this->visibleProjectChannel($user, $projectId);
        return [
            'someone_else_viewing' => $this->chat->heartbeatProjectPresence(
                $user->workspaceId,
                $projectId,
                $user->id,
            ),
        ];
    }

    public function clientConversationMessages(AuthenticatedUser $user, int $projectId): array
    {
        $channelId = $this->visibleProjectChannel($user, $projectId, 'client_view.read');
        return $this->chat->listClientConversationMessages($user->workspaceId, $channelId);
    }

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

        $threadParticipants = [];
        $clientVisible = false;
        if ($parentId !== null) {
            $rootId = $this->chat->threadRootId($user->workspaceId, $channelId, $parentId);
            $threadParticipants = $this->chat->threadParticipantIds($user->workspaceId, $channelId, $rootId);
            $rootMessage = $this->chat->getMessage($user->workspaceId, $channelId, $rootId);
            $clientVisible = ($rootMessage['is_client_visible'] ?? false) === true;
        }
        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) $this->pdo->beginTransaction();
        try {
            $message = $this->chat->createMessage($user->workspaceId, $channelId, $user->id, $parentId, $body, $clientVisible);
            $this->inboxEvents->recordMessage($user->workspaceId, $projectId, $user->id, $message, $threadParticipants);
            if ($ownsTransaction) $this->pdo->commit();
            return $message;
        } catch (Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        }
    }

    public function sendClientComment(AuthenticatedUser $user, int $projectId, array $input): array
    {
        $channelId = $this->visibleProjectChannel($user, $projectId, 'client_comments.create');
        $body = is_string($input['body'] ?? null) ? trim($input['body']) : '';
        if ($body === '' || mb_strlen($body, 'UTF-8') > 2000) {
            throw new ApiException(422, 'validation_failed', 'Comment must be between 1 and 2000 characters.');
        }
        $ownsTransaction = !$this->pdo->inTransaction();
        if ($ownsTransaction) $this->pdo->beginTransaction();
        try {
            $message = $this->chat->createMessage($user->workspaceId, $channelId, $user->id, null, $body, true);
            $this->inboxEvents->recordClientComment($user->workspaceId, $projectId, $user->id, (int) $message['id'], $body);
            if ($ownsTransaction) $this->pdo->commit();
            return $message;
        } catch (Throwable $exception) {
            if ($ownsTransaction && $this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $exception;
        }
    }

    public function issueContext(AuthenticatedUser $user, int $messageId): array
    {
        $message = $this->chat->messageContext($user->workspaceId, $messageId);
        if ($message === null || $message['project_id'] === null || $message['channel_type'] !== 'project') {
            throw new ApiException(404, 'not_found', 'The message was not found.');
        }

        $this->visibleProjectChannel($user, $message['project_id']);
        return [
            'project_id' => $message['project_id'],
            'channel_id' => $message['channel_id'],
            'root_message_id' => $this->chat->threadRootId(
                $user->workspaceId,
                $message['channel_id'],
                $message['id'],
            ),
            'title' => $message['body'],
        ];
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
        if (in_array($action, ['chat.send', 'client_comments.create'], true)) {
            ProjectLifecycle::requireWritable($project['status']);
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
