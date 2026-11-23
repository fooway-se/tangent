<?php

declare(strict_types=1);

namespace Tangent\Tests\Unit;

use PHPUnit\Framework\TestCase;
use Tangent\Core\AppConfig;
use Tangent\Core\Runtime;

final class RuntimeRealtimeConfigTest extends TestCase
{
    public function testSseIsDisabledByDefaultAndUsesTheConfiguredGlobalLimit(): void
    {
        $keys = ['TANGENT_SSE_ENABLED', 'TANGENT_SSE_MAX_CONNECTIONS'];
        $previous = [];
        foreach ($keys as $key) {
            $previous[$key] = getenv($key);
            putenv($key);
        }

        try {
            $default = Runtime::appConfig();
            self::assertFalse($default->realtimeStreamEnabled);
            self::assertSame(1, $default->realtimeMaxConnections);

            putenv('TANGENT_SSE_ENABLED=true');
            putenv('TANGENT_SSE_MAX_CONNECTIONS=3');
            $configured = Runtime::appConfig();
            self::assertTrue($configured->realtimeStreamEnabled);
            self::assertSame(3, $configured->realtimeMaxConnections);

            putenv('TANGENT_SSE_MAX_CONNECTIONS=0');
            self::assertSame(0, Runtime::appConfig()->realtimeMaxConnections);
        } finally {
            foreach ($previous as $key => $value) {
                if ($value === false) {
                    putenv($key);
                } else {
                    putenv($key . '=' . $value);
                }
            }
        }
    }

    public function testPrivateConfigCanEnableSseOnHostsWithoutEnvironmentVariableSettings(): void
    {
        $keys = ['TANGENT_SSE_ENABLED', 'TANGENT_SSE_MAX_CONNECTIONS'];
        $previous = [];
        foreach ($keys as $key) {
            $previous[$key] = getenv($key);
            putenv($key);
        }

        try {
            $config = AppConfig::fromEnvironment([
                'realtime_stream_enabled' => true,
                'realtime_max_connections' => 4,
            ]);

            self::assertTrue($config->realtimeStreamEnabled);
            self::assertSame(4, $config->realtimeMaxConnections);
        } finally {
            foreach ($previous as $key => $value) {
                if ($value === false) {
                    putenv($key);
                } else {
                    putenv($key . '=' . $value);
                }
            }
        }
    }

    public function testSseEnvironmentVariablesOverridePrivateConfigValues(): void
    {
        $previousEnabled = getenv('TANGENT_SSE_ENABLED');
        $previousMax = getenv('TANGENT_SSE_MAX_CONNECTIONS');
        putenv('TANGENT_SSE_ENABLED=false');
        putenv('TANGENT_SSE_MAX_CONNECTIONS=2');

        try {
            $config = AppConfig::fromEnvironment([
                'realtime_stream_enabled' => true,
                'realtime_max_connections' => 4,
            ]);

            self::assertFalse($config->realtimeStreamEnabled);
            self::assertSame(2, $config->realtimeMaxConnections);
        } finally {
            foreach (['TANGENT_SSE_ENABLED' => $previousEnabled, 'TANGENT_SSE_MAX_CONNECTIONS' => $previousMax] as $key => $value) {
                if ($value === false) {
                    putenv($key);
                } else {
                    putenv($key . '=' . $value);
                }
            }
        }
    }
}
