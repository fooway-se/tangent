<?php

declare(strict_types=1);

namespace Tangent\Core;

final class PositiveId
{
    public static function parse(string $value, string $notFoundMessage = 'The requested resource was not found.'): int
    {
        if (!ctype_digit($value)) {
            throw new ApiException(404, 'not_found', $notFoundMessage);
        }

        $normalized = ltrim($value, '0');
        if ($normalized === '') {
            throw new ApiException(404, 'not_found', $notFoundMessage);
        }

        $maximum = (string) PHP_INT_MAX;
        if (strlen($normalized) > strlen($maximum)
            || (strlen($normalized) === strlen($maximum) && strcmp($normalized, $maximum) > 0)) {
            throw new ApiException(404, 'not_found', $notFoundMessage);
        }

        return (int) $normalized;
    }
}
