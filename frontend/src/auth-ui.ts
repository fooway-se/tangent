import { ApiFailure, api } from './api.js';
import { credentialNeedsConfirmation, inviteCredentialPresentation } from './credential-flow.js';
import type { CredentialFragment, InvitePreview, LoginResponse, User } from './types.js';

export interface AuthUiController {
  consumeCredentialFragment(): CredentialFragment | null;
  openCredentialFlow(credential: CredentialFragment): Promise<void>;
  resetForms(): void;
  dispose(): void;
}

export function initAuthUi(options: {
  onSignedIn: (user: User) => void;
  loadWorkspaces: () => Promise<void>;
  loadProjects: () => Promise<void>;
  report: (message: string, isError?: boolean) => void;
  request?: typeof api;
  doc?: Document;
  readLocation?: () => Pick<Location, 'hash' | 'pathname' | 'search'>;
  replaceUrl?: (url: string) => void;
}): AuthUiController {
  const doc = options.doc ?? document;
  const request = options.request ?? api;
  const loginForm = required<HTMLFormElement>('#login-form');
  const loginAdminHelp = required<HTMLElement>('#login-admin-help');
  const loginKeyboardHints = required<HTMLElement>('.login-keyboard-hints');
  const loginStatusMessage = required<HTMLElement>('#login-status-message');
  const credentialFlow = required<HTMLElement>('#credential-flow');
  const credentialFlowHeading = required<HTMLHeadingElement>('#credential-flow-heading');
  const credentialFlowDescription = required<HTMLElement>('#credential-flow-description');
  const credentialFlowError = required<HTMLElement>('#credential-flow-error');
  const credentialForm = required<HTMLFormElement>('#credential-form');
  const credentialPasswordFields = required<HTMLElement>('#credential-password-fields');
  const credentialPasswordLabel = required<HTMLElement>('#credential-password-label-text');
  const credentialVerificationField = required<HTMLElement>('#credential-verification-field');
  const credentialVerificationInput = required<HTMLInputElement>('input[name="verification_code"]');
  const credentialConfirmationField = required<HTMLElement>('#credential-confirmation-field');
  const credentialSubmit = required<HTMLButtonElement>('#credential-submit');
  const credentialCancel = required<HTMLButtonElement>('#credential-cancel');
  const listeners = new AbortController();
  let credentialFragment: CredentialFragment | null = null;
  let invitePreview: InvitePreview | null = null;

  function required<T extends Element>(selector: string): T {
    const element = doc.querySelector<T>(selector);
    if (element === null) throw new Error(`Missing authentication element: ${selector}`);
    return element;
  }

  function consumeCredentialFragment(): CredentialFragment | null {
    const currentLocation = options.readLocation?.() ?? location;
    const fragment = new URLSearchParams(currentLocation.hash.slice(1));
    const inviteToken = fragment.get('invite');
    const resetToken = fragment.get('reset');
    const credential = inviteToken !== null
      ? { type: 'invite' as const, token: inviteToken }
      : resetToken !== null ? { type: 'reset' as const, token: resetToken } : null;
    if (credential === null || !/^[a-f0-9]{64}$/.test(credential.token)) return null;
    const url = currentLocation.pathname + currentLocation.search;
    if (options.replaceUrl !== undefined) options.replaceUrl(url);
    else history.replaceState(null, '', url);
    return credential;
  }

  function resetForms(): void {
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
    if (password instanceof HTMLInputElement) password.required = true;
    if (confirmation instanceof HTMLInputElement) confirmation.required = true;
    if (verificationCode instanceof HTMLInputElement) verificationCode.value = '';
    credentialPasswordFields.hidden = true;
  }

  function showCredentialFlow(): void {
    loginForm.hidden = true;
    loginAdminHelp.hidden = true;
    credentialFlow.hidden = false;
    loginStatusMessage.hidden = true;
    loginKeyboardHints.hidden = true;
    credentialFlowError.hidden = true;
    credentialFlowError.textContent = '';
  }

  function setCredentialCancelPrimary(): void {
    credentialCancel.classList.remove('auth-text-button');
    credentialCancel.classList.add('button', 'button-primary');
    credentialCancel.textContent = 'Back to sign in';
  }

  function setCredentialCancelSecondary(): void {
    credentialCancel.classList.remove('button', 'button-primary');
    credentialCancel.classList.add('auth-text-button');
    credentialCancel.textContent = 'Back to sign in';
  }

  async function openCredentialFlow(credential: CredentialFragment): Promise<void> {
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
      if (confirmation instanceof HTMLInputElement) confirmation.required = true;
      credentialForm.querySelector<HTMLInputElement>('input[name="password"]')?.focus();
      return;
    }

    credentialFlowHeading.textContent = 'Accept workspace invite';
    credentialFlowDescription.textContent = 'Checking invite…';
    credentialSubmit.disabled = true;
    try {
      const result = await request<{ invite: InvitePreview }>('/auth/invites/inspect', {
        method: 'POST',
        body: JSON.stringify({ token: credential.token }),
      });
      invitePreview = result.invite;
      const presentation = inviteCredentialPresentation(
        result.invite.password_setup_required,
        result.invite.email_verification_required,
      );
      credentialFlowDescription.textContent = `You’re invited to join “${result.invite.workspace_name}” as a ${result.invite.role}. ${presentation.description}`;
      credentialPasswordFields.hidden = !result.invite.password_required;
      const password = credentialForm.elements.namedItem('password');
      const confirmation = credentialForm.elements.namedItem('confirmation');
      credentialPasswordLabel.textContent = presentation.passwordLabel;
      credentialVerificationField.hidden = !presentation.showVerificationCode;
      credentialVerificationInput.required = presentation.showVerificationCode;
      credentialConfirmationField.hidden = !presentation.showConfirmation;
      if (password instanceof HTMLInputElement) password.required = result.invite.password_required;
      if (password instanceof HTMLInputElement) password.autocomplete = presentation.passwordAutocomplete;
      if (confirmation instanceof HTMLInputElement) confirmation.required = presentation.showConfirmation;
      credentialSubmit.textContent = presentation.submitLabel;
      credentialSubmit.disabled = false;
      if (presentation.showVerificationCode) credentialVerificationInput.focus();
      else if (result.invite.password_required) credentialForm.querySelector<HTMLInputElement>('input[name="password"]')?.focus();
      else credentialSubmit.focus();
    } catch (error) {
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
    loginForm.querySelector<HTMLInputElement>('input[name="email"]')?.focus();
  }, { signal: listeners.signal });
  credentialForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const credential = credentialFragment;
    if (credential === null) return;
    const values = new FormData(credentialForm);
    const password = values.get('password');
    const confirmation = values.get('confirmation');
    if (!credentialPasswordFields.hidden && credentialNeedsConfirmation(
      credential.type,
      invitePreview?.password_setup_required === true,
    ) && password !== confirmation) {
      credentialFlowError.textContent = 'The passwords do not match.';
      credentialFlowError.hidden = false;
      credentialForm.querySelector<HTMLInputElement>('input[name="confirmation"]')?.focus();
      return;
    }
    credentialSubmit.disabled = true;
    credentialFlowError.hidden = true;
    try {
      if (credential.type === 'invite') {
        const result = await request<LoginResponse>('/auth/invites/accept', {
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
        if (result.user.role !== 'guest') await options.loadProjects();
      } else {
        await request('/auth/password-reset/complete', {
          method: 'POST',
          body: JSON.stringify({ token: credential.token, password }),
        });
        resetForms();
        options.report('Password reset. Sign in with your new password.');
        loginForm.querySelector<HTMLInputElement>('input[name="email"]')?.focus();
      }
    } catch (error) {
      credentialFlowError.textContent = error instanceof Error ? error.message : 'Could not complete this request.';
      credentialFlowError.hidden = false;
    } finally {
      credentialSubmit.disabled = false;
    }
  }, { signal: listeners.signal });

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginAdminHelp.hidden = true;
    const values = new FormData(loginForm);
    try {
      const result = await request<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: values.get('email'), password: values.get('password') }),
      });
      options.onSignedIn(result.user);
      await options.loadWorkspaces();
      if (result.user.role === 'guest') return;
      await options.loadProjects();
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 429) loginAdminHelp.hidden = false;
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
