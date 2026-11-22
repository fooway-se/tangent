<?php

declare(strict_types=1);

namespace Tangent\Tests\Unit;

use PHPUnit\Framework\TestCase;
use Tangent\Core\ApiException;
use Tangent\Core\PositiveId;

final class PositivePathIdTest extends TestCase
{
    public function testEveryRouteParsesTheSameBoundedPositiveIdSyntax(): void
    {
        $valid = [
            '1' => 1,
            '0007' => 7,
            (string) PHP_INT_MAX => PHP_INT_MAX,
        ];
        $invalid = ['', '0', '000', '+1', '-1', '1x', (string) PHP_INT_MAX . '0'];

        foreach ($valid as $input => $expected) {
            self::assertSame($expected, PositiveId::parse((string) $input), 'input ' . $input);
        }
        foreach ($invalid as $input) {
            try {
                PositiveId::parse($input);
                self::fail('Accepted invalid ID syntax: ' . $input);
            } catch (ApiException $exception) {
                self::assertSame(404, $exception->status);
            }
        }
    }
}
