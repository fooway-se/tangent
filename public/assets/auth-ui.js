import { ApiFailure, api } from './api.js';
import { credentialNeedsConfirmation, inviteCredentialPresentation } from './credential-flow.js';
export function initAuthUi(options) {
    const doc = options.doc ?? document;
    const request = options.request ?? api;
    const loginForm = required('#login-form');
    const loginAdminHelp = required('#login-admin-help');
    const loginKeyboardHints = required('.login-keyboard-hints');
    const loginStatusMessage = required('#login-status-message');
    const credentialFlow = required('#credential-flow');
    const credentialFlowHeading = required('#credential-flow-heading');
    const credentialFlowDescription = required('#credential-flow-description');
    const credentialFlowError = required('#credential-flow-error');
    const credentialForm = required('#credential-form');
    const credentialPasswordFields = required('#credential-password-fields');
    const credentialPasswordLabel = required('#credential-password-label-text');
    const credentialVerificationField = required('#credential-verification-field');
    const credentialVerificationInput = required('input[name="verification_code"]');
    const credentialConfirmationField = required('#credential-confirmation-field');
    const credentialSubmit = required('#credential-submit');
    const credentialCancel = required('#credential-cancel');
    const listeners = new AbortController();
    let credentialFragment = null;
    let invitePreview = null;
    function required(selector) {
        const element = doc.querySelector(selector);
        if (element === null)
            throw new Error(`Missing authentication element: ${selector}`);
        return element;
    }
    function consumeCredentialFragment() {
        const currentLocation = options.readLocation?.() ?? location;
        const fragment = new URLSearchParams(currentLocation.hash.slice(1));
        const inviteToken = fragment.get('invite');
        const resetToken = fragment.get('reset');
        const credential = inviteToken !== null
            ? { type: 'invite', token: inviteToken }
            : resetToken !== null ? { type: 'reset', token: resetToken } : null;
        if (credential === null || !/^[a-f0-9]{64}$/.test(credential.token))
            return null;
        const url = currentLocation.pathname + currentLocation.search;
        if (options.replaceUrl !== undefined)
            options.replaceUrl(url);
        else
            history.replaceState(null, '', url);
        return credential;
    }
    function resetForms() {
        credentialFragment = null;
        invitePreview = null;
        loginForm.reset();
        loginForm.hidden = false;
        loginAdminHelp.hidden = true;
        credentialFlow.hidden = true;
        credentialFlowError.hidden = true;
        credentialFlowError.textContent = '';
        credentialForm.reset();
        credentialSubmit.hidden = false;
        credentialSubmit.disabled = false;
        setCredentialCancelSecondary();
        loginStatusMessage.hidden = false;
        loginKeyboardHints.hidden = false;
        const password = credentialForm.elements.namedItem('password');
        const confirmation = credentialForm.elements.namedItem('confirmation');
        const verificationCode = credentialForm.elements.namedItem('verification_code');
        credentialPasswordLabel.textContent = 'New password';
        credentialVerificationField.hidden = true;
        credentialVerificationInput.required = false;
        credentialConfirmationField.hidden = false;
        if (password instanceof HTMLInputElement)
            password.required = true;
        if (confirmation instanceof HTMLInputElement)
            confirmation.required = true;
        if (verificationCode instanceof HTMLInputElement)
            verificationCode.value = '';
        credentialPasswordFields.hidden = true;
    }
    function showCredentialFlow() {
        loginForm.hidden = true;
        loginAdminHelp.hidden = true;
        credentialFlow.hidden = false;
        loginStatusMessage.hidden = true;
        loginKeyboardHints.hidden = true;
        credentialFlowError.hidden = true;
        credentialFlowError.textContent = '';
    }
    function setCredentialCancelPrimary() {
        credentialCancel.classList.remove('auth-text-button');
        credentialCancel.classList.add('button', 'button-primary');
        credentialCancel.textContent = 'Back to sign in';
    }
    function setCredentialCancelSecondary() {
        credentialCancel.classList.remove('button', 'button-primary');
        credentialCancel.classList.add('auth-text-button');
        credentialCancel.textContent = 'Back to sign in';
    }
    async function openCredentialFlow(credential) {
        credentialFragment = credential;
        showCredentialFlow();
        if (credential.type === 'reset') {
            credentialFlowHeading.textContent = 'Choose a new password';
            credentialFlowDescription.textContent = 'Your workspace admin provided this one-time reset link. Use at least 15 characters; spaces and Unicode are allowed.';
            credentialPasswordFields.hidden = false;
            credentialPasswordLabel.textContent = 'New password';
            credentialVerificationField.hidden = true;
            credentialVerificationInput.required = false;
            credentialConfirmationField.hidden = false;
            credentialSubmit.textContent = 'Reset password';
            const password = credentialForm.elements.namedItem('password');
            const confirmation = credentialForm.elements.namedItem('confirmation');
            if (password instanceof HTMLInputElement) {
                password.required = true;
                password.autocomplete = 'new-password';
            }
            if (confirmation instanceof HTMLInputElement)
                confirmation.required = true;
            credentialForm.querySelector('input[name="password"]')?.focus();
            return;
        }
        credentialFlowHeading.textContent = 'Accept workspace invite';
        credentialFlowDescription.textContent = 'Checking invite…';
        credentialSubmit.disabled = true;
        try {
            const result = await request('/auth/invites/inspect', {
                method: 'POST',
                body: JSON.stringify({ token: credential.token }),
            });
            invitePreview = result.invite;
            const presentation = inviteCredentialPresentation(result.invite.password_setup_required, result.invite.email_verification_required);
            credentialFlowDescription.textContent = `You’re invited to join “${result.invite.workspace_name}” as a ${result.invite.role}. ${presentation.description}`;
            credentialPasswordFields.hidden = !result.invite.password_required;
            const password = credentialForm.elements.namedItem('password');
            const confirmation = credentialForm.elements.namedItem('confirmation');
            credentialPasswordLabel.textContent = presentation.passwordLabel;
            credentialVerificationField.hidden = !presentation.showVerificationCode;
            credentialVerificationInput.required = presentation.showVerificationCode;
            credentialConfirmationField.hidden = !presentation.showConfirmation;
            if (password instanceof HTMLInputElement)
                password.required = result.invite.password_required;
            if (password instanceof HTMLInputElement)
                password.autocomplete = presentation.passwordAutocomplete;
            if (confirmation instanceof HTMLInputElement)
                confirmation.required = presentation.showConfirmation;
            credentialSubmit.textContent = presentation.submitLabel;
            credentialSubmit.disabled = false;
            if (presentation.showVerificationCode)
                credentialVerificationInput.focus();
            else if (result.invite.password_required)
                credentialForm.querySelector('input[name="password"]')?.focus();
            else
                credentialSubmit.focus();
        }
        catch (error) {
            credentialFlowDescription.textContent = 'This invite link cannot be used.';
            credentialFlowError.textContent = error instanceof Error ? error.message : 'This invite link is invalid or expired.';
            credentialFlowError.hidden = false;
            credentialSubmit.hidden = true;
            setCredentialCancelPrimary();
            credentialCancel.focus();
        }
    }
    credentialCancel.addEventListener('click', () => {
        resetForms();
        loginForm.querySelector('input[name="email"]')?.focus();
    }, { signal: listeners.signal });
    credentialForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const credential = credentialFragment;
        if (credential === null)
            return;
        const values = new FormData(credentialForm);
        const password = values.get('password');
        const confirmation = values.get('confirmation');
        if (!credentialPasswordFields.hidden && credentialNeedsConfirmation(credential.type, invitePreview?.password_setup_required === true) && password !== confirmation) {
            credentialFlowError.textContent = 'The passwords do not match.';
            credentialFlowError.hidden = false;
            credentialForm.querySelector('input[name="confirmation"]')?.focus();
            return;
        }
        credentialSubmit.disabled = true;
        credentialFlowError.hidden = true;
        try {
            if (credential.type === 'invite') {
                const result = await request('/auth/invites/accept', {
                    method: 'POST',
                    body: JSON.stringify({
                        token: credential.token,
                        ...(invitePreview?.password_required ? { password } : {}),
                        ...(invitePreview?.email_verification_required ? { verification_code: values.get('verification_code') } : {}),
                    }),
                });
                credentialFragment = null;
                options.onSignedIn(result.user);
                await options.loadWorkspaces();
                if (result.user.role !== 'guest')
                    await options.loadProjects();
            }
            else {
                await request('/auth/password-reset/complete', {
                    method: 'POST',
                    body: JSON.stringify({ token: credential.token, password }),
                });
                resetForms();
                options.report('Password reset. Sign in with your new password.');
                loginForm.querySelector('input[name="email"]')?.focus();
            }
        }
        catch (error) {
            credentialFlowError.textContent = error instanceof Error ? error.message : 'Could not complete this request.';
            credentialFlowError.hidden = false;
        }
        finally {
            credentialSubmit.disabled = false;
        }
    }, { signal: listeners.signal });
    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        loginAdminHelp.hidden = true;
        const values = new FormData(loginForm);
        try {
            const result = await request('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email: values.get('email'), password: values.get('password') }),
            });
            options.onSignedIn(result.user);
            await options.loadWorkspaces();
            if (result.user.role === 'guest')
                return;
            await options.loadProjects();
        }
        catch (error) {
            if (error instanceof ApiFailure && error.status === 429)
                loginAdminHelp.hidden = false;
            options.report(error instanceof Error ? error.message : 'Could not sign in.', true);
        }
    }, { signal: listeners.signal });
    return {
        consumeCredentialFragment,
        openCredentialFlow,
        resetForms,
        dispose: () => listeners.abort(),
    };
}
