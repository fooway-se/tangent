export interface InviteCredentialPresentation {
  passwordAutocomplete: 'new-password' | 'current-password';
  showVerificationCode: boolean;
  showConfirmation: boolean;
  passwordLabel: string;
  submitLabel: string;
  description: string;
}

export function inviteCredentialPresentation(
  passwordSetupRequired: boolean,
  emailVerificationRequired = false,
): InviteCredentialPresentation {
  if (!passwordSetupRequired) {
    return {
      passwordAutocomplete: 'current-password',
      showVerificationCode: false,
      showConfirmation: false,
      passwordLabel: 'Current account password',
      submitLabel: 'Verify password and join',
      description: 'Enter your current account password to join the workspace.',
    };
  }
  return {
    passwordAutocomplete: 'new-password',
    showVerificationCode: emailVerificationRequired,
    showConfirmation: true,
    passwordLabel: 'New password',
    submitLabel: emailVerificationRequired ? 'Verify email and join' : 'Create account and join',
    description: emailVerificationRequired
      ? 'Enter the code sent to your email, then choose a password to join the workspace.'
      : 'Choose a password to create your Tangent account and join the workspace.',
  };
}

export function credentialNeedsConfirmation(type: 'invite' | 'reset', passwordSetupRequired = false): boolean {
  return type === 'reset' || passwordSetupRequired;
}
