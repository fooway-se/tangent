<?php

declare(strict_types=1);

use Tangent\Core\AppBasePath;
use Tangent\Core\Application;
use Tangent\Core\Request;
use Tangent\Core\Response;
use Tangent\Core\Runtime;

$appRoot = require __DIR__ . '/app-root.php';
require $appRoot . '/bootstrap.php';

$configured = Runtime::isConfigured();
$scriptName = $_SERVER['SCRIPT_NAME'] ?? '';
$scriptPath = is_string($scriptName) ? parse_url($scriptName, PHP_URL_PATH) : null;
if ($configured) {
    $basePath = AppBasePath::fromPublicUrl(Runtime::appConfig()->publicAppUrl);
} elseif (is_string($scriptPath) && $scriptPath !== '') {
    $basePath = AppBasePath::fromScriptName($scriptName);
} else {
    $basePath = AppBasePath::fromFilesystemPaths(__DIR__, $_SERVER['DOCUMENT_ROOT'] ?? '');
}
$requestPath = (string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$relativePath = AppBasePath::relativeRequestPath($requestPath, $basePath);

if ($relativePath === null) {
    Response::json(404, [
        'error' => ['code' => 'not_found', 'message' => 'The requested resource was not found.'],
    ])->send();
    exit;
}

if (!$configured) {
    $isApiPath = $relativePath === '/api/v1' || str_starts_with($relativePath, '/api/v1/');
    if ($isApiPath) {
        Response::json(503, [
            'error' => ['code' => 'not_installed', 'message' => 'Complete Tangent setup before using the API.'],
        ])->send();
        exit;
    }
    if (!in_array($relativePath, ['/install.php', '/upgrade.php'], true)) {
        if (PHP_SAPI === 'cli-server' && is_file(__DIR__ . $relativePath) && !str_ends_with($relativePath, '.php')) {
            return false;
        }
        header('Location: ' . $basePath . '/install.php', true, 302);
        exit;
    }
}

if (PHP_SAPI === 'cli-server') {
    if ($relativePath === '/') {
        header('Location: ' . $basePath . '/app.html', true, 302);
        exit;
    }
    $isApiPath = $relativePath === '/api/v1' || str_starts_with($relativePath, '/api/v1/');
    if (!$isApiPath && is_file(__DIR__ . $relativePath)) {
        return false;
    }
}

$headers = function_exists('getallheaders') ? getallheaders() : [];
foreach ($_SERVER as $serverKey => $value) {
    if (!is_string($value)) {
        continue;
    }
    if (str_starts_with($serverKey, 'HTTP_')) {
        $name = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($serverKey, 5)))));
        $headers[$name] = $value;
    } elseif (in_array($serverKey, ['CONTENT_TYPE', 'CONTENT_LENGTH'], true)) {
        $headers[str_replace('_', '-', ucwords(strtolower($serverKey), '_'))] = $value;
    }
}

$request = Request::fromHttp(
    $_SERVER['REQUEST_METHOD'] ?? 'GET',
    $relativePath,
    $_GET,
    $headers,
    $_COOKIE,
    (string) file_get_contents('php://input', false, null, 0, Request::MAX_BODY_BYTES + 1),
    $_SERVER['REMOTE_ADDR'] ?? 'unknown',
);

try {
    $gateway = Application::create(Runtime::database()->pdo(), Runtime::appConfig());
    $response = $gateway->handle($request);
} catch (\Throwable $exception) {
    \Tangent\Core\RequestErrorReporter::report($request->requestId, $exception);
    $response = Response::json(500, [
        'error' => ['code' => 'internal_error', 'message' => 'The request could not be completed.'],
    ], ['X-Request-ID' => $request->requestId]);
}

$response = new Response($response->status, $response->body, array_merge([
    'content-security-policy' => "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    'x-content-type-options' => 'nosniff',
    'referrer-policy' => 'no-referrer',
], $response->headers), $response->streamer());
$response->send();
