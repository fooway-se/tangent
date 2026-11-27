<?php

declare(strict_types=1);

namespace Tangent\Modules\EmailNotifications;

use Tangent\Core\AppConfig;
use Tangent\Core\AuthenticatedUser;
use Tangent\Core\Request;
use Tangent\Core\Response;
use Tangent\Core\Router;

final class EmailNotificationsRoutes
{
    public function __construct(
        private readonly EmailNotificationsService $service,
        private readonly EmailNotificationRunner $runner,
        private readonly AppConfig $config,
    ) {
    }

    public function register(Router $router): void
    {
        $router->add('GET', '/api/v1/workspace/notifications', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(200, ['settings' => $this->service->settings($user)], ['cache-control' => 'no-store']);
        });

        $router->add('PUT', '/api/v1/workspace/notifications', function (
            Request $request,
            array $params,
            AuthenticatedUser $user,
        ): Response {
            return Response::json(200, ['settings' => $this->service->update($user, $request->body)], ['cache-control' => 'no-store']);
        });

        if ($this->config->emailNotificationHttpTriggerEnabled) {
            $router->add('POST', '/api/v1/cron/email-notification-summaries', function (Request $request): Response {
                $tokenHash = $this->config->emailNotificationHttpTriggerTokenHash;
                if (preg_match('/\A[a-fA-F0-9]{64}\z/D', $tokenHash) !== 1) {
                    return Response::json(503, [
                        'error' => [
                            'code' => 'trigger_misconfigured',
                            'message' => 'The email notification trigger is not configured correctly.',
                        ],
                    ], ['cache-control' => 'no-store']);
                }

                $authorization = $request->header('Authorization') ?? '';
                if (preg_match('/\ABearer[ \t]+([^\s]+)\z/iD', $authorization, $matches) !== 1
                    || !hash_equals(strtolower($tokenHash), hash('sha256', $matches[1]))) {
                    return Response::json(401, [
                        'error' => [
                            'code' => 'unauthorized',
                            'message' => 'A valid bearer token is required.',
                        ],
                    ], [
                        'cache-control' => 'no-store',
                        'www-authenticate' => 'Bearer',
                    ]);
                }

                $result = $this->runner->run();
                if ($result['failed'] > 0) {
                    return Response::json(503, [
                        'error' => [
                            'code' => 'email_notification_delivery_failed',
                            'message' => 'Some email notification summaries could not be sent.',
                        ],
                        'result' => $result,
                    ], ['cache-control' => 'no-store']);
                }

                return Response::json(200, ['result' => $result], ['cache-control' => 'no-store']);
            }, false);
        }
    }
}
