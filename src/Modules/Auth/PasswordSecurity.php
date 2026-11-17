<?php

declare(strict_types=1);

namespace Tangent\Modules\Auth;

use Closure;
use Normalizer;

final class PasswordSecurity
{
    public const MIN_LENGTH = 15;
    public const MAX_LENGTH = 128;

    /** @var array<string, true>|null */
    private static ?array $commonPasswords = null;

    private readonly ?Closure $hibpLookup;

    /**
     * The optional callback returns the Pwned Passwords range response for a five-character
     * SHA-1 prefix. It exists so the network check can be tested without sending passwords.
     *
     * @param null|Closure(string):(?string) $hibpLookup
     */
    public function __construct(
        private readonly bool $hibpEnabled = false,
        ?Closure $hibpLookup = null,
    ) {
        $this->hibpLookup = $hibpLookup;
        self::$commonPasswords ??= $this->loadCommonPasswords();
    }

    /** @param array{name?: string, email?: string, workspace?: string} $context */
    public function validate(string $password, array $context = []): ?string
    {
        $normalized = self::normalize($password);
        if ($normalized === null) {
            return 'Password must contain valid Unicode text.';
        }

        $length = mb_strlen($normalized, 'UTF-8');
        if ($length < self::MIN_LENGTH) {
            return 'Password must be at least 15 characters.';
        }
        if ($length > self::MAX_LENGTH) {
            return 'Password must be no more than 128 characters.';
        }

        if ($this->isCommonPassword($normalized)) {
            return 'This password is too common or appears in known leaks. Choose a different password.';
        }
        if ($this->matchesContext($normalized, $context)) {
            return 'This password is too similar to your name, email, workspace, or Tangent. Choose a different password.';
        }
        if ($this->hibpEnabled && $this->isKnownLeaked($normalized)) {
            return 'This password appears in known leaks. Choose a different password.';
        }

        return null;
    }

    public function hash(string $password): string
    {
        $normalized = self::normalize($password);
        if ($normalized === null) {
            throw new \InvalidArgumentException('Password must contain valid Unicode text.');
        }
        return password_hash($normalized, PASSWORD_ARGON2ID);
    }

    public function verify(string $password, string $hash): bool
    {
        $normalized = self::normalize($password);
        return $normalized !== null && password_verify($normalized, $hash);
    }

    public function needsRehash(string $hash): bool
    {
        return password_needs_rehash($hash, PASSWORD_ARGON2ID);
    }

    public static function normalize(string $password): ?string
    {
        if (!mb_check_encoding($password, 'UTF-8')) {
            return null;
        }
        $normalized = Normalizer::normalize($password, Normalizer::FORM_C);
        return is_string($normalized) ? $normalized : null;
    }

    /** @return array<string, true> */
    private function loadCommonPasswords(): array
    {
        $path = dirname(__DIR__, 3) . '/resources/common-passwords.txt';
        $lines = @file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (!is_array($lines) || count($lines) < 9000) {
            throw new \RuntimeException('The bundled common-password blocklist is missing or incomplete.');
        }

        $passwords = [];
        foreach ($lines as $line) {
            $passwords[mb_strtolower(trim($line), 'UTF-8')] = true;
        }
        return $passwords;
    }

    private function isCommonPassword(string $password): bool
    {
        $candidate = self::canonicalVariant($password);
        if (isset(self::$commonPasswords[$candidate])) {
            return true;
        }

        $base = self::stripCommonSuffix($candidate);
        return $base !== $candidate && isset(self::$commonPasswords[$base]);
    }

    /** @param array{name?: string, email?: string, workspace?: string} $context */
    private function matchesContext(string $password, array $context): bool
    {
        $candidate = self::canonicalVariant($password);
        $values = ['tangent'];
        foreach (['name', 'workspace'] as $field) {
            $value = $context[$field] ?? '';
            if (is_string($value)) {
                $values[] = $value;
                foreach (preg_split('/\s+/u', $value, -1, PREG_SPLIT_NO_EMPTY) ?: [] as $word) {
                    $values[] = $word;
                }
            }
        }
        $email = $context['email'] ?? '';
        if (is_string($email)) {
            $values[] = (string) strstr($email, '@', true);
        }

        foreach ($values as $value) {
            $term = self::canonicalVariant($value);
            if (mb_strlen($term, 'UTF-8') < 3) {
                continue;
            }
            if ($candidate === $term) {
                return true;
            }
            if (str_starts_with($candidate, $term)
                && preg_match('/^[0-9]{1,8}$/', substr($candidate, strlen($term))) === 1) {
                return true;
            }
            if (preg_match('/^[0-9]{1,4}' . preg_quote($term, '/') . '$/', $candidate) === 1) {
                return true;
            }
        }
        return false;
    }

    private static function canonicalVariant(string $password): string
    {
        $lower = strtr(mb_strtolower($password, 'UTF-8'), ['@' => 'a', '$' => 's']);
        $compact = preg_replace('/[^\p{L}\p{N}]/u', '', $lower) ?? $lower;
        return preg_replace_callback(
            '/(?<=\p{L})[013457](?=\p{L})/u',
            static fn (array $matches): string => ['0' => 'o', '1' => 'i', '3' => 'e', '4' => 'a', '5' => 's', '7' => 't'][$matches[0]],
            $compact,
        ) ?? $compact;
    }

    private static function stripCommonSuffix(string $candidate): string
    {
        $stripped = preg_replace('/[0-9]{1,8}$/', '', $candidate);
        return is_string($stripped) ? $stripped : $candidate;
    }

    private function isKnownLeaked(string $password): bool
    {
        try {
            $sha1 = strtoupper(sha1($password));
            $prefix = substr($sha1, 0, 5);
            $response = $this->hibpLookup !== null
                ? ($this->hibpLookup)($prefix)
                : $this->fetchPwnedPasswordsRange($prefix);
            if (!is_string($response)) {
                return false;
            }

            $suffix = substr($sha1, 5);
            foreach (preg_split('/\r?\n/', $response) ?: [] as $line) {
                if (preg_match('/^([A-F0-9]{35}):[0-9]+$/i', trim($line), $matches) === 1
                    && hash_equals(strtoupper($suffix), strtoupper($matches[1]))) {
                    return true;
                }
            }
        } catch (\Throwable) {
            // The breach lookup is an optional defense and must fail open.
        }
        return false;
    }

    private function fetchPwnedPasswordsRange(string $prefix): ?string
    {
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'header' => "Add-Padding: true\r\nUser-Agent: Tangent-password-check\r\n",
                'timeout' => 2,
                'ignore_errors' => true,
            ],
            'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
        ]);
        $response = @file_get_contents('https://api.pwnedpasswords.com/range/' . $prefix, false, $context);
        if (!is_string($response)) {
            return null;
        }
        $status = $http_response_header[0] ?? '';
        return str_contains($status, ' 200 ') ? $response : null;
    }
}
