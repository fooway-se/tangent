export interface InviteCredentialPresentation {
  passwordAutocomplete: 'new-password' | 'current-password';
  showVerificationCode: boolean;
  showConfirmation: boolean;
  passwordLabel: string;
  submitLabel: string;
  description: string;
}

export function inviteCredentialPresentation(emailVerificationRequired: boolean): InviteCredentialPresentation {
  if (!emailVerificationRequired) {
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
    showVerificationCode: true,
    showConfirmation: true,
    passwordLabel: 'New password',
    submitLabel: 'Verify email and join',
    description: 'Enter the code sent to your email, then choose a password to join the workspace.',
  };
}

export function credentialNeedsConfirmation(type: 'invite' | 'reset', emailVerificationRequired = false): boolean {
  return type === 'reset' || emailVerificationRequired;
}
