<?php

declare(strict_types=1);

namespace Tangent\Tests\Unit;

use PHPUnit\Framework\TestCase;
use Tangent\Modules\Auth\PasswordSecurity;

final class PasswordSecurityTest extends TestCase
{
    private PasswordSecurity $passwords;

    protected function setUp(): void
    {
        $this->passwords = new PasswordSecurity();
    }

    public function testPasswordLengthUsesUnicodeCodePointsAndAllowsSpacesAndSymbols(): void
    {
        self::assertNotNull($this->passwords->validate(str_repeat('x', 14)));
        self::assertNull($this->passwords->validate(str_repeat('🦉', 15)));
        self::assertNull($this->passwords->validate('unique pass phrase with spaces 42!'));
        self::assertNull($this->passwords->validate(str_repeat('x', 128)));
        self::assertNotNull($this->passwords->validate(str_repeat('x', 129)));
    }

    public function testBlocklistAndContextVariantsAreRejectedAsWholePasswords(): void
    {
        self::assertNotNull($this->passwords->validate('Password1234567!'));
        self::assertNotNull($this->passwords->validate('pa55word1234567!!'));
        self::assertNotNull($this->passwords->validate('Tangent2026!!'));
        self::assertNotNull($this->passwords->validate('niklas2026!!', [
            'name' => 'Niklas Example',
            'email' => 'niklas@example.test',
            'workspace' => 'Northstar',
        ]));
        self::assertNotNull($this->passwords->validate('northstar2026!!', [
            'name' => 'Niklas Example',
            'email' => 'niklas@example.test',
            'workspace' => 'Northstar',
        ]));
        self::assertNull($this->passwords->validate('northstar is shipping a useful feature', [
            'name' => 'Niklas Example',
            'email' => 'niklas@example.test',
            'workspace' => 'Northstar',
        ]));
    }

    public function testPasswordsAreArgon2idHashedAndUnicodeIsNfcNormalized(): void
    {
        $composed = 'Long 🦉 café river lantern';
        $decomposed = "Long 🦉 cafe\u{0301} river lantern";
        $hash = $this->passwords->hash($decomposed);

        self::assertSame('argon2id', password_get_info($hash)['algoName']);
        self::assertTrue($this->passwords->verify($composed, $hash));
        self::assertFalse($this->passwords->verify($composed . '!', $hash));
        self::assertTrue($this->passwords->needsRehash(password_hash('legacy password', PASSWORD_BCRYPT)));
        self::assertFalse($this->passwords->needsRehash($hash));
    }

    public function testLongPasswordsAreNotTruncatedAtBcryptByteLimit(): void
    {
        $first = str_repeat('🦉', 20) . 'one';
        $second = str_repeat('🦉', 20) . 'two';
        $hash = $this->passwords->hash($first);

        self::assertTrue($this->passwords->verify($first, $hash));
        self::assertFalse($this->passwords->verify($second, $hash));
    }

    public function testOptionalPwnedPasswordCheckSendsOnlyTheFiveCharacterHashPrefix(): void
    {
        $password = 'a phrase that is definitely unique 7391';
        $expectedHash = strtoupper(sha1(\Tangent\Modules\Auth\PasswordSecurity::normalize($password)));
        $observedPrefix = null;
        $checker = new PasswordSecurity(true, static function (string $prefix) use (&$observedPrefix, $expectedHash): string {
            $observedPrefix = $prefix;
            return substr($expectedHash, 5) . ":2\r\n";
        });

        $reason = $checker->validate($password);
        self::assertSame(substr($expectedHash, 0, 5), $observedPrefix);
        self::assertStringContainsString('known leaks', (string) $reason);
    }

    public function testOptionalPwnedPasswordCheckFailsOpenAndCanBeDisabled(): void
    {
        $password = 'another phrase that is surely unique 9274';
        $failed = new PasswordSecurity(true, static fn (string $prefix): ?string => null);
        self::assertNull($failed->validate($password));

        $called = false;
        $disabled = new PasswordSecurity(false, static function (string $prefix) use (&$called): ?string {
            $called = true;
            return null;
        });
        self::assertNull($disabled->validate($password));
        self::assertFalse($called);
    }
}
