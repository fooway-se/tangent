export function inviteCredentialPresentation(emailVerificationRequired) {
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
export function credentialNeedsConfirmation(type, emailVerificationRequired = false) {
    return type === 'reset' || emailVerificationRequired;
}
