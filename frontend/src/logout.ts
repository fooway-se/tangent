export interface LogoutOptions {
  logout: () => Promise<unknown>;
  onSignedOut: () => void;
  onFailure: (error: unknown) => void;
  onPending: (pending: boolean) => void;
  isExpiredSession: (error: unknown) => boolean;
}

export function createLogoutController(options: LogoutOptions): () => Promise<void> {
  let pending = false;

  return async () => {
    if (pending) return;
    pending = true;
    options.onPending(true);
    try {
      await options.logout();
      options.onSignedOut();
    } catch (error) {
      if (options.isExpiredSession(error)) {
        options.onSignedOut();
      } else {
        options.onFailure(error);
      }
    } finally {
      pending = false;
      options.onPending(false);
    }
  };
}
