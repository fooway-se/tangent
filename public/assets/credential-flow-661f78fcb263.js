export function inviteCredentialPresentation(passwordSetupRequired, emailVerificationRequired = false) {
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
export function credentialNeedsConfirmation(type, passwordSetupRequired = false) {
    return type === 'reset' || passwordSetupRequired;
}
