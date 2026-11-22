import assert from 'node:assert/strict';
import test from 'node:test';
import {
  credentialNeedsConfirmation,
  inviteCredentialPresentation,
} from '../../public/assets/credential-flow.js';

test('new invitees set a password after opening their emailed invitation link', () => {
  assert.deepEqual(inviteCredentialPresentation(true), {
    passwordAutocomplete: 'new-password',
    showVerificationCode: false,
    showConfirmation: true,
    passwordLabel: 'New password',
    submitLabel: 'Create account and join',
    description: 'Choose a password to create your Tangent account and join the workspace.',
  });
  assert.equal(credentialNeedsConfirmation('invite', true), true);
});

test('legacy invites can still require their existing verification code', () => {
  assert.deepEqual(inviteCredentialPresentation(true, true), {
    passwordAutocomplete: 'new-password',
    showVerificationCode: true,
    showConfirmation: true,
    passwordLabel: 'New password',
    submitLabel: 'Verify email and join',
    description: 'Enter the code sent to your email, then choose a password to join the workspace.',
  });
});

test('existing accounts prove identity with their current password', () => {
  assert.deepEqual(inviteCredentialPresentation(false), {
    passwordAutocomplete: 'current-password',
    showVerificationCode: false,
    showConfirmation: false,
    passwordLabel: 'Current account password',
    submitLabel: 'Verify password and join',
    description: 'Enter your current account password to join the workspace.',
  });
  assert.equal(credentialNeedsConfirmation('invite', false), false);
});

test('password reset still asks users to confirm the new password', () => {
  assert.equal(credentialNeedsConfirmation('reset'), true);
});
