<?php

declare(strict_types=1);

use Tangent\Core\Application;
use Tangent\Core\Request;
use Tangent\Core\Response;
use Tangent\Core\Runtime;

if (PHP_SAPI === 'cli-server') {
    $requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    if ($requestPath === '/' && !str_starts_with($_SERVER['REQUEST_URI'] ?? '', '/api/v1')) {
        header('Location: /app.html', true, 302);
        exit;
    }
    if (is_string($requestPath) && !str_starts_with($requestPath, '/api/v1') && is_file(__DIR__ . $requestPath)) {
        return false;
    }
}

require dirname(__DIR__) . '/bootstrap.php';

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
    $_SERVER['REQUEST_URI'] ?? '/',
    $_GET,
    $headers,
    $_COOKIE,
    (string) file_get_contents('php://input'),
    $_SERVER['REMOTE_ADDR'] ?? 'unknown',
);

try {
    $gateway = Application::create(Runtime::database()->pdo(), Runtime::appConfig());
    $response = $gateway->handle($request);
} catch (\Throwable) {
    $response = Response::json(500, [
        'error' => ['code' => 'internal_error', 'message' => 'The request could not be completed.'],
    ]);
}

$response = new Response($response->status, $response->body, array_merge([
    'content-security-policy' => "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    'x-content-type-options' => 'nosniff',
    'referrer-policy' => 'no-referrer',
], $response->headers));
$response->send();
