import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const installer = await readFile(new URL('../../public/install.php', import.meta.url), 'utf8');

test('installer collects a required sender email address', () => {
  assert.match(installer, /<label>Sender email address\s*<input name="mail_from" type="email" required maxlength="254"/);
  assert.match(installer, /Used as the From address for workspace invitations and password recovery emails\./);
});
