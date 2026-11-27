export function createLogoutController(options) {
    let pending = false;
    return async () => {
        if (pending)
            return;
        pending = true;
        options.onPending(true);
        try {
            await options.logout();
            options.onSignedOut();
        }
        catch (error) {
            if (options.isExpiredSession(error)) {
                options.onSignedOut();
            }
            else {
                options.onFailure(error);
            }
        }
        finally {
            pending = false;
            options.onPending(false);
        }
    };
}
