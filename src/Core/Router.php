<?php

declare(strict_types=1);

namespace Tangent\Core;

final class Router
{
    /** @var list<array{method: string, regex: string, names: list<string>, handler: callable, authenticated: bool}> */
    private array $routes = [];

    public function add(string $method, string $path, callable $handler, bool $authenticated = true): void
    {
        $names = [];
        $parts = [];
        foreach (explode('/', trim($path, '/')) as $segment) {
            if (preg_match('/^\{([a-zA-Z_][a-zA-Z0-9_]*)\}$/', $segment, $matches)) {
                $names[] = $matches[1];
                $parts[] = '([^/]+)';
            } else {
                $parts[] = preg_quote($segment, '#');
            }
        }

        $this->routes[] = [
            'method' => strtoupper($method),
            'regex' => '#^/' . implode('/', $parts) . '/?$#',
            'names' => $names,
            'handler' => $handler,
            'authenticated' => $authenticated,
        ];
    }

    /** @return array{handler: callable, authenticated: bool, params: array<string, string>}|null */
    public function match(Request $request): ?array
    {
        foreach ($this->routes as $route) {
            if ($route['method'] !== $request->method || !preg_match($route['regex'], $request->path, $matches)) {
                continue;
            }

            array_shift($matches);
            $params = [];
            foreach ($route['names'] as $index => $name) {
                $params[$name] = rawurldecode($matches[$index]);
            }

            return [
                'handler' => $route['handler'],
                'authenticated' => $route['authenticated'],
                'params' => $params,
            ];
        }

        return null;
    }
}
